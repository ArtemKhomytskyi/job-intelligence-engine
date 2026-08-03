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
});
