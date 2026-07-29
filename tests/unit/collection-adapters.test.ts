import { describe, expect, it, vi } from 'vitest';
import {
  CollectionError,
  normalizeCollectedJob,
} from '../../src/application/index.js';
import {
  AbortableSleeper,
  StreamLogger,
  SystemClock,
} from '../../src/infrastructure/index.js';
import { formatCollectionSummary } from '../../src/interfaces/cli/collect-command.js';

describe('collection support adapters', () => {
  it('uses system time and emits structured log levels', () => {
    expect(new SystemClock().now()).toBeInstanceOf(Date);
    const lines: string[] = [];
    const logger = new StreamLogger((line) => lines.push(line), true);
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e', { sourceId: 'safe' });
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain('"sourceId":"safe"');
    const quiet: string[] = [];
    new StreamLogger((line) => quiet.push(line)).debug('hidden');
    expect(quiet).toEqual([]);
  });

  it('supports elapsed and cancelled sleeps', async () => {
    vi.useFakeTimers();
    const sleeper = new AbortableSleeper();
    const controller = new AbortController();
    const elapsed = sleeper.sleep(10, controller.signal);
    await vi.advanceTimersByTimeAsync(10);
    await expect(elapsed).resolves.toBeUndefined();
    const cancelled = sleeper.sleep(10, controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({
      code: 'COLLECTION_ABORTED',
    });
    await expect(sleeper.sleep(1, controller.signal)).rejects.toBeInstanceOf(
      CollectionError,
    );
    vi.useRealTimers();
  });

  it('normalizes explicit categories and conservative metadata', () => {
    const source = {
      id: 'l',
      type: 'lever' as const,
      displayName: 'Acme',
      company: 'Acme',
      enabled: true,
      requestTimeoutMs: 1000,
      requestsPerSecond: 1,
      companySlug: 'acme',
    };
    const result = normalizeCollectedJob(
      source,
      {
        externalId: ' 1 ',
        title: ' Engineer ',
        company: ' ACME ',
        sourceUrl: 'https://example.test/job#fragment',
        description: '<div>A</div><br>B',
        locationText: ' Berlin ',
        department: ' R&D ',
        rawEmploymentType: 'Contractor',
        rawWorkplaceType: 'On-site',
        metadata: { safe: true },
      },
      '2026-07-29T00:00:00Z',
    );
    expect(result.job).toMatchObject({
      description: 'A\nB',
      employmentType: 'contract',
      remotePolicy: 'onsite',
    });
    expect(result.canonicalUrl).toBe('https://example.test/job');
    expect(result.job.metadata).toMatchObject({
      locationText: 'Berlin',
      department: 'R&D',
      safe: true,
    });
  });

  it('renders stable human and JSON summaries', () => {
    const summary = {
      runId: 'r',
      startedAt: 'a',
      completedAt: 'b',
      status: 'COMPLETED' as const,
      attemptedSourceCount: 1,
      succeededSourceCount: 1,
      failedSourceCount: 0,
      rawJobsFound: 1,
      createdJobs: 1,
      updatedJobs: 0,
      unchangedJobs: 0,
      linkedJobs: 0,
      invalidJobs: 0,
      persistenceFailures: 0,
      durationMs: 1,
      sourceSummaries: [
        {
          sourceId: 'g',
          sourceName: 'G',
          sourceType: 'greenhouse',
          status: 'SUCCEEDED' as const,
          rawJobsFound: 1,
          createdJobs: 1,
          updatedJobs: 0,
          unchangedJobs: 0,
          linkedJobs: 0,
          invalidJobs: 0,
          persistenceFailures: 0,
          requestCount: 1,
          durationMs: 1,
        },
      ],
    };
    expect(formatCollectionSummary(summary, false)).toContain('G: SUCCEEDED');
    expect(JSON.parse(formatCollectionSummary(summary, true))).toMatchObject({
      runId: 'r',
    });
  });
});
