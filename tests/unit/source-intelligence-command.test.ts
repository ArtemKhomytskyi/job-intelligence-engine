import { describe, expect, it } from 'vitest';

import { runSourceIntelligence } from '../../src/interfaces/index.js';
import type { ProviderDiscoveryResult } from '../../src/domain/index.js';

const discovered: ProviderDiscoveryResult = {
  status: 'DISCOVERED' as const,
  companyId: 'synthetic',
  companyName: 'Synthetic Company',
  careersUrl: 'https://jobs.ashbyhq.com/synthetic',
  provider: 'ashby' as const,
  confidence: 96,
  method: 'URL_PATTERN' as const,
  evidence: [],
  diagnostics: [],
};

describe('source intelligence CLI commands', () => {
  it('lists providers in human-readable form without creating a runtime', async () => {
    const output = capture();
    await expect(
      runSourceIntelligence('show-providers', options(), output, () => {
        throw new Error('runtime must not be created');
      }),
    ).resolves.toBe(0);
    expect(output.stdout.join('')).toContain('greenhouse\nlever\nashby');
  });
  it('discovers one company and all configured companies', async () => {
    const single = capture();
    await expect(
      runSourceIntelligence(
        'discover-company',
        options({ url: 'https://jobs.ashbyhq.com/synthetic' }),
        single,
        factory(),
      ),
    ).resolves.toBe(0);
    expect(single.stdout.join('')).toContain('Confidence: 96%');

    const all = capture();
    await expect(
      runSourceIntelligence('discover-all', options(), all, factory()),
    ).resolves.toBe(0);
    expect(all.stdout.join('')).toContain('Provider: ashby');
  });

  it('shows company, discovery, health, and provider coverage', async () => {
    const company = capture();
    await expect(
      runSourceIntelligence(
        'show-company',
        options({ companyId: 'synthetic' }),
        company,
        factory(),
      ),
    ).resolves.toBe(0);
    expect(company.stdout.join('')).toContain('Synthetic Company');

    const discovery = capture();
    await expect(
      runSourceIntelligence('show-discovery', options(), discovery, factory()),
    ).resolves.toBe(0);
    expect(discovery.stdout.join('')).toContain('discoveredCompanyCount');

    const health = capture();
    await expect(
      runSourceIntelligence('health', options(), health, factory()),
    ).resolves.toBe(0);
    expect(health.stdout.join('')).toContain('Healthy: 1');

    const coverage = capture();
    await expect(
      runSourceIntelligence('coverage', options(), coverage, factory()),
    ).resolves.toBe(0);
    expect(coverage.stdout.join('')).toContain('ashby | 1 | 12');
  });

  it('reports unknown discovery, missing arguments, and missing companies safely', async () => {
    const unknown = capture();
    await expect(
      runSourceIntelligence(
        'discover-company',
        options({ url: 'https://careers.synthetic.example/jobs' }),
        unknown,
        factory({ discoveryStatus: 'UNKNOWN_PROVIDER' }),
      ),
    ).resolves.toBe(1);
    expect(unknown.stdout.join('')).toContain('UNKNOWN_PROVIDER');

    const missingUrl = capture();
    await expect(
      runSourceIntelligence(
        'discover-company',
        options(),
        missingUrl,
        factory(),
      ),
    ).resolves.toBe(2);
    expect(missingUrl.stderr.join('')).toContain('requires a URL');

    const missingCompany = capture();
    await expect(
      runSourceIntelligence(
        'show-company',
        options({ companyId: 'missing' }),
        missingCompany,
        factory({ missingCompany: true }),
      ),
    ).resolves.toBe(1);
    expect(missingCompany.stderr.join('')).toContain('was not found');

    const missingCompanyId = capture();
    await expect(
      runSourceIntelligence(
        'show-company',
        options(),
        missingCompanyId,
        factory(),
      ),
    ).resolves.toBe(2);

    const unavailable = capture();
    await expect(
      runSourceIntelligence('discover-all', options(), unavailable, () => ({
        close: () => Promise.resolve(),
      })),
    ).resolves.toBe(3);
    expect(unavailable.stderr.join('')).toContain('unavailable');
  });

  it('formats JSON, mixed discovery outcomes, and unknown provider coverage', async () => {
    const json = capture();
    await expect(
      runSourceIntelligence(
        'health',
        { ...options(), asJson: true },
        json,
        factory(),
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(json.stdout.join(''))).toMatchObject({ companyCount: 1 });

    const mixed = capture();
    await expect(
      runSourceIntelligence(
        'discover-all',
        { ...options(), asJson: true },
        mixed,
        factory({ discoveryStatus: 'UNKNOWN_PROVIDER' }),
      ),
    ).resolves.toBe(1);

    const coverage = capture();
    await expect(
      runSourceIntelligence(
        'coverage',
        options(),
        coverage,
        factory({ unknownCoverage: true }),
      ),
    ).resolves.toBe(0);
    expect(coverage.stdout.join('')).toContain('UNKNOWN_PROVIDER | 1 | 12');

    const discoveryJson = capture();
    await expect(
      runSourceIntelligence(
        'discover-company',
        {
          ...options({ url: 'https://jobs.ashbyhq.com/synthetic' }),
          asJson: true,
        },
        discoveryJson,
        factory(),
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(discoveryJson.stdout.join(''))).toMatchObject({
      provider: 'ashby',
    });
  });

  it.each([
    ['discover-company', { url: 'https://careers.synthetic.example' }],
    ['show-company', { companyId: 'synthetic' }],
    ['health', {}],
  ] as const)(
    'reports unavailable runtime capability for %s',
    async (command, override) => {
      const output = capture();
      await expect(
        runSourceIntelligence(command, options(override), output, () => ({
          close: () => Promise.resolve(),
        })),
      ).resolves.toBe(3);
      expect(output.stderr.join('')).toContain('unavailable');
    },
  );

  it('reports unexpected runtime failures', async () => {
    const output = capture();
    await expect(
      runSourceIntelligence('health', options(), output, () => ({
        getCollectionHealth: () =>
          Promise.reject(new Error('synthetic failure')),
        close: () => Promise.resolve(),
      })),
    ).resolves.toBe(3);
    expect(output.stderr.join('')).toContain('synthetic failure');
  });
});

function factory(
  settings: {
    readonly discoveryStatus?: 'DISCOVERED' | 'UNKNOWN_PROVIDER';
    readonly missingCompany?: boolean;
    readonly unknownCoverage?: boolean;
  } = {},
) {
  const result: ProviderDiscoveryResult =
    settings.discoveryStatus === 'UNKNOWN_PROVIDER'
      ? {
          status: 'UNKNOWN_PROVIDER' as const,
          companyId: 'synthetic',
          companyName: 'Synthetic Company',
          careersUrl: 'https://careers.synthetic.example/jobs',
          confidence: 0,
          method: 'UNKNOWN' as const,
          evidence: [],
          diagnostics: ['No supported ATS fingerprint matched.'],
        }
      : discovered;
  return () => ({
    discoverCompany: () => Promise.resolve(result),
    discoverAll: () => Promise.resolve([result]),
    getCompanyHealth: () =>
      Promise.resolve(
        settings.missingCompany
          ? undefined
          : {
              companyId: 'synthetic',
              name: 'Synthetic Company',
              provider: 'ashby',
              discoveryStatus: 'DISCOVERED',
              discoveryConfidence: 96,
              jobCount: 12,
              crawlCount: 1,
              lastSuccessfulCrawlAt: '2026-08-03T10:00:00.000Z',
            },
      ),
    getCollectionHealth: () =>
      Promise.resolve(health(settings.unknownCoverage === true)),
    close: () => Promise.resolve(),
  });
}

function health(unknownProvider = false) {
  return {
    companyCount: 1,
    discoveredCompanyCount: 1,
    unknownProviderCount: 0,
    healthyCompanyCount: 1,
    failedCompanyCount: 0,
    totalJobs: 12,
    companies: [
      {
        companyId: 'synthetic',
        name: 'Synthetic Company',
        ...(unknownProvider ? {} : { provider: 'ashby' }),
        discoveryStatus: 'DISCOVERED',
        discoveryConfidence: 96,
        jobCount: 12,
        crawlCount: 1,
        lastSuccessfulCrawlAt: '2026-08-03T10:00:00.000Z',
      },
    ],
  };
}

function options(
  overrides: { readonly url?: string; readonly companyId?: string } = {},
) {
  return {
    configDirectory: 'config',
    ...overrides,
    asJson: false,
    verbose: false,
    signal: new AbortController().signal,
  };
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    writeStdout: (value: string) => stdout.push(value),
    writeStderr: (value: string) => stderr.push(value),
  };
}
