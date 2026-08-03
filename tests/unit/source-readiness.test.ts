import { describe, expect, it } from 'vitest';

import {
  inspectSourceReadiness,
  type SourceConfig,
} from '../../src/domain/index.js';

describe('source readiness', () => {
  it.each([
    greenhouse(
      'example-source',
      'real-token',
      'https://boards.greenhouse.io/real-token',
    ),
    greenhouse(
      'greenhouse-source',
      'example-company',
      'https://boards.greenhouse.io/example-company',
    ),
    lever('lever-source', 'example-labs', 'https://jobs.lever.co/example-labs'),
    generic('https://careers.example.com/jobs'),
    generic('https://careers.example.org/jobs'),
    generic('https://careers.example.net/jobs'),
  ])('classifies placeholder source $id', (source) => {
    const report = inspectSourceReadiness([source]);
    expect(report.sources[0]).toMatchObject({
      classification: 'PLACEHOLDER',
      configurationReady: false,
    });
    expect(report.hasRealEnabledSource).toBe(false);
  });

  it('accepts a valid non-placeholder source', () => {
    const report = inspectSourceReadiness([
      greenhouse(
        'my-greenhouse-source',
        'synthetic-board',
        'https://boards.greenhouse.io/synthetic-board',
      ),
    ]);
    expect(report.sources[0]).toMatchObject({
      enabled: true,
      classification: 'REAL',
      configurationReady: true,
    });
    expect(report.hasRealEnabledSource).toBe(true);
  });

  it('reports disabled placeholders without making them runnable', () => {
    const report = inspectSourceReadiness([
      { ...lever('lever-template', 'example-labs'), enabled: false },
    ]);
    expect(report.sources[0]).toMatchObject({
      enabled: false,
      classification: 'PLACEHOLDER',
    });
    expect(report.hasRealEnabledSource).toBe(false);
  });

  it('reports the legacy generic-jsonld type as real but not runnable', () => {
    const report = inspectSourceReadiness([
      {
        id: 'legacy-jsonld',
        type: 'generic-jsonld',
        enabled: true,
        displayName: 'Legacy JSON-LD',
        tags: [],
        trackIds: ['data-science'],
        settings: { url: 'https://careers.synthetic.invalid/jobs' },
      },
    ]);
    expect(report.sources[0]).toMatchObject({
      classification: 'REAL',
      configurationReady: false,
      reasons: ['source type is not supported by collection'],
    });
    expect(report.hasRealEnabledSource).toBe(false);
  });

  it('blocks external browser fallback while allowing HTTP-only generic sources', () => {
    const blocked = inspectSourceReadiness([
      generic('https://careers.synthetic.invalid/jobs', true),
    ]);
    expect(blocked.sources[0]).toMatchObject({
      classification: 'REAL',
      configurationReady: false,
      blockerCodes: ['BROWSER_FALLBACK_EXTERNAL_UNSAFE'],
      reasons: [
        'external browser fallback is disabled by the source network policy',
      ],
    });
    expect(blocked.hasRealEnabledSource).toBe(false);

    const httpOnly = inspectSourceReadiness([
      generic('https://careers.synthetic.invalid/jobs', false),
    ]);
    expect(httpOnly.sources[0]).toMatchObject({
      configurationReady: true,
      blockerCodes: [],
    });
    expect(httpOnly.hasRealEnabledSource).toBe(true);
  });
});

function greenhouse(
  id: string,
  boardToken: string,
  boardUrl?: string,
): SourceConfig {
  return {
    id,
    type: 'greenhouse',
    enabled: true,
    displayName: 'Synthetic Greenhouse',
    tags: [],
    trackIds: ['data-science'],
    settings: { boardToken, ...(boardUrl === undefined ? {} : { boardUrl }) },
  };
}

function lever(
  id: string,
  companySlug: string,
  jobsUrl?: string,
): SourceConfig {
  return {
    id,
    type: 'lever',
    enabled: true,
    displayName: 'Synthetic Lever',
    tags: [],
    trackIds: ['data-science'],
    settings: { companySlug, ...(jobsUrl === undefined ? {} : { jobsUrl }) },
  };
}

function generic(url: string, allowBrowserFallback?: boolean): SourceConfig {
  return {
    id: 'generic-source',
    type: 'generic-job-list',
    enabled: true,
    displayName: 'Synthetic list',
    tags: [],
    trackIds: ['data-science'],
    settings: {
      url,
      ...(allowBrowserFallback === undefined ? {} : { allowBrowserFallback }),
    },
  };
}
