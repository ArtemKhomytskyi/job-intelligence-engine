import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  completeCollectionRun,
  CollectionOrchestrator,
  CollectorRegistry,
  createCollectionRun,
  createExactJobFingerprint,
  recordCollectionSourceResult,
  ExistingCollectionPersistence,
  saveRecommendation,
  saveScore,
  updateJobStatus,
  upsertJob,
  upsertJobSource,
  type ScoreWrite,
  type JobCollector,
} from '../../src/application/index.js';
import type { NormalizedJobPosting } from '../../src/domain/index.js';
import {
  createPrismaClient,
  PrismaTransactionManager,
} from '../../src/infrastructure/index.js';

let client: PrismaClient;
let transactions: PrismaTransactionManager;

beforeAll(() => {
  const databaseUrl = requireTestDatabaseUrl();
  client = createPrismaClient(databaseUrl);
  transactions = new PrismaTransactionManager(client);
});

afterAll(async () => {
  await client.$disconnect();
});

beforeEach(async () => {
  await client.recommendation.deleteMany();
  await client.scoreComponent.deleteMany();
  await client.jobScore.deleteMany();
  await client.collectionRunSourceResult.deleteMany();
  await client.collectionRun.deleteMany();
  await client.jobRevision.deleteMany();
  await client.jobStatusHistory.deleteMany();
  await client.jobFingerprint.deleteMany();
  await client.jobSourceReference.deleteMany();
  await client.job.deleteMany();
  await client.jobSource.deleteMany();
});

describe('PostgreSQL persistence repositories', () => {
  it('runs the collection orchestration through real repositories', async () => {
    const posting = makePosting();
    const collector: JobCollector = {
      sourceType: 'greenhouse',
      collect: () =>
        Promise.resolve({
          sourceId: 'source-a',
          sourceType: 'greenhouse',
          requestCount: 1,
          rawJobCount: 1,
          invalidJobCount: 0,
          warnings: [],
          candidates: [posting],
          durationMs: 1,
        }),
    };
    const fixedClock = { now: () => new Date('2026-07-29T10:00:00.000Z') };
    const noOpLogger = { debug() {}, info() {}, warn() {}, error() {} };
    const summary = await new CollectionOrchestrator({
      registry: new CollectorRegistry([collector]),
      persistence: new ExistingCollectionPersistence(transactions),
      clock: fixedClock,
      logger: noOpLogger,
    }).collect({
      sources: [
        {
          id: 'source-a',
          type: 'greenhouse',
          displayName: 'Source A',
          enabled: true,
          company: 'Example Company',
          requestTimeoutMs: 1_000,
          requestsPerSecond: 1,
          boardToken: 'example',
        },
      ],
      concurrency: 1,
      signal: new AbortController().signal,
      initiatedBy: 'database-test',
    });

    expect(summary).toMatchObject({ status: 'COMPLETED', createdJobs: 1 });
    expect(await client.collectionRun.count()).toBe(1);
    expect(await client.collectionRunSourceResult.count()).toBe(1);
    expect(await client.job.count()).toBe(1);
  });

  it('upserts sources idempotently and retrieves by configuration ID', async () => {
    const first = await persistSource('source-a', 'Source A');
    const second = await persistSource('source-a', 'Source A updated');
    const found = await transactions.execute((repositories) =>
      repositories.sources.findByConfigSourceId('source-a'),
    );

    expect(second.id).toBe(first.id);
    expect(found?.displayName).toBe('Source A updated');
    expect(await client.jobSource.count()).toBe(1);
  });

  it('creates, matches, links, updates, and revises jobs idempotently', async () => {
    await persistSource('source-a', 'Source A');
    await persistSource('source-b', 'Source B');
    const initial = makePosting();

    const created = await upsertJob(transactions, initial);
    const unchanged = await upsertJob(
      transactions,
      makePosting({ collectedAt: '2026-07-29T11:00:00.000Z' }),
    );
    const linked = await upsertJob(
      transactions,
      makePosting(
        {
          source: {
            sourceId: 'source-b',
            externalId: 'source-b-external',
            sourceUrl: 'https://jobs.example.test/a',
          },
          collectedAt: '2026-07-29T12:00:00.000Z',
        },
        {
          sourceTrace: {
            sourceId: 'source-b',
            externalId: 'source-b-external',
          },
        },
      ),
    );
    const updated = await upsertJob(
      transactions,
      makePosting({
        title: 'Senior Platform Engineer',
        collectedAt: '2026-07-29T13:00:00.000Z',
      }),
    );

    expect(created.outcome).toBe('CREATED');
    expect(unchanged.outcome).toBe('UNCHANGED');
    expect(linked.outcome).toBe('LINKED_TO_EXISTING');
    expect(updated).toMatchObject({ outcome: 'UPDATED', revisionNumber: 1 });
    expect(updated.job.id).toBe(created.job.id);
    expect(updated.job.firstSeenAt).toBe('2026-07-29T10:00:00.000Z');
    expect(updated.job.lastSeenAt).toBe('2026-07-29T13:00:00.000Z');
    expect(await client.job.count()).toBe(1);
    expect(await client.jobSourceReference.count()).toBe(2);
    expect(await client.jobRevision.count()).toBe(1);
  });

  it('matches by exact fingerprint and rejects conflicting identity signals', async () => {
    await persistSource('source-a', 'Source A');
    const seeded = await upsertJob(transactions, makePosting());
    const incoming = makePosting(
      {
        source: {
          sourceId: 'source-a',
          externalId: 'external-fingerprint',
          sourceUrl: 'https://jobs.example.test/fingerprint',
        },
      },
      { canonicalUrl: 'https://jobs.example.test/fingerprint' },
    );
    const incomingFingerprint = createExactJobFingerprint(incoming);
    await client.jobFingerprint.create({
      data: {
        jobId: seeded.job.id,
        fingerprint: incomingFingerprint.value,
        algorithm: incomingFingerprint.algorithm,
        version: incomingFingerprint.version,
        kind: incomingFingerprint.kind,
      },
    });
    const matched = await transactions.execute((repositories) =>
      repositories.jobs.upsert({
        posting: incoming,
        fingerprint: incomingFingerprint,
      }),
    );
    expect(matched.job.id).toBe(seeded.job.id);

    const other = await client.job.create({
      data: directJobData('https://jobs.example.test/conflict'),
    });
    await expect(
      transactions.execute((repositories) =>
        repositories.jobs.upsert({
          posting: makePosting({}, { canonicalUrl: other.canonicalUrl }),
          fingerprint: createExactJobFingerprint(makePosting()),
        }),
      ),
    ).rejects.toMatchObject({ code: 'JOB_IDENTITY_CONFLICT' });
  });

  it('stores current status and immutable history atomically and idempotently', async () => {
    await persistSource('source-a', 'Source A');
    const created = await upsertJob(transactions, makePosting());
    const viewed = await updateJobStatus(transactions, {
      jobId: created.job.id,
      targetStatus: 'VIEWED',
      changedAt: '2026-07-29T14:00:00.000Z',
    });
    const repeated = await updateJobStatus(transactions, {
      jobId: created.job.id,
      targetStatus: 'VIEWED',
      changedAt: '2026-07-29T15:00:00.000Z',
    });
    await updateJobStatus(transactions, {
      jobId: created.job.id,
      targetStatus: 'APPLIED',
      changedAt: '2026-07-29T16:00:00.000Z',
      reason: 'Synthetic test transition',
    });
    const history = await transactions.execute((repositories) =>
      repositories.jobs.listStatusHistory(created.job.id),
    );

    expect(viewed.changed).toBe(true);
    expect(repeated.changed).toBe(false);
    expect(history.map((entry) => entry.toStatus)).toEqual([
      'NEW',
      'VIEWED',
      'APPLIED',
    ]);
  });

  it('preserves score history and ordered recommendation batches', async () => {
    await persistSource('source-a', 'Source A');
    const job = (await upsertJob(transactions, makePosting())).job;
    const first = await saveScore(
      transactions,
      makeScore(job.id, 70, '2026-07-29T14:00:00.000Z'),
    );
    const latest = await saveScore(
      transactions,
      makeScore(job.id, 82, '2026-07-29T15:00:00.000Z'),
    );
    const found = await transactions.execute((repositories) =>
      repositories.scores.findLatest(job.id, 'track-a'),
    );
    await saveRecommendation(transactions, {
      jobId: job.id,
      scoreId: latest.id,
      searchTrackId: 'track-a',
      rank: 2,
      recommendationBatch: 'batch-a',
      explanation: 'Synthetic explanation',
      generatedAt: '2026-07-29T16:00:00.000Z',
      active: true,
    });

    expect(found?.id).toBe(latest.id);
    expect(first.id).not.toBe(latest.id);
    expect(await client.jobScore.count()).toBe(2);
    expect(found?.components).toHaveLength(1);
    const batch = await transactions.execute((repositories) =>
      repositories.recommendations.findBatch('batch-a'),
    );
    expect(batch.map((item) => item.rank)).toEqual([2]);
    await expect(
      saveRecommendation(transactions, {
        ...batch[0]!,
        scoreId: first.id,
        rank: 1,
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_CONSTRAINT_VIOLATION' });
  });

  it('persists collection results and rolls back deliberate transaction failures', async () => {
    await persistSource('source-a', 'Source A');
    const run = await createCollectionRun(transactions, {
      startedAt: '2026-07-29T10:00:00.000Z',
      initiatedBy: 'integration-test',
    });
    await recordCollectionSourceResult(transactions, {
      collectionRunId: run.id,
      configSourceId: 'source-a',
      status: 'COMPLETED',
      discoveredCount: 4,
      insertedCount: 2,
      updatedCount: 1,
      duplicateCount: 1,
      invalidCount: 0,
      failedCount: 0,
      startedAt: '2026-07-29T10:00:00.000Z',
      completedAt: '2026-07-29T10:01:00.000Z',
    });
    const completed = await completeCollectionRun(transactions, {
      runId: run.id,
      status: 'COMPLETED',
      completedAt: '2026-07-29T10:01:00.000Z',
      discoveredCount: 4,
      insertedCount: 2,
      updatedCount: 1,
      duplicateCount: 1,
      failedCount: 0,
    });
    expect(completed).toMatchObject({
      status: 'COMPLETED',
      discoveredCount: 4,
    });

    await expect(
      transactions.execute(async (repositories) => {
        await repositories.sources.upsert({
          configSourceId: 'rolled-back-source',
          type: 'generic-page',
          displayName: 'Rolled back',
          enabled: true,
        });
        throw new Error('deliberate rollback');
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_QUERY_FAILED' });
    expect(
      await client.jobSource.findUnique({
        where: { configSourceId: 'rolled-back-source' },
      }),
    ).toBeNull();
  });
});

function requireTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (value === undefined) throw new Error('TEST_DATABASE_URL is required.');
  const parsed = new URL(value);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    !/(?:^|[-_])test(?:$|[-_])/u.test(parsed.pathname.slice(1).toLowerCase())
  ) {
    throw new Error(
      'Refusing database tests outside a localhost test database.',
    );
  }
  return value;
}

function persistSource(configSourceId: string, displayName: string) {
  return upsertJobSource(transactions, {
    configSourceId,
    type: 'generic-page',
    displayName,
    enabled: true,
    settings: { url: `https://${configSourceId}.example.test/jobs` },
  });
}

function makePosting(
  jobOverrides: Partial<NormalizedJobPosting['job']> = {},
  normalizedOverrides: Partial<NormalizedJobPosting> = {},
): NormalizedJobPosting {
  const sourceId = jobOverrides.source?.sourceId ?? 'source-a';
  const externalId = jobOverrides.source?.externalId ?? 'external-a';
  return {
    job: {
      id: 'input-job',
      source: {
        sourceId,
        externalId,
        sourceUrl: 'https://jobs.example.test/a',
      },
      title: 'Platform Engineer',
      company: 'Example Labs',
      description: 'Synthetic role description',
      locations: [{ country: 'DE', city: 'Berlin' }],
      remotePolicy: 'hybrid',
      employmentType: 'full-time',
      requiredLanguages: [],
      skills: [{ name: 'TypeScript' }],
      collectedAt: '2026-07-29T10:00:00.000Z',
      ...jobOverrides,
    },
    canonicalUrl: 'https://jobs.example.test/a',
    normalizedTitle: 'platform engineer',
    normalizedCompany: 'example labs',
    normalizedSkills: ['typescript'],
    sourceTrace: { sourceId, externalId },
    ...normalizedOverrides,
  };
}

function makeScore(
  jobId: string,
  totalScore: number,
  calculatedAt: string,
): ScoreWrite {
  return {
    jobId,
    searchTrackId: 'track-a',
    totalScore,
    confidence: 90,
    positiveReasons: ['Synthetic positive'],
    concerns: [],
    missingData: [],
    scoringVersion: 'v1',
    calculatedAt,
    components: [
      {
        key: 'skills',
        rawScore: totalScore,
        weight: 20,
        contribution: totalScore * 0.2,
        confidence: 90,
        reasons: ['Synthetic component'],
      },
    ],
  };
}

function directJobData(canonicalUrl: string) {
  const timestamp = new Date('2026-07-29T10:00:00.000Z');
  return {
    title: 'Other role',
    company: 'Other company',
    canonicalUrl,
    normalizedTitle: 'other role',
    normalizedCompany: 'other company',
    locations: [],
    requiredLanguages: [],
    skills: [],
    normalizedSkills: [],
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    lastCollectedAt: timestamp,
  };
}
