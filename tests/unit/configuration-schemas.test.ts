import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { profileSchema } from '../../src/infrastructure/configuration/schemas/profile-schema.js';
import { scoringSchema } from '../../src/infrastructure/configuration/schemas/scoring-schema.js';
import { searchSchema } from '../../src/infrastructure/configuration/schemas/search-schema.js';
import { sourcesSchema } from '../../src/infrastructure/configuration/schemas/sources-schema.js';

const CASES = [
  ['profile', profileSchema],
  ['search', searchSchema],
  ['scoring', scoringSchema],
  ['sources', sourcesSchema],
] as const;

describe('configuration schemas', () => {
  it.each(CASES)('accepts the %s example', async (section, schema) => {
    const content = await readFile(
      join('config', `${section}.example.yaml`),
      'utf8',
    );
    const input: unknown = parse(content);
    expect(schema.safeParse(input).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    const result = profileSchema.safeParse({
      candidate: {
        id: 'example',
        displayName: 'Example',
        education: [],
        professionalExperienceSummary: 'Example',
        skills: [],
        languages: [],
        citizenships: [],
        workAuthorizations: [],
        preferredEmploymentTypes: ['full-time'],
        location: {
          country: 'DE',
          willingToRelocate: false,
          relocationCountries: [],
        },
        unexpected: true,
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects source settings that do not match the discriminator', () => {
    const result = sourcesSchema.safeParse({
      sources: [
        {
          id: 'wrong-settings',
          type: 'lever',
          enabled: true,
          displayName: 'Wrong settings',
          tags: [],
          trackIds: [],
          settings: { boardToken: 'not-a-company-slug' },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('validates generic source URL and resource bounds', () => {
    const generic = {
      id: 'generic-list',
      type: 'generic-job-list',
      enabled: true,
      displayName: 'Generic list',
      tags: [],
      trackIds: [],
      settings: {
        url: 'https://careers.example.test/jobs',
        browserTimeoutMs: 3_000,
        maxDiscoveredLinks: 1,
        maxTraversalDepth: 0,
        allowBrowserFallback: false,
      },
    };
    expect(sourcesSchema.safeParse({ sources: [generic] }).success).toBe(true);
    expect(
      sourcesSchema.safeParse({
        sources: [
          {
            ...generic,
            settings: { ...generic.settings, url: 'http://10.0.0.1/jobs' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      sourcesSchema.safeParse({
        sources: [
          {
            ...generic,
            settings: { ...generic.settings, maxDiscoveredLinks: 201 },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects invalid scoring confidence inputs, aliases, and selector caps', () => {
    const weights = {
      titleRelevance: 18,
      skills: 16,
      experience: 12,
      location: 10,
      workAuthorization: 10,
      education: 6,
      language: 6,
      companyPreference: 5,
      freshness: 7,
      salary: 4,
      sourceQuality: 4,
      applicationSimplicity: 2,
    };
    const settings = {
      titleAliases: [{ canonical: '', aliases: ['ml engineer'] }],
      skillAliases: [],
      experienceToleranceYears: -1,
      freshnessFullScoreDays: 3,
      freshnessHorizonDays: 60,
      sourceQuality: { greenhouse: 101 },
      selector: { maximumSameTitle: 0, unknownCompanyJobsShareCap: false },
    };
    expect(scoringSchema.safeParse({ weights, settings }).success).toBe(false);
  });
});
