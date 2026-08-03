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

function generic(url: string): SourceConfig {
  return {
    id: 'generic-source',
    type: 'generic-job-list',
    enabled: true,
    displayName: 'Synthetic list',
    tags: [],
    trackIds: ['data-science'],
    settings: { url },
  };
}
