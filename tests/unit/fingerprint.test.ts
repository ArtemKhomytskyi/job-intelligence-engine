import { describe, expect, it } from 'vitest';

import {
  createExactJobFingerprint,
  PersistenceError,
} from '../../src/application/index.js';
import {
  isJobStatus,
  type NormalizedJobPosting,
} from '../../src/domain/index.js';

function posting(
  overrides: Partial<NormalizedJobPosting> = {},
): NormalizedJobPosting {
  return {
    job: {
      id: 'job-input',
      source: {
        sourceId: 'source-a',
        externalId: 'external-a',
        sourceUrl: 'https://jobs.example.test/a',
      },
      title: 'Platform Engineer',
      company: 'Example Labs',
      locations: [],
      requiredLanguages: [],
      skills: [],
      collectedAt: '2026-07-29T10:00:00.000Z',
    },
    canonicalUrl: 'https://jobs.example.test/a',
    normalizedTitle: 'Platform Engineer',
    normalizedCompany: 'Example Labs',
    normalizedSkills: [],
    sourceTrace: { sourceId: 'source-a', externalId: 'external-a' },
    ...overrides,
  };
}

describe('exact job fingerprint', () => {
  it('is versioned, deterministic, and insensitive to identity whitespace and case', () => {
    const first = createExactJobFingerprint(posting());
    const second = createExactJobFingerprint(
      posting({
        normalizedTitle: '  PLATFORM   engineer ',
        normalizedCompany: 'example LABS',
      }),
    );

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      algorithm: 'sha256',
      version: 1,
      kind: 'exact-identity',
    });
    expect(first.value).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('keeps persistence errors structured and status values domain-owned', () => {
    const cause = new Error('internal detail');
    const error = new PersistenceError(
      'DATABASE_QUERY_FAILED',
      'Safe message.',
      { cause },
    );

    expect(error).toMatchObject({
      name: 'PersistenceError',
      code: 'DATABASE_QUERY_FAILED',
      message: 'Safe message.',
      cause,
    });
    expect(isJobStatus('APPLIED')).toBe(true);
    expect(isJobStatus('UNKNOWN')).toBe(false);
  });
});
