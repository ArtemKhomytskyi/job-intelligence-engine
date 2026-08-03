import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type {
  Clock,
  GenericWebCollector,
  HttpClient,
} from '../../src/application/index.js';
import {
  CareerPageAtsCollector,
  GreenhouseCollector,
  LeverCollector,
  createAshbyCollector,
  createRecruiteeCollector,
  createSmartRecruitersCollector,
} from '../../src/infrastructure/index.js';

const clock: Clock = { now: () => new Date('2026-07-29T12:00:00Z') };
async function fixture(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(`tests/fixtures/${name}`, 'utf8'),
  ) as unknown;
}
function http(data: unknown): HttpClient {
  return {
    getJson: (_request, decoder) =>
      Promise.resolve({ data: decoder.decode(data), status: 200, attempts: 1 }),
    getText: () => Promise.reject(new Error('not used')),
  };
}

describe('ATS collectors', () => {
  it('decodes Greenhouse entity-encoded HTML before preserving sections', async () => {
    const html = await readFile(
      'tests/fixtures/extraction/greenhouse-audit-regressions.html',
      'utf8',
    );
    const content = html
      .replace(/&/gu, '&amp;')
      .replace(/</gu, '&lt;')
      .replace(/>/gu, '&gt;');
    const result = await new GreenhouseCollector(
      http({
        jobs: [
          {
            id: 301,
            title: 'Synthetic Platform Role',
            absolute_url: 'https://example.test/jobs/301',
            content,
          },
        ],
      }),
      clock,
    ).collect(
      {
        id: 'g',
        type: 'greenhouse',
        displayName: 'Acme',
        company: 'Acme',
        enabled: true,
        requestTimeoutMs: 1000,
        requestsPerSecond: 2,
        boardToken: 'acme',
      },
      {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      },
    );
    expect(result.candidates[0]?.job.description).toContain(
      "What you'll do at Synthetic Systems:",
    );
    expect(result.candidates[0]?.job.description).toContain(
      '- Build accessible product workflows for distributed teams.',
    );
    expect(result.candidates[0]?.job.description).not.toContain('<div');
  });

  it('maps valid Greenhouse jobs and isolates invalid items', async () => {
    const result = await new GreenhouseCollector(
      http(await fixture('greenhouse-jobs.json')),
      clock,
    ).collect(
      {
        id: 'g',
        type: 'greenhouse',
        displayName: 'Acme',
        company: 'Acme',
        enabled: true,
        requestTimeoutMs: 1000,
        requestsPerSecond: 2,
        boardToken: 'acme',
      },
      {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      },
    );
    expect(result).toMatchObject({
      rawJobCount: 2,
      invalidJobCount: 1,
      requestCount: 1,
    });
    expect(result.candidates[0]?.job.description).toBe('Build & ship.');
  });

  it('maps Lever fields and deduplicates external IDs', async () => {
    const result = await new LeverCollector(
      http(await fixture('lever-jobs.json')),
      clock,
    ).collect(
      {
        id: 'l',
        type: 'lever',
        displayName: 'Acme',
        company: 'Acme',
        enabled: true,
        requestTimeoutMs: 1000,
        requestsPerSecond: 2,
        companySlug: 'acme',
      },
      {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      },
    );
    expect(result).toMatchObject({ rawJobCount: 2, invalidJobCount: 1 });
    expect(result.candidates[0]?.job).toMatchObject({
      employmentType: 'full-time',
      remotePolicy: 'remote',
    });
    expect(result.candidates[0]?.job.description).toContain('Requirements');
    expect(result.candidates[0]?.job.description).toContain(
      '- Three years of TypeScript experience.',
    );
  });

  it.each([
    [
      'ashby',
      createAshbyCollector,
      {
        jobs: [
          {
            id: 'a-1',
            title: 'AI Engineer',
            location: 'Berlin, Germany',
            descriptionHtml: '<p>Build reliable AI products.</p>',
            jobUrl: 'https://jobs.ashbyhq.com/acme/a-1',
            applyUrl: 'https://jobs.ashbyhq.com/acme/a-1/application',
            employmentType: 'Full-time',
          },
        ],
      },
      'AI Engineer',
    ],
    [
      'smartrecruiters',
      createSmartRecruitersCollector,
      {
        content: [
          {
            id: 's-1',
            name: 'Data Scientist',
            ref: 'https://jobs.smartrecruiters.com/Acme/s-1',
            location: { city: 'London', country: 'United Kingdom' },
            typeOfEmployment: { label: 'Full-time' },
          },
        ],
      },
      'Data Scientist',
    ],
    [
      'recruitee',
      createRecruiteeCollector,
      {
        offers: [
          {
            id: 7,
            title: 'Developer Advocate',
            careers_url: 'https://acme.recruitee.com/o/developer-advocate',
            description: '<p>Create technical content.</p>',
            location: 'Remote, Europe',
            remote: true,
          },
        ],
      },
      'Developer Advocate',
    ],
  ] as const)(
    'maps public %s jobs through shared normalization',
    async (type, factory, payload, title) => {
      const result = await factory(http(payload), clock).collect(
        {
          id: type,
          type,
          displayName: 'Acme',
          company: 'Acme',
          enabled: true,
          requestTimeoutMs: 1000,
          requestsPerSecond: 2,
          identifier: 'acme',
        },
        {
          collectedAt: clock.now().toISOString(),
          signal: new AbortController().signal,
        },
      );
      expect(result).toMatchObject({
        sourceType: type,
        rawJobCount: 1,
        invalidJobCount: 0,
      });
      expect(result.candidates[0]?.job.title).toBe(title);
    },
  );

  it('processes a deterministic 1,200-job ATS benchmark without loss', async () => {
    const jobs = Array.from({ length: 1_200 }, (_, index) => ({
      id: `benchmark-${String(index).padStart(4, '0')}`,
      title: `${['Software Engineer', 'AI Researcher', 'Data Scientist', 'Developer Advocate', 'Product Manager', 'Product Designer', 'Marketing Manager', 'Account Executive', 'Operations Manager', 'Community Manager'][index % 10]} ${index}`,
      location: index % 2 === 0 ? 'Remote, Europe' : 'London, United Kingdom',
      descriptionHtml:
        '<h2>Requirements</h2><ul><li>TypeScript experience</li></ul>',
      jobUrl: `https://jobs.ashbyhq.com/synthetic/benchmark-${index}`,
      employmentType: 'Full-time',
    }));
    const result = await createAshbyCollector(http({ jobs }), clock).collect(
      {
        id: 'benchmark',
        type: 'ashby',
        displayName: 'Synthetic Benchmark',
        company: 'Synthetic Benchmark',
        enabled: true,
        requestTimeoutMs: 10_000,
        requestsPerSecond: 2,
        identifier: 'synthetic',
      },
      {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      },
    );
    expect(result).toMatchObject({
      rawJobCount: 1_200,
      invalidJobCount: 0,
    });
    expect(result.candidates).toHaveLength(1_200);
  });

  it('paginates SmartRecruiters listings and enriches each public detail', async () => {
    const requests: string[] = [];
    const pagedHttp: HttpClient = {
      getText: () => Promise.reject(new Error('not used')),
      getJson: (request, decoder) => {
        requests.push(request.url);
        const url = new URL(request.url);
        const id = url.pathname.split('/').at(-1);
        const value = url.pathname.endsWith('/postings')
          ? {
              content: [
                {
                  id: url.searchParams.get('offset') === '1' ? 's-2' : 's-1',
                  name:
                    url.searchParams.get('offset') === '1'
                      ? 'Product Designer'
                      : 'Platform Engineer',
                  ref: `https://api.smartrecruiters.com/v1/companies/acme/postings/${url.searchParams.get('offset') === '1' ? 's-2' : 's-1'}`,
                },
              ],
              totalFound: 2,
              offset: Number(url.searchParams.get('offset') ?? '0'),
              limit: 1,
            }
          : {
              postingUrl: `https://jobs.smartrecruiters.com/acme/${id}`,
              applyUrl: `https://jobs.smartrecruiters.com/acme/${id}/apply`,
              jobAd: {
                sections: {
                  jobDescription: { text: `<p>Responsibilities for ${id}</p>` },
                  qualifications: { text: '<p>TypeScript experience</p>' },
                },
              },
            };
        return Promise.resolve({
          data: decoder.decode(value),
          status: 200,
          attempts: 1,
        });
      },
    };
    const result = await createSmartRecruitersCollector(
      pagedHttp,
      clock,
    ).collect(
      {
        id: 'smart',
        type: 'smartrecruiters',
        displayName: 'Acme',
        company: 'Acme',
        enabled: true,
        requestTimeoutMs: 1_000,
        requestsPerSecond: 2,
        identifier: 'acme',
        url: 'https://api.smartrecruiters.com/v1/companies/acme/postings?limit=1&offset=0',
      },
      {
        collectedAt: clock.now().toISOString(),
        signal: new AbortController().signal,
      },
    );
    expect(result).toMatchObject({
      rawJobCount: 2,
      requestCount: 4,
      invalidJobCount: 0,
    });
    expect(result.candidates.map((candidate) => candidate.job.title)).toEqual([
      'Platform Engineer',
      'Product Designer',
    ]);
    expect(result.candidates[0]?.job.description).toContain('Qualifications:');
    expect(requests).toHaveLength(4);
  });

  it.each([
    ['workable', 'https://apply.workable.com/acme/'],
    ['bamboohr', 'https://acme.bamboohr.com/careers/'],
    ['teamtailor', 'https://acme.teamtailor.com/jobs'],
    ['personio', 'https://acme.jobs.personio.de/'],
    ['jobvite', 'https://jobs.jobvite.com/acme/jobs'],
  ] as const)(
    'delegates %s public pages to generic extraction',
    async (type, url) => {
      let delegatedUrl: string | undefined;
      const delegate = {
        collect: (source: { readonly url?: string }) => {
          delegatedUrl = source.url;
          return Promise.resolve({
            sourceId: type,
            sourceType: 'generic-job-list' as const,
            requestCount: 1,
            rawJobCount: 0,
            invalidJobCount: 0,
            warnings: [],
            candidates: [],
            durationMs: 1,
          });
        },
      } as unknown as GenericWebCollector;
      const result = await new CareerPageAtsCollector(
        type,
        delegate,
        clock,
      ).collect(
        {
          id: type,
          type,
          displayName: 'Acme',
          company: 'Acme',
          enabled: true,
          requestTimeoutMs: 1000,
          requestsPerSecond: 1,
          identifier: 'acme',
        },
        {
          collectedAt: clock.now().toISOString(),
          signal: new AbortController().signal,
        },
      );
      expect(delegatedUrl).toBe(url);
      expect(result.sourceType).toBe(type);
    },
  );
});
