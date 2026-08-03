import { afterEach, describe, expect, it } from 'vitest';

import {
  GenericExtractionEngine,
  GenericWebCollector,
  type Clock,
  type Logger,
  type UrlSafetyValidator,
} from '../../src/application/index.js';
import {
  CheerioDocumentExtractor,
  HttpPageAcquirer,
  NodeFetchHttpClient,
  PlaywrightBrowserRenderer,
  PublicUrlSafetyValidator,
} from '../../src/infrastructure/index.js';
import { FixtureSiteServer } from '../helpers/fixture-site-server.js';

const clock: Clock = { now: () => new Date('2026-07-29T12:00:00Z') };
const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
let server: FixtureSiteServer | undefined;
let browser: PlaywrightBrowserRenderer | undefined;

afterEach(async () => {
  await browser?.close();
  browser = undefined;
  await server?.close();
  server = undefined;
});

describe('Playwright generic fallback', () => {
  it('rejects external fallback before launching Chromium even in forced test mode', async () => {
    let launches = 0;
    const safety = new PublicUrlSafetyValidator({
      resolve: () => Promise.resolve(['93.184.216.34']),
    });
    browser = new PlaywrightBrowserRenderer(safety, clock, () => {
      launches += 1;
      return Promise.reject(new Error('browser must not launch'));
    });

    for (const allowTestLoopback of [false, true])
      await expect(
        browser.render({
          url: 'https://external.synthetic.invalid/jobs',
          timeoutMs: 3_000,
          maximumHtmlBytes: 1024,
          allowTestLoopback,
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({ code: 'BROWSER_FALLBACK_NOT_PERMITTED' });
    expect(launches).toBe(0);
  });

  it('renders a local app shell and reuses the generic HTML extractor', async () => {
    server = new FixtureSiteServer({
      '/careers': {
        body: '<!doctype html><div id="root"></div><script src="/app.js"></script>',
      },
      '/app.js': {
        headers: { 'content-type': 'application/javascript' },
        body: `document.querySelector('#root').innerHTML = '<main><h1>Browser Engineer</h1><section class="job-description"><p>Rendered locally by synthetic JavaScript.</p></section><a href="/apply">Apply</a></main>';`,
      },
    });
    const origin = await server.start();
    const safety = new PublicUrlSafetyValidator();
    browser = new PlaywrightBrowserRenderer(safety, clock);
    const engine = new GenericExtractionEngine(
      new HttpPageAcquirer(new NodeFetchHttpClient(safety)),
      new CheerioDocumentExtractor(),
      browser,
      logger,
    );
    const collector = new GenericWebCollector('generic-page', engine, clock);
    const result = await collector.collect(
      {
        id: 'browser-fixture',
        type: 'generic-page',
        displayName: 'Browser Fixture',
        enabled: true,
        company: 'Fixture Company',
        requestTimeoutMs: 2_000,
        requestsPerSecond: 10,
        url: `${origin}/careers`,
        browserTimeoutMs: 10_000,
        maxDiscoveredLinks: 10,
        maxTraversalDepth: 0,
        allowBrowserFallback: true,
        allowTestLoopback: true,
      },
      {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      },
    );
    expect(result).toMatchObject({
      candidates: [{ job: { title: 'Browser Engineer' } }],
      diagnostics: { browserFallbacks: 1 },
    });
  });

  it('applies URL and safe-method policy to popups and script requests', async () => {
    server = new FixtureSiteServer({
      '/careers': {
        body: '<!doctype html><div id="root"></div><script src="/app.js"></script>',
      },
      '/app.js': {
        headers: { 'content-type': 'application/javascript' },
        body: `
          window.open('/blocked-popup');
          void fetch('/mutation', { method: 'POST', body: 'side-effect' });
          document.querySelector('#root').innerHTML = '<main><h1>Safe Browser Engineer</h1><section class="job-description">Rendered safely.</section></main>';
        `,
      },
      '/blocked-popup': { body: '<p>must not load</p>' },
      '/mutation': { body: 'must not run' },
    });
    const origin = await server.start();
    const delegate = new PublicUrlSafetyValidator();
    const safety: UrlSafetyValidator = {
      validate(value, allowTestLoopback) {
        if (new URL(value).pathname === '/blocked-popup')
          return Promise.reject(new Error('synthetic blocked target'));
        return delegate.validate(value, allowTestLoopback);
      },
    };
    browser = new PlaywrightBrowserRenderer(safety, clock);

    await browser.render({
      url: `${origin}/careers`,
      timeoutMs: 10_000,
      maximumHtmlBytes: 1024 * 1024,
      allowTestLoopback: true,
      signal: new AbortController().signal,
    });

    expect(server.getRequests()).not.toContainEqual(
      expect.objectContaining({ url: '/blocked-popup' }),
    );
    expect(server.getRequests()).not.toContainEqual(
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
