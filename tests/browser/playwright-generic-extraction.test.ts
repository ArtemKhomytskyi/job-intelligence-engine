import { afterEach, describe, expect, it } from 'vitest';

import {
  GenericExtractionEngine,
  GenericWebCollector,
  type Clock,
  type Logger,
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
      new HttpPageAcquirer(new NodeFetchHttpClient(fetch, safety)),
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
});
