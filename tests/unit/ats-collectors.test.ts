import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { Clock, HttpClient } from '../../src/application/index.js';
import {
  GreenhouseCollector,
  LeverCollector,
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
  };
}

describe('ATS collectors', () => {
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
  });
});
