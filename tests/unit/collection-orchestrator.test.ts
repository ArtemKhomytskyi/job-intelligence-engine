import { describe, expect, it } from 'vitest';
import {
  CollectionError,
  CollectionOrchestrator,
  CollectorRegistry,
  normalizeCollectedJob,
  type Clock,
  type CollectionPersistence,
  type CollectionSourceResultWrite,
  type JobCollector,
  type Logger,
} from '../../src/application/index.js';

const source = {
  id: 'g',
  type: 'greenhouse' as const,
  displayName: 'Acme',
  enabled: true,
  company: 'Acme',
  requestTimeoutMs: 1000,
  requestsPerSecond: 2,
  boardToken: 'acme',
};
const posting = normalizeCollectedJob(
  source,
  {
    externalId: '1',
    title: 'Engineer',
    company: 'Acme',
    sourceUrl: 'https://example.test/jobs/1',
  },
  '2026-07-29T10:00:00Z',
);
const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
function clock(): Clock {
  const values = [
    new Date('2026-07-29T10:00:00Z'),
    new Date('2026-07-29T10:00:01Z'),
    new Date('2026-07-29T10:00:02Z'),
  ];
  return { now: () => values.shift() ?? new Date('2026-07-29T10:00:02Z') };
}

describe('collection orchestrator', () => {
  it('continues after a job persistence failure and records partial counters', async () => {
    const recorded: CollectionSourceResultWrite[] = [];
    let jobs = 0;
    const persistence: CollectionPersistence = {
      upsertSource: () => Promise.resolve(),
      createRun: () =>
        Promise.resolve({
          id: 'run',
          startedAt: '2026-07-29T10:00:00Z',
          status: 'RUNNING',
          initiatedBy: 'test',
          discoveredCount: 0,
          insertedCount: 0,
          updatedCount: 0,
          duplicateCount: 0,
          failedCount: 0,
        }),
      upsertJob: () => {
        jobs += 1;
        return jobs === 1
          ? Promise.resolve({ outcome: 'CREATED', job: persistedJob() })
          : Promise.reject(new Error('synthetic'));
      },
      recordSourceResult: (input) => {
        recorded.push(input);
        return Promise.resolve();
      },
      completeRun: (input) =>
        Promise.resolve({
          ...input,
          id: input.runId,
          startedAt: '2026-07-29T10:00:00Z',
          initiatedBy: 'test',
        }),
    };
    const collector: JobCollector = {
      sourceType: 'greenhouse',
      collect: () =>
        Promise.resolve({
          sourceId: 'g',
          sourceType: 'greenhouse',
          requestCount: 1,
          rawJobCount: 2,
          invalidJobCount: 0,
          warnings: [],
          candidates: [posting, posting],
          durationMs: 1,
        }),
    };
    const summary = await new CollectionOrchestrator({
      registry: new CollectorRegistry([collector]),
      persistence,
      clock: clock(),
      logger,
    }).collect({
      sources: [source],
      concurrency: 1,
      signal: new AbortController().signal,
      initiatedBy: 'test',
    });
    expect(summary).toMatchObject({
      status: 'PARTIALLY_FAILED',
      createdJobs: 1,
      persistenceFailures: 1,
    });
    expect(recorded[0]).toMatchObject({
      status: 'PARTIALLY_FAILED',
      failedCount: 1,
    });
  });

  it('isolates a failed source and validates concurrency', async () => {
    const persistence = fakePersistence();
    const collector: JobCollector = {
      sourceType: 'greenhouse',
      collect: () =>
        Promise.reject(new CollectionError('SOURCE_UNAVAILABLE', 'offline')),
    };
    const orchestrator = new CollectionOrchestrator({
      registry: new CollectorRegistry([collector]),
      persistence,
      clock: clock(),
      logger,
    });
    await expect(
      orchestrator.collect({
        sources: [source],
        concurrency: 0,
        signal: new AbortController().signal,
        initiatedBy: 'test',
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_CONFIGURATION_INVALID' });
    await expect(
      orchestrator.collect({
        sources: [source],
        concurrency: 1,
        signal: new AbortController().signal,
        initiatedBy: 'test',
      }),
    ).resolves.toMatchObject({ status: 'FAILED', failedSourceCount: 1 });
  });

  it('bounds same-provider work and preserves configured result order', async () => {
    let active = 0;
    let maximumActive = 0;
    const collector: JobCollector = {
      sourceType: 'greenhouse',
      collect: async (candidate) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return {
          sourceId: candidate.id,
          sourceType: 'greenhouse',
          requestCount: 1,
          rawJobCount: 0,
          invalidJobCount: 0,
          warnings: [],
          candidates: [],
          durationMs: 5,
        };
      },
    };
    const sources = ['first', 'second', 'third'].map((id) => ({
      ...source,
      id,
    }));
    const summary = await new CollectionOrchestrator({
      registry: new CollectorRegistry([collector]),
      persistence: fakePersistence(),
      clock: clock(),
      logger,
    }).collect({
      sources,
      concurrency: 3,
      perProviderConcurrency: 1,
      signal: new AbortController().signal,
      initiatedBy: 'test',
    });
    expect(maximumActive).toBe(1);
    expect(summary.sourceSummaries.map((item) => item.sourceId)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });
});

function persistedJob() {
  return {
    id: 'job',
    title: 'Engineer',
    company: 'Acme',
    canonicalUrl: 'https://example.test/jobs/1',
    normalizedTitle: 'engineer',
    normalizedCompany: 'acme',
    currentStatus: 'NEW' as const,
    firstSeenAt: '2026-07-29T10:00:00Z',
    lastSeenAt: '2026-07-29T10:00:00Z',
    lastCollectedAt: '2026-07-29T10:00:00Z',
    createdAt: '2026-07-29T10:00:00Z',
    updatedAt: '2026-07-29T10:00:00Z',
  };
}
function fakePersistence(): CollectionPersistence {
  return {
    upsertSource: () => Promise.resolve(),
    createRun: () =>
      Promise.resolve({
        id: 'run',
        startedAt: '2026-07-29T10:00:00Z',
        status: 'RUNNING',
        initiatedBy: 'test',
        discoveredCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        duplicateCount: 0,
        failedCount: 0,
      }),
    upsertJob: () =>
      Promise.resolve({ outcome: 'CREATED', job: persistedJob() }),
    recordSourceResult: () => Promise.resolve(),
    completeRun: (input) =>
      Promise.resolve({
        id: input.runId,
        startedAt: '2026-07-29T10:00:00Z',
        completedAt: input.completedAt,
        status: input.status,
        initiatedBy: 'test',
        discoveredCount: input.discoveredCount,
        insertedCount: input.insertedCount,
        updatedCount: input.updatedCount,
        duplicateCount: input.duplicateCount,
        failedCount: input.failedCount,
      }),
  };
}
