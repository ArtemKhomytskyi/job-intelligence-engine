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

  it('keeps the tracked profile explicitly synthetic', async () => {
    const content = await readFile(
      join('config', 'profile.example.yaml'),
      'utf8',
    );
    const result = profileSchema.parse(parse(content));
    expect(result.candidate.displayName).toBe('Example Candidate');
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

  it('validates Candidate Profile V2 and source track policies', async () => {
    const profile = profileSchema.parse(
      parse(await readFile(join('config', 'profile.example.yaml'), 'utf8')),
    );
    expect(profile.candidate.experience?.roleFamilies.length).toBeGreaterThan(
      0,
    );
    expect(profile.candidate.targetRoles?.excludedTitles).toContain(
      'Account Executive',
    );
    expect(
      profile.candidate.capabilities?.programmingLanguages.length,
    ).toBeGreaterThan(0);

    const sources = sourcesSchema.parse(
      parse(await readFile(join('config', 'sources.example.yaml'), 'utf8')),
    );
    expect(
      sources.sources.every((source) => source.trackPolicy === 'preferred'),
    ).toBe(true);
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

  it('accepts company-first discovery and every additional ATS source', () => {
    const types = [
      'ashby',
      'smartrecruiters',
      'workable',
      'bamboohr',
      'recruitee',
      'teamtailor',
      'personio',
      'jobvite',
    ];
    const result = sourcesSchema.parse({
      companies: [
        {
          id: 'synthetic-company',
          name: 'Synthetic Company',
          careersUrl: 'https://jobs.ashbyhq.com/synthetic',
        },
      ],
      sources: types.map((type) => ({
        id: `synthetic-${type}`,
        type,
        enabled: false,
        displayName: `Synthetic ${type}`,
        company: 'Synthetic Company',
        tags: [],
        trackIds: [],
        settings: { identifier: 'synthetic' },
      })),
    });
    expect(result.companies).toHaveLength(1);
    expect(result.sources).toHaveLength(8);
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
