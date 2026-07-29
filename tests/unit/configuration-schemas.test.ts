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
});
