import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { HttpClient, HttpRequest } from '../../src/application/index.js';
import { ConditionalCachingHttpClient } from '../../src/infrastructure/index.js';

describe('conditional HTTP cache', () => {
  it('sends persisted validators and reuses the cached body on 304', async () => {
    let stored:
      | {
          key: string;
          responseBody: string;
          etag: string | null;
          lastModified: string | null;
          finalUrl: string;
          status: number;
          fetchedAt: Date;
        }
      | undefined;
    const prisma = {
      httpCollectionCache: {
        findUnique: () => Promise.resolve(stored ?? null),
        upsert: (input: {
          create: NonNullable<typeof stored>;
          update: NonNullable<typeof stored>;
        }) => {
          stored = input.create;
          return Promise.resolve(input.create);
        },
      },
    } as unknown as PrismaClient;
    const requests: HttpRequest[] = [];
    let calls = 0;
    const delegate: HttpClient = {
      getJson: () => Promise.reject(new Error('not used')),
      getText: (request) => {
        requests.push(request);
        calls += 1;
        return Promise.resolve(
          calls === 1
            ? {
                data: '{"jobs":[]}',
                status: 200,
                attempts: 1,
                finalUrl: request.url,
                redirectCount: 0,
                headers: {
                  etag: '"revision-1"',
                  'last-modified': 'Mon, 03 Aug 2026 10:00:00 GMT',
                },
              }
            : {
                data: '',
                status: 304,
                attempts: 1,
                finalUrl: request.url,
                redirectCount: 0,
                notModified: true,
              },
        );
      },
    };
    const cache = new ConditionalCachingHttpClient(delegate, prisma);
    const request = requestFor('https://api.example.test/jobs');
    await expect(cache.getText(request)).resolves.toMatchObject({
      status: 200,
    });
    await expect(cache.getText(request)).resolves.toMatchObject({
      status: 304,
      data: '{"jobs":[]}',
    });
    expect(requests[1]?.headers).toMatchObject({
      'if-none-match': '"revision-1"',
      'if-modified-since': 'Mon, 03 Aug 2026 10:00:00 GMT',
    });
  });

  it('drops corrupt cached JSON and performs one unconditional refetch', async () => {
    let cached: null | {
      key: string;
      responseBody: string;
      etag: string;
      lastModified: null;
      finalUrl: string;
      status: number;
      fetchedAt: Date;
    } = {
      key: 'ignored',
      responseBody: '{corrupt',
      etag: '"stale"',
      lastModified: null,
      finalUrl: 'https://api.example.test/jobs',
      status: 200,
      fetchedAt: new Date('2026-08-03T10:00:00.000Z'),
    };
    let requests = 0;
    const prisma = {
      httpCollectionCache: {
        findUnique: () => Promise.resolve(cached),
        delete: () => {
          cached = null;
          return Promise.resolve();
        },
        upsert: () => Promise.resolve(),
      },
    } as unknown as PrismaClient;
    const delegate: HttpClient = {
      getJson: () => Promise.reject(new Error('not used')),
      getText: (request) => {
        requests += 1;
        return Promise.resolve(
          requests === 1
            ? {
                data: '',
                status: 304,
                attempts: 1,
                finalUrl: request.url,
                redirectCount: 0,
                notModified: true,
              }
            : {
                data: '{"jobs":[]}',
                status: 200,
                attempts: 1,
                finalUrl: request.url,
                redirectCount: 0,
              },
        );
      },
    };
    const result = await new ConditionalCachingHttpClient(
      delegate,
      prisma,
    ).getJson(requestFor('https://api.example.test/jobs'), {
      decode: (value) => value,
    });
    expect(result.data).toEqual({ jobs: [] });
    expect(requests).toBe(2);
  });
});

function requestFor(url: string): HttpRequest {
  return {
    url,
    timeoutMs: 1_000,
    signal: new AbortController().signal,
    rateLimitKey: 'api.example.test',
    minimumIntervalMs: 1,
  };
}
