import { describe, expect, it } from 'vitest';
import {
  CollectionError,
  CollectorRegistry,
  htmlToPlainText,
  normalizeCollectedJob,
  toCollectableSources,
  type JobCollector,
} from '../../src/application/index.js';

const collector: JobCollector = {
  sourceType: 'greenhouse',
  collect: () =>
    Promise.resolve({
      sourceId: 'g',
      sourceType: 'greenhouse',
      requestCount: 1,
      rawJobCount: 0,
      invalidJobCount: 0,
      warnings: [],
      candidates: [],
      durationMs: 1,
    }),
};

describe('collection core', () => {
  it('registers collectors and rejects duplicates', () => {
    expect(new CollectorRegistry([collector]).resolve('greenhouse')).toBe(
      collector,
    );
    expect(() => new CollectorRegistry([collector, collector])).toThrow(
      CollectionError,
    );
    expect(() => new CollectorRegistry([]).resolve('lever')).toThrowError(
      /No collector/,
    );
  });

  it('sanitizes descriptions and rejects insecure public URLs', () => {
    expect(
      htmlToPlainText('<p>Hello &amp; welcome</p><script>bad()</script>'),
    ).toBe('Hello & welcome');
    expect(() =>
      normalizeCollectedJob(
        {
          id: 'g',
          type: 'greenhouse',
          displayName: 'G',
          enabled: true,
          company: 'Acme',
          requestTimeoutMs: 1000,
          requestsPerSecond: 1,
          boardToken: 'acme',
        },
        {
          externalId: '1',
          title: 'Engineer',
          company: 'Acme',
          sourceUrl: 'http://example.com/job',
        },
        '2026-07-01T00:00:00Z',
      ),
    ).toThrow(CollectionError);
  });

  it('selects enabled supported sources with defaults', () => {
    const result = toCollectableSources([
      {
        id: 'g',
        type: 'greenhouse',
        enabled: true,
        displayName: 'Acme',
        tags: [],
        trackIds: [],
        settings: { boardToken: 'acme' },
      },
    ]);
    expect(result[0]).toMatchObject({
      company: 'Acme',
      requestTimeoutMs: 15000,
      requestsPerSecond: 2,
    });
    const lever = toCollectableSources(
      [
        {
          id: 'l',
          type: 'lever',
          enabled: true,
          displayName: 'Labs',
          company: 'Company',
          requestTimeoutMs: 2_000,
          requestsPerSecond: 1,
          tags: [],
          trackIds: [],
          settings: { companySlug: 'labs' },
        },
      ],
      { sourceType: 'lever', sourceIds: new Set(['l']) },
    );
    expect(lever[0]).toMatchObject({ companySlug: 'labs', company: 'Company' });
    expect(() =>
      toCollectableSources([], { sourceIds: new Set(['missing']) }),
    ).toThrowError(/does not exist/);
    expect(() =>
      toCollectableSources([
        {
          id: 'x',
          type: 'generic-page',
          enabled: true,
          displayName: 'X',
          tags: [],
          trackIds: [],
          settings: { url: 'https://example.test' },
        },
      ]),
    ).toThrowError(/No enabled supported/);
  });

  it('handles entity, localhost, timestamp and optional normalization branches', () => {
    expect(htmlToPlainText('&#65; &#x42; &unknown;')).toBe('A B');
    expect(htmlToPlainText(' <style>x</style> ')).toBeUndefined();
    const source = {
      id: 'g',
      type: 'greenhouse' as const,
      displayName: 'G',
      enabled: true,
      company: 'G',
      requestTimeoutMs: 1000,
      requestsPerSecond: 1,
      boardToken: 'g',
    };
    expect(
      normalizeCollectedJob(
        source,
        {
          externalId: '1',
          title: 'T',
          company: 'C',
          sourceUrl: 'http://localhost/job',
          rawEmploymentType: 'mystery',
          rawWorkplaceType: 'mystery',
        },
        '2026-01-01',
      ).job,
    ).not.toHaveProperty('employmentType');
    expect(() =>
      normalizeCollectedJob(
        source,
        {
          externalId: '',
          title: 'T',
          company: 'C',
          sourceUrl: 'https://example.test',
        },
        'bad',
      ),
    ).toThrow(CollectionError);
    expect(() =>
      normalizeCollectedJob(
        source,
        {
          externalId: '1',
          title: 'T',
          company: 'C',
          sourceUrl: 'https://user:pass@example.test',
        },
        '2026-01-01',
      ),
    ).toThrow(CollectionError);
  });
});
