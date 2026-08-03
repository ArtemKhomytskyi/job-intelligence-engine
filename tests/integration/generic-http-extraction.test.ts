import { readFile } from 'node:fs/promises';
import { createServer as createHttpsServer } from 'node:https';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';

import {
  GenericExtractionEngine,
  GenericWebCollector,
  type BrowserPageRenderer,
  type Clock,
  type Logger,
} from '../../src/application/index.js';
import {
  CheerioDocumentExtractor,
  HttpPageAcquirer,
  NodeFetchHttpClient,
  NodeConnectionBoundTransport,
  PublicUrlSafetyValidator,
} from '../../src/infrastructure/index.js';
import { FixtureSiteServer } from '../helpers/fixture-site-server.js';

const clock: Clock = { now: () => new Date('2026-07-29T12:00:00Z') };
const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
const noBrowser: BrowserPageRenderer = {
  render: () => Promise.reject(new Error('Browser should not be used.')),
  close: () => Promise.resolve(),
};
let server: FixtureSiteServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('controlled generic HTTP extraction', () => {
  it('preserves the original TLS hostname, SNI, and certificate verification', async () => {
    const [key, certificate] = await Promise.all([
      readFile('tests/fixtures/tls/fixture.synthetic.test-key.pem', 'utf8'),
      readFile('tests/fixtures/tls/fixture.synthetic.test-cert.pem', 'utf8'),
    ]);
    const servernameValues: string[] = [];
    const tlsServer = createHttpsServer(
      { key, cert: certificate },
      (_request, response) => response.end('secure response'),
    );
    tlsServer.on('secureConnection', (socket) => {
      servernameValues.push(
        typeof socket.servername === 'string' ? socket.servername : '',
      );
    });
    tlsServer.listen(0, '127.0.0.1');
    await once(tlsServer, 'listening');
    const address = tlsServer.address();
    if (address === null || typeof address === 'string')
      throw new Error('TLS fixture did not expose a TCP address.');
    const validator = new PublicUrlSafetyValidator({
      resolve: () => Promise.resolve(['127.0.0.1']),
    });
    const http = new NodeFetchHttpClient(
      validator,
      new NodeConnectionBoundTransport(certificate),
    );
    const base = {
      timeoutMs: 2_000,
      signal: new AbortController().signal,
      rateLimitKey: 'tls-fixture',
      minimumIntervalMs: 0,
      allowTestLoopback: true,
    };
    try {
      await expect(
        http.getText({
          ...base,
          url: `https://fixture.synthetic.test:${address.port}/secure`,
        }),
      ).resolves.toMatchObject({ data: 'secure response' });
      expect(servernameValues).toEqual(['fixture.synthetic.test']);

      await expect(
        http.getText({
          ...base,
          url: `https://wrong.synthetic.test:${address.port}/secure`,
        }),
      ).rejects.toMatchObject({ code: 'HTTP_NETWORK_ERROR' });
    } finally {
      tlsServer.close();
      await once(tlsServer, 'close');
    }
  });

  it('binds a synthetic hostname to the validated loopback address and preserves Host', async () => {
    server = new FixtureSiteServer({ '/bound': { body: 'bound response' } });
    const origin = new URL(await server.start());
    let resolutions = 0;
    const safety = new PublicUrlSafetyValidator({
      resolve(hostname) {
        expect(hostname).toBe('fixture.synthetic.test');
        resolutions += 1;
        return Promise.resolve(
          resolutions === 1 ? ['127.0.0.1'] : ['10.0.0.1'],
        );
      },
    });
    const url = `http://fixture.synthetic.test:${origin.port}/bound`;
    const result = await new NodeFetchHttpClient(safety).getText({
      url,
      timeoutMs: 2_000,
      signal: new AbortController().signal,
      rateLimitKey: 'fixture',
      minimumIntervalMs: 0,
      allowTestLoopback: true,
    });
    expect(result.data).toBe('bound response');
    expect(resolutions).toBe(1);
    expect(server.getRequests()).toContainEqual({
      method: 'GET',
      url: '/bound',
      host: `fixture.synthetic.test:${origin.port}`,
    });
  });

  it('cancels oversized and slow loopback responses', async () => {
    server = new FixtureSiteServer({
      '/oversized': { body: 'x'.repeat(20_000) },
      '/slow': { body: 'late', delayMs: 250 },
    });
    const origin = await server.start();
    const http = new NodeFetchHttpClient(new PublicUrlSafetyValidator());
    const base = {
      signal: new AbortController().signal,
      rateLimitKey: 'fixture',
      minimumIntervalMs: 0,
      allowTestLoopback: true,
    };
    await expect(
      http.getText({
        ...base,
        url: `${origin}/oversized`,
        timeoutMs: 2_000,
        maximumResponseBytes: 1_024,
      }),
    ).rejects.toMatchObject({ code: 'HTML_RESPONSE_TOO_LARGE' });
    await expect(
      http.getText({ ...base, url: `${origin}/slow`, timeoutMs: 25 }),
    ).rejects.toMatchObject({ code: 'HTTP_TIMEOUT' });
  });

  it('follows bounded redirects and extracts a static JSON-LD detail page', async () => {
    const detail = await fixture('json-ld-single.html');
    server = new FixtureSiteServer({
      '/start': {
        status: 302,
        headers: { location: '/jobs/platform-engineer' },
      },
      '/jobs/platform-engineer': { body: detail },
    });
    const origin = await server.start();
    const result = await collector('generic-page').collect(
      source('generic-page', `${origin}/start`),
      {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      },
    );
    expect(result).toMatchObject({
      requestCount: 2,
      rawJobCount: 1,
      invalidJobCount: 0,
    });
    expect(result.candidates[0]?.canonicalUrl).toBe(
      `${origin}/jobs/platform-engineer`,
    );
  });

  it('discovers and independently extracts bounded listing detail links', async () => {
    server = new FixtureSiteServer({
      '/careers': { body: await fixture('semantic-job-list.html') },
      '/jobs/one': { body: semantic('One Engineer') },
      '/jobs/two': { body: semantic('Two Manager') },
    });
    const origin = await server.start();
    const result = await collector('generic-job-list').collect(
      source('generic-job-list', `${origin}/careers`),
      {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      },
    );
    expect(result.candidates.map((candidate) => candidate.job.title)).toEqual([
      'One Engineer',
      'Two Manager',
    ]);
    expect(result.diagnostics).toMatchObject({
      pagesFetched: 3,
      linksDiscovered: 2,
    });
  });

  it('honors an explicitly bounded second traversal depth', async () => {
    server = new FixtureSiteServer({
      '/careers': {
        body: '<main><a href="/jobs/engineering">Engineering roles</a></main>',
      },
      '/jobs/engineering': {
        body: '<main><a href="/positions/deep-engineer">Deep Engineer</a></main>',
      },
      '/positions/deep-engineer': { body: semantic('Deep Engineer') },
    });
    const origin = await server.start();
    const result = await collector('generic-job-list').collect(
      {
        ...source('generic-job-list', `${origin}/careers`),
        maxTraversalDepth: 2,
      },
      {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      },
    );
    expect(result.candidates[0]?.job.title).toBe('Deep Engineer');
    expect(result.diagnostics).toMatchObject({
      pagesFetched: 3,
      linksDiscovered: 2,
    });
  });
});

function collector(
  type: 'generic-page' | 'generic-job-list',
): GenericWebCollector {
  const http = new NodeFetchHttpClient(new PublicUrlSafetyValidator());
  return new GenericWebCollector(
    type,
    new GenericExtractionEngine(
      new HttpPageAcquirer(http),
      new CheerioDocumentExtractor(),
      noBrowser,
      logger,
    ),
    clock,
  );
}

function source(type: 'generic-page' | 'generic-job-list', url: string) {
  return {
    id: 'local-generic',
    type,
    displayName: 'Local Generic',
    enabled: true,
    company: 'Fixture Company',
    requestTimeoutMs: 2_000,
    requestsPerSecond: 10,
    url,
    browserTimeoutMs: 3_000,
    maxDiscoveredLinks: 10,
    maxTraversalDepth: type === 'generic-job-list' ? 1 : 0,
    allowBrowserFallback: false,
    allowTestLoopback: true,
  } as const;
}

function semantic(title: string): string {
  return `<!doctype html><main><h1>${title}</h1><section class="job-description"><p>Meaningful synthetic description for ${title}.</p></section><a href="/apply">Apply</a></main>`;
}

async function fixture(name: string): Promise<string> {
  return readFile(`tests/fixtures/generic/${name}`, 'utf8');
}
