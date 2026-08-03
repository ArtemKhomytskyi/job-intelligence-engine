import { describe, expect, it } from 'vitest';

import {
  CompanyDiscoveryService,
  discoveredSource,
  resolveCompanySources,
  type HttpClient,
} from '../../src/application/index.js';
import type { CompanyConfig } from '../../src/domain/index.js';

const company: CompanyConfig = {
  id: 'synthetic',
  name: 'Synthetic Company',
  enabled: true,
  careersUrl: 'https://careers.synthetic.example/jobs',
  tags: [],
  trackIds: [],
  trackPolicy: 'preferred',
};

describe('company discovery service', () => {
  it('reuses a matching persisted discovery without a network request', async () => {
    let requests = 0;
    const http: HttpClient = {
      getJson: () => Promise.reject(new Error('not used')),
      getText: () => {
        requests += 1;
        return Promise.reject(new Error('not expected'));
      },
    };
    const service = new CompanyDiscoveryService(http, {
      getCompany: () =>
        Promise.resolve({
          companyId: 'synthetic',
          name: 'Synthetic Company',
          careersUrl: 'https://careers.synthetic.example/jobs',
          provider: 'ashby',
          discoveryStatus: 'DISCOVERED',
          discoveryConfidence: 96,
          discoveryMethod: 'URL_PATTERN',
          jobCount: 10,
          crawlCount: 1,
        }),
    });
    const result = await service.discover(company, {
      collectedAt: '2026-08-03T10:00:00.000Z',
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      status: 'DISCOVERED',
      provider: 'ashby',
      diagnostics: ['Reused persisted provider discovery.'],
    });
    expect(requests).toBe(0);
  });

  it('maps a generic override into the existing generic collector contract', () => {
    const overridden: CompanyConfig = {
      ...company,
      sourceOverride: {
        type: 'generic-job-list',
        url: 'https://careers.synthetic.example/jobs',
      },
    };
    expect(
      discoveredSource(overridden, {
        status: 'DISCOVERED',
        companyId: overridden.id,
        companyName: overridden.name,
        careersUrl: 'https://careers.synthetic.example/jobs',
        provider: 'generic-job-list',
        confidence: 100,
        method: 'SOURCE_OVERRIDE',
        evidence: [],
        diagnostics: [],
      }),
    ).toMatchObject({
      type: 'generic-job-list',
      url: 'https://careers.synthetic.example/jobs',
    });
  });

  it.each([
    ['greenhouse', 'https://boards.greenhouse.io/synthetic'],
    ['lever', 'https://jobs.lever.co/synthetic'],
    ['ashby', 'https://jobs.ashbyhq.com/synthetic'],
    ['smartrecruiters', 'https://jobs.smartrecruiters.com/synthetic'],
    ['workable', 'https://apply.workable.com/synthetic'],
    ['bamboohr', 'https://synthetic.bamboohr.com/careers'],
    ['recruitee', 'https://synthetic.recruitee.com'],
    ['teamtailor', 'https://synthetic.teamtailor.com/jobs'],
    ['personio', 'https://synthetic.jobs.personio.com'],
    ['jobvite', 'https://jobs.jobvite.com/synthetic'],
  ] as const)(
    'derives the %s public identifier from its careers URL',
    (provider, careersUrl) => {
      expect(
        discoveredSource(
          { ...company, careersUrl },
          {
            status: 'DISCOVERED',
            companyId: 'synthetic',
            companyName: 'Synthetic Company',
            careersUrl,
            provider,
            confidence: 96,
            method: 'URL_PATTERN',
            evidence: [],
            diagnostics: [],
          },
        ),
      ).toMatchObject({ type: provider });
    },
  );

  it.each([
    'ashby',
    'smartrecruiters',
    'workable',
    'bamboohr',
    'recruitee',
    'teamtailor',
    'personio',
    'jobvite',
  ] as const)(
    'constructs the canonical %s URL from an identifier override',
    (provider) => {
      const overridden: CompanyConfig = withoutCareers({
        sourceOverride: { type: provider, identifier: 'synthetic' },
      });
      expect(
        discoveredSource(overridden, {
          status: 'DISCOVERED',
          companyId: 'synthetic',
          companyName: 'Synthetic Company',
          provider,
          confidence: 100,
          method: 'SOURCE_OVERRIDE',
          evidence: [],
          diagnostics: [],
        }),
      ).toMatchObject({ type: provider, identifier: 'synthetic' });
    },
  );

  it('returns safe unknown diagnostics without a discoverable URL', async () => {
    const service = new CompanyDiscoveryService(unusedHttp());
    await expect(
      service.discover(withoutCareers(), {
        collectedAt: '2026-08-03T10:00:00.000Z',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      status: 'UNKNOWN_PROVIDER',
      diagnostics: [
        'A careersUrl, websiteUrl, or sourceOverride is required for network discovery.',
      ],
    });
  });

  it('uses a safe redirect fingerprint and isolates failed probes', async () => {
    const redirecting: HttpClient = {
      getJson: () => Promise.reject(new Error('not used')),
      getText: () =>
        Promise.resolve({
          data: '<html></html>',
          status: 200,
          attempts: 1,
          finalUrl: 'https://jobs.ashbyhq.com/synthetic',
          redirectCount: 1,
        }),
    };
    await expect(
      new CompanyDiscoveryService(redirecting).discover(company, {
        collectedAt: '2026-08-03T10:00:00.000Z',
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      status: 'DISCOVERED',
      provider: 'ashby',
      method: 'REDIRECT_URL',
    });

    const failed: HttpClient = {
      getJson: () => Promise.reject(new Error('not used')),
      getText: () => Promise.reject(new Error('offline')),
    };
    await expect(
      new CompanyDiscoveryService(failed).discover(
        withoutCareers({ websiteUrl: 'https://synthetic.example' }),
        {
          collectedAt: '2026-08-03T10:00:00.000Z',
          signal: new AbortController().signal,
        },
      ),
    ).resolves.toMatchObject({ status: 'UNKNOWN_PROVIDER' });
  });

  it('resolves enabled companies in stable order and skips unknown providers', async () => {
    const service = new CompanyDiscoveryService(unusedHttp());
    const resolution = await resolveCompanySources(
      service,
      [
        {
          ...company,
          id: 'first',
          sourceOverride: { type: 'ashby', identifier: 'first' },
        },
        { ...company, id: 'disabled', enabled: false },
        withoutCareers({ id: 'unknown' }),
      ],
      {
        collectedAt: '2026-08-03T10:00:00.000Z',
        signal: new AbortController().signal,
      },
    );
    expect(resolution.discoveries.map((item) => item.companyId)).toEqual([
      'first',
      'unknown',
    ]);
    expect(resolution.sources.map((item) => item.id)).toEqual([
      'company-first',
    ]);
  });

  it('rejects discovered sources without the required safe identifier or URL', () => {
    expect(() =>
      discoveredSource(company, {
        status: 'UNKNOWN_PROVIDER',
        companyId: 'synthetic',
        companyName: 'Synthetic Company',
        confidence: 0,
        method: 'UNKNOWN',
        evidence: [],
        diagnostics: [],
      }),
    ).toThrow('no collectable discovered provider');
    expect(() =>
      discoveredSource(withoutCareers(), {
        status: 'DISCOVERED',
        companyId: 'synthetic',
        companyName: 'Synthetic Company',
        provider: 'ashby',
        confidence: 96,
        method: 'URL_PATTERN',
        evidence: [],
        diagnostics: [],
      }),
    ).toThrow('does not contain a usable public identifier');
    expect(() =>
      discoveredSource(
        withoutCareers({
          sourceOverride: { type: 'generic-page' },
        }),
        {
          status: 'DISCOVERED',
          companyId: 'synthetic',
          companyName: 'Synthetic Company',
          provider: 'generic-page',
          confidence: 100,
          method: 'SOURCE_OVERRIDE',
          evidence: [],
          diagnostics: [],
        },
      ),
    ).toThrow('generic override requires a URL');
  });
});

function unusedHttp(): HttpClient {
  return {
    getJson: () => Promise.reject(new Error('not used')),
    getText: () => Promise.reject(new Error('not used')),
  };
}

function withoutCareers(overrides: Partial<CompanyConfig> = {}): CompanyConfig {
  const { careersUrl: _careersUrl, ...base } = company;
  void _careersUrl;
  return { ...base, ...overrides };
}
