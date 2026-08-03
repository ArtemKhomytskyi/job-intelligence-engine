import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  GenericExtractionEngine,
  GenericWebCollector,
  type BrowserPageRenderer,
  type Clock,
  type HtmlPageAcquirer,
  type Logger,
} from '../../src/application/index.js';
import {
  CheerioDocumentExtractor,
  PublicUrlSafetyValidator,
  shouldBlockBrowserResource,
  type AddressResolver,
} from '../../src/infrastructure/index.js';

const extractor = new CheerioDocumentExtractor();
const clock: Clock = { now: () => new Date('2026-07-29T12:00:00Z') };
const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

describe('generic document extraction', () => {
  it('decodes JSON-LD objects, graphs, arrays, and malformed block isolation', async () => {
    const single = extractor.extract(
      await fixture('json-ld-single.html'),
      'https://example.test/jobs/platform-engineer',
      'Fallback',
      50,
    );
    expect(single.jobs[0]).toMatchObject({
      title: 'Platform Engineer',
      company: 'Example Systems',
      canonicalUrl: 'https://example.test/jobs/platform-engineer',
      externalId: 'platform-1',
      locationText: 'Berlin, DE',
      strategy: 'json-ld',
    });
    const graph = extractor.extract(
      await fixture('json-ld-graph.html'),
      'https://example.test/jobs/graph',
      'Fallback',
      50,
    );
    expect(graph.jobs[0]).toMatchObject({
      title: 'Graph Engineer',
      company: 'Graph Labs',
    });
    const mixed = extractor.extract(
      await fixture('json-ld-malformed-and-valid.html'),
      'https://example.test/careers',
      'Fallback',
      50,
    );
    expect(mixed.jobs).toHaveLength(1);
    expect(mixed.warnings).toContain('A malformed JSON-LD block was skipped.');
  });

  it('extracts semantic fields and cleans executable/noisy HTML', async () => {
    const result = extractor.extract(
      await fixture('semantic-job-page.html'),
      'https://example.test/jobs/product-engineer',
      'Fallback',
      50,
    );
    expect(result.jobs[0]).toMatchObject({
      title: 'Product Engineer',
      company: 'Semantic Works',
      locationText: 'Remote Europe',
      employmentType: 'Full-time',
      applicationUrl: 'https://example.test/jobs/product-engineer/apply',
      strategy: 'semantic-html',
    });
    expect(result.jobs[0]?.description).toContain(
      'Build useful products & collaborate.',
    );
    expect(result.jobs[0]?.description).not.toContain('steal');
    expect(result.jobs[0]?.description).not.toContain('Navigation noise');
  });

  it('discovers deterministic safe links, detects ATS hosts, app shells, and block pages', async () => {
    const list = extractor.extract(
      await fixture('semantic-job-list.html'),
      'https://example.test/careers',
      'Example',
      1,
    );
    expect(list.links).toEqual([
      { url: 'https://example.test/jobs/one', reason: 'job-like-path' },
    ]);
    const ats = extractor.extract(
      '<main><a href="https://jobs.lever.co/example/one">Engineer</a></main>',
      'https://example.test/careers',
      'Example',
      10,
    );
    expect(ats.atsDetections[0]).toMatchObject({ provider: 'lever' });
    const shell = extractor.extract(
      await fixture('js-shell.html'),
      'https://example.test/careers',
      'Example',
      10,
    );
    expect(shell.browserFallbackReason).toBe('client-rendered-app-shell');
    const captcha = extractor.extract(
      await fixture('captcha-page.html'),
      'https://example.test/careers',
      'Example',
      10,
    );
    expect(captcha.blockedPageReason).toBe('captcha');
  });

  it('decodes optional Schema.org variants and rejects unsafe canonical choices', () => {
    const result = extractor.extract(
      `<!doctype html>
      <link rel="canonical" href="https://evil.example/jobs/wrong">
      <script type="application/ld+json">${JSON.stringify([
        {
          '@type': ['Thing', 'JobPosting'],
          title: 'Variant Engineer',
          hiringOrganization: 'Variant Labs',
          description: '<p>Build variants.</p>',
          mainEntityOfPage: { '@id': '/jobs/variant' },
          applicationUrl: 'https://jobs.lever.co/variant/one',
          identifier: 42,
          employmentType: ['FULL_TIME', 'CONTRACTOR'],
          jobLocation: [
            { address: { addressLocality: 'Paris', addressCountry: 'FR' } },
            'Remote',
          ],
          datePosted: '2026-07-01',
          validThrough: 'not-a-date',
          directApply: true,
          industry: 'Software',
          occupationalCategory: 'Engineering',
          baseSalary: { currency: 'EUR', value: 100 },
        },
        { '@type': 'JobPosting', title: 'Incomplete' },
      ])}</script>`,
      'https://example.test/jobs/variant',
      'Fallback',
      10,
    );
    expect(result.jobs[0]).toMatchObject({
      canonicalUrl: 'https://example.test/jobs/variant',
      applicationUrl: 'https://jobs.lever.co/variant/one',
      externalId: '42',
      employmentType: 'FULL_TIME',
      locationText: 'Paris, FR; Remote',
      publishedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(result.jobs[0]).not.toHaveProperty('expiresAt');
    expect(result.warnings).toContain(
      'A malformed or incomplete JobPosting object was skipped.',
    );
    expect(result.atsDetections[0]).toMatchObject({ provider: 'lever' });
  });

  it('isolates deeply nested JSON-LD fields instead of exhausting the stack', () => {
    const nested = `${'['.repeat(10_000)}0${']'.repeat(10_000)}`;
    const html = `<script type="application/ld+json">{
      "@type":"JobPosting",
      "title":"Nested role",
      "hiringOrganization":"Synthetic Company",
      "description":"Synthetic description",
      "url":"/jobs/nested",
      "baseSalary":${nested}
    }</script>`;

    expect(() =>
      extractor.extract(
        html,
        'https://example.test/jobs/nested',
        'Synthetic Company',
        10,
      ),
    ).not.toThrow();
  });

  it.each([
    ['login', '<title>Sign in to continue</title>'],
    ['access-denied', '<h1>Access denied</h1>'],
  ] as const)('classifies %s block pages', (reason, html) => {
    expect(
      extractor.extract(html, 'https://example.test/jobs/one', 'Example', 10)
        .blockedPageReason,
    ).toBe(reason);
  });

  it('uses configured semantic company and recognizes an explicit JavaScript requirement', () => {
    const semantic = extractor.extract(
      '<main><h1>Writer</h1><p class="job-description">Write deterministic docs.</p><a href="/apply">Apply now</a></main>',
      'https://example.test/jobs/writer',
      'Configured Company',
      10,
    );
    expect(semantic.jobs[0]).toMatchObject({
      company: 'Configured Company',
      applicationUrl: 'https://example.test/apply',
    });
    const shell = extractor.extract(
      '<main>JavaScript is required</main><script src="/bundle.js"></script>',
      'https://example.test/jobs',
      'Example',
      10,
    );
    expect(shell.browserFallbackReason).toBe('javascript-required');
  });
});

describe('URL and browser resource safety', () => {
  const resolver: AddressResolver = {
    resolve: (host) =>
      Promise.resolve(
        host === 'public.example' ? ['93.184.216.34'] : ['10.0.0.1'],
      ),
  };
  const validator = new PublicUrlSafetyValidator(resolver);
  it('accepts public HTTPS and internal test loopback while rejecting private or unsafe URLs', async () => {
    await expect(
      validator.validate('https://public.example/jobs?q=1#x', false),
    ).resolves.toBe('https://public.example/jobs?q=1');
    await expect(
      validator.validate('https://192.0.1.1/jobs', false),
    ).resolves.toBe('https://192.0.1.1/jobs');
    await expect(
      validator.validate('https://198.51.99.1/jobs', false),
    ).resolves.toBe('https://198.51.99.1/jobs');
    await expect(
      validator.validate('http://127.0.0.1:3000/jobs', true),
    ).resolves.toBe('http://127.0.0.1:3000/jobs');
    await expect(
      validator.validate('https://private.example/jobs', false),
    ).rejects.toMatchObject({ code: 'URL_UNSAFE' });
    await expect(
      validator.validate('file:///tmp/jobs', false),
    ).rejects.toMatchObject({ code: 'URL_UNSAFE' });
    await expect(
      validator.validate('https://user:pass@public.example/jobs', false),
    ).rejects.toMatchObject({ code: 'URL_UNSAFE' });
    for (const url of [
      'https://127.0.0.1/jobs',
      'https://0.0.0.1/jobs',
      'https://10.1.2.3/jobs',
      'https://169.254.1.1/jobs',
      'https://172.16.1.1/jobs',
      'https://192.168.1.1/jobs',
      'https://100.64.1.1/jobs',
      'https://192.0.2.1/jobs',
      'https://198.18.0.1/jobs',
      'https://198.51.100.1/jobs',
      'https://203.0.113.1/jobs',
      'https://224.0.0.1/jobs',
      'https://[::1]/jobs',
      'https://[::]/jobs',
      'https://[fc00::1]/jobs',
      'https://[fd00::1]/jobs',
      'https://[fe80::1]/jobs',
      'https://[100::1]/jobs',
      'https://[2001:db8::1]/jobs',
      'https://[ff00::1]/jobs',
      'https://[::ffff:127.0.0.1]/jobs',
    ])
      await expect(validator.validate(url, false)).rejects.toMatchObject({
        code: 'URL_UNSAFE',
      });
    await expect(validator.validate('not a URL', false)).rejects.toMatchObject({
      code: 'URL_UNSAFE',
    });
    const emptyResolver = new PublicUrlSafetyValidator({
      resolve: () => Promise.resolve([]),
    });
    await expect(
      emptyResolver.validate('https://missing.example/jobs', false),
    ).rejects.toMatchObject({ code: 'DNS_RESOLUTION_FAILED' });
  });
  it('blocks heavy browser resources but allows application data', () => {
    expect(shouldBlockBrowserResource('image')).toBe(true);
    expect(shouldBlockBrowserResource('font')).toBe(true);
    expect(shouldBlockBrowserResource('xhr')).toBe(false);
    expect(shouldBlockBrowserResource('script')).toBe(false);
    expect(shouldBlockBrowserResource('document')).toBe(false);
  });
});

describe('generic engine and collector', () => {
  it('uses rendered HTML only for a justified app shell', async () => {
    const acquirer: HtmlPageAcquirer = {
      acquire: () =>
        Promise.resolve({
          requestedUrl: 'https://example.test/careers',
          finalUrl: 'https://example.test/careers',
          html: '<div id="root"></div><script type="module" src="app.js"></script>',
          status: 200,
          requestCount: 1,
          redirectCount: 0,
          rendered: false,
          blockedResourceCount: 0,
        }),
    };
    let renders = 0;
    const browser: BrowserPageRenderer = {
      render: async () => {
        renders += 1;
        return {
          finalUrl: 'https://example.test/jobs/rendered',
          html: await fixture('rendered-job-page.html'),
          durationMs: 1,
          blockedResourceCount: 2,
        };
      },
      close: () => Promise.resolve(),
    };
    const engine = new GenericExtractionEngine(
      acquirer,
      extractor,
      browser,
      logger,
    );
    const collector = new GenericWebCollector('generic-page', engine, clock);
    const result = await collector.collect(
      source('generic-page', 'https://example.test/careers'),
      {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      },
    );
    expect(renders).toBe(1);
    expect(result.candidates[0]?.job.title).toBe('Rendered Engineer');
    expect(result.diagnostics).toMatchObject({
      browserFallbacks: 1,
      blockedResources: 2,
    });
  });

  it('rejects the wrong source type and does not render when fallback is disabled', async () => {
    const acquirer: HtmlPageAcquirer = {
      acquire: (request) =>
        Promise.resolve({
          requestedUrl: request.url,
          finalUrl: request.url,
          html: '<div id="root"></div><script src="app.js"></script>',
          status: 200,
          requestCount: 1,
          redirectCount: 0,
          rendered: false,
          blockedResourceCount: 0,
        }),
    };
    let renders = 0;
    const browser: BrowserPageRenderer = {
      render: () => {
        renders += 1;
        return Promise.reject(new Error('unexpected'));
      },
      close: () => Promise.resolve(),
    };
    const collector = new GenericWebCollector(
      'generic-page',
      new GenericExtractionEngine(acquirer, extractor, browser, logger),
      clock,
    );
    await expect(
      collector.collect(
        source('generic-job-list', 'https://example.test/jobs'),
        {
          collectedAt: clock.now().toISOString(),
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_CONFIGURATION_INVALID' });
    const disabled = {
      ...source('generic-page', 'https://example.test/jobs'),
      allowBrowserFallback: false,
    };
    const result = await collector.collect(disabled, {
      collectedAt: clock.now().toISOString(),
      signal: new AbortController().signal,
    });
    expect(result.candidates).toEqual([]);
    expect(renders).toBe(0);
  });

  it('classifies block pages and isolates browser fallback failures', async () => {
    let html = '<h1>Verify you are human</h1>';
    const acquirer: HtmlPageAcquirer = {
      acquire: (request) =>
        Promise.resolve({
          requestedUrl: request.url,
          finalUrl: request.url,
          html,
          status: 200,
          requestCount: 1,
          redirectCount: 0,
          rendered: false,
          blockedResourceCount: 0,
        }),
    };
    const browser: BrowserPageRenderer = {
      render: () => Promise.reject(new Error('synthetic browser failure')),
      close: () => Promise.resolve(),
    };
    const collector = new GenericWebCollector(
      'generic-page',
      new GenericExtractionEngine(acquirer, extractor, browser, logger),
      clock,
    );
    await expect(
      collector.collect(source('generic-page', 'https://example.test/jobs'), {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'BLOCK_PAGE_DETECTED' });
    html = '<div id="root"></div><script src="app.js"></script>';
    const result = await collector.collect(
      source('generic-page', 'https://example.test/jobs'),
      {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      },
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'BROWSER_FALLBACK_FAILED' }),
    );
    expect(result.invalidJobCount).toBe(1);
  });
});

async function fixture(name: string): Promise<string> {
  return readFile(`tests/fixtures/generic/${name}`, 'utf8');
}

function source(type: 'generic-page' | 'generic-job-list', url: string) {
  return {
    id: 'generic',
    type,
    displayName: 'Generic',
    enabled: true,
    company: 'Example',
    requestTimeoutMs: 1_000,
    requestsPerSecond: 10,
    url,
    browserTimeoutMs: 3_000,
    maxDiscoveredLinks: 10,
    maxTraversalDepth: type === 'generic-job-list' ? 1 : 0,
    allowBrowserFallback: true,
  } as const;
}
