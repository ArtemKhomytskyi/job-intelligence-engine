import type { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  completeCollectionRun,
  CollectionOrchestrator,
  CollectorRegistry,
  createCollectionRun,
  createExactJobFingerprint,
  recordCollectionSourceResult,
  ExistingCollectionPersistence,
  GenericExtractionEngine,
  GenericWebCollector,
  GetRecommendationDetails,
  GetRecommendationReport,
  saveRecommendation,
  saveScore,
  ProcessCollectedJobs,
  RunFullPipeline,
  SingleActivePipelineRunner,
  CreateRecommendations,
  TransactionalProcessingRepository,
  TransactionalRecommendationBatchRepository,
  updateJobStatus,
  UpdateJobApplicationStatus,
  upsertJob,
  upsertJobSource,
  type ScoreWrite,
  type RecommendationBatchRepository,
  type RecommendationBatchWrite,
  type JobCollector,
  type BrowserPageRenderer,
  type HtmlPageAcquirer,
} from '../../src/application/index.js';
import {
  NORMALIZATION_VERSION,
  createPercentage,
  normalizeJobForProcessing,
  type NormalizedJobPosting,
} from '../../src/domain/index.js';
import {
  CheerioDocumentExtractor,
  createPrismaClient,
  PrismaTransactionManager,
  PrismaRecommendationReportRepository,
  PrismaRecommendationBatchRepository,
  PrismaDatabaseHealth,
  NodeLocalServer,
  Sha256ProcessingHasher,
} from '../../src/infrastructure/index.js';
import { createLocalReportHandler } from '../../src/interfaces/web/local-report-handler.js';

let client: PrismaClient;
let clientForCleanup: PrismaClient | undefined;
let transactions: PrismaTransactionManager;

beforeAll(() => {
  const databaseUrl = requireTestDatabaseUrl();
  client = createPrismaClient(databaseUrl);
  clientForCleanup = client;
  transactions = new PrismaTransactionManager(client);
});

afterAll(async () => {
  await clientForCleanup?.$disconnect();
});

beforeEach(async () => {
  await client.recommendation.deleteMany();
  await client.recommendationBatch.deleteMany();
  await client.scoreComponent.deleteMany();
  await client.jobScore.deleteMany();
  await client.jobProcessingDecision.deleteMany();
  await client.jobProcessingRun.deleteMany();
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
  it('persists and idempotently retrieves full recommendation batches', async () => {
    await persistSource('source-a', 'Source A');
    await upsertJob(transactions, makePosting());
    await new ProcessCollectedJobs(
      new TransactionalProcessingRepository(transactions),
      { now: () => new Date('2026-07-30T10:00:00.000Z') },
      { debug() {}, info() {}, warn() {}, error() {} },
      new Sha256ProcessingHasher(),
    ).execute(processingInput());
    expect(
      await new PrismaRecommendationBatchRepository(
        client,
      ).listEligibleCandidates(10),
    ).toEqual([expect.objectContaining({ sourceIds: ['source-a'] })]);
    const makeService = () =>
      new CreateRecommendations(
        new TransactionalRecommendationBatchRepository(transactions),
        { now: () => new Date('2026-07-30T12:00:00.000Z') },
        new Sha256ProcessingHasher(),
      );
    const results = await Promise.all([
      makeService().execute(recommendationInput()),
      makeService().execute(recommendationInput()),
    ]);
    const first = results.find((item) => !item.reused);
    const repeated = results.find((item) => item.reused);
    expect(first).toMatchObject({ selectedCount: 1, reused: false });
    if (first === undefined) throw new Error('Expected one created batch.');
    expect(first.items[0]).toMatchObject({ rank: 1, inputRevisionNumber: 0 });
    expect(first.items[0]?.score.components).toHaveLength(13);
    expect(repeated).toMatchObject({ id: first.id, reused: true });
    expect(await client.recommendationBatch.count()).toBe(1);
    expect(await client.recommendation.count()).toBe(1);
    expect(await client.jobScore.count()).toBe(1);
  });

  it('loads complete reports and persists automatic and explicit application status', async () => {
    await persistSource('source-a', 'Source A');
    await upsertJob(transactions, makePosting());
    await new ProcessCollectedJobs(
      new TransactionalProcessingRepository(transactions),
      { now: () => new Date('2026-07-30T10:00:00.000Z') },
      { debug() {}, info() {}, warn() {}, error() {} },
      new Sha256ProcessingHasher(),
    ).execute(processingInput());
    await new CreateRecommendations(
      new TransactionalRecommendationBatchRepository(transactions),
      { now: () => new Date('2026-07-30T12:00:00.000Z') },
      new Sha256ProcessingHasher(),
    ).execute(recommendationInput());

    const repository = new PrismaRecommendationReportRepository(client);
    const report = await new GetRecommendationReport(repository).execute({
      sort: 'rank',
    });
    expect(report.batch).toMatchObject({
      selectedCount: 1,
      requestedLimit: 20,
    });
    expect(report.items[0]).toMatchObject({
      rank: 1,
      title: 'Platform Engineer',
      company: 'Example Labs',
      location: 'Berlin, DE',
      currentStatus: 'NEW',
    });
    const recommendationId = report.items[0]?.recommendationId;
    if (recommendationId === undefined)
      throw new Error('Expected a report recommendation.');

    const updater = new UpdateJobApplicationStatus(
      repository,
      { now: () => new Date('2026-07-30T13:00:00.000Z') },
      { debug() {}, info() {}, warn() {}, error() {} },
    );
    const detailsService = new GetRecommendationDetails(repository, updater);
    const viewed = await detailsService.execute(recommendationId);
    expect(viewed).toMatchObject({
      currentStatus: 'VIEWED',
      originalTitle: 'Platform Engineer',
      selectedTrackId: 'platform',
    });
    expect(viewed.components).toHaveLength(13);
    expect(viewed.description).toBe('Synthetic role description');
    await detailsService.execute(recommendationId);
    expect(await client.jobStatusHistory.count()).toBe(2);

    await updater.execute(recommendationId, 'APPLIED');
    await detailsService.execute(recommendationId);
    expect(await client.jobStatusHistory.count()).toBe(3);
    expect(
      await client.job.findFirstOrThrow({ select: { currentStatus: true } }),
    ).toEqual({ currentStatus: 'APPLIED' });

    const reloaded = await new GetRecommendationReport(
      new PrismaRecommendationReportRepository(client),
    ).execute({ sort: 'status-updated-desc' });
    expect(reloaded.items[0]?.currentStatus).toBe('APPLIED');
    expect(reloaded.latestState?.processing).toBeDefined();
    expect(reloaded.latestState?.recommendations).toBeDefined();
  });

  it('runs the full fixture pipeline, serves it, updates status in a browser, and verifies PostgreSQL', async () => {
    const posting = makePosting({
      description:
        '<strong>Persisted as text</strong> synthetic end-to-end role.',
    });
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
    const noOpLogger = { debug() {}, info() {}, warn() {}, error() {} };
    const config = recommendationInput();
    const pipeline = new SingleActivePipelineRunner(
      new RunFullPipeline({
        configuration: {
          load: () =>
            Promise.resolve({
              candidate: config.candidate,
              search: config.search,
              scoring: config.scoring,
              sources: config.sources,
            }),
        },
        collection: {
          execute: (input) =>
            new CollectionOrchestrator({
              registry: new CollectorRegistry([collector]),
              persistence: new ExistingCollectionPersistence(transactions),
              clock: { now: () => new Date('2026-08-02T10:00:00.000Z') },
              logger: noOpLogger,
            }).collect({
              sources: [
                {
                  id: 'source-a',
                  type: 'greenhouse',
                  displayName: 'Local fixture source',
                  enabled: true,
                  company: 'Example Labs',
                  requestTimeoutMs: 1_000,
                  requestsPerSecond: 1,
                  boardToken: 'fixture',
                },
              ],
              concurrency: input.concurrency,
              signal: input.signal,
              initiatedBy: input.initiatedBy,
            }),
        },
        processing: {
          execute: (input) =>
            new ProcessCollectedJobs(
              new TransactionalProcessingRepository(transactions),
              { now: () => new Date('2026-08-02T10:01:00.000Z') },
              noOpLogger,
              new Sha256ProcessingHasher(),
            ).execute({
              limit: input.limit,
              initiatedBy: input.initiatedBy,
              candidate: input.configuration.candidate,
              hardFilters: input.configuration.search.preferences.hardFilters,
              signal: input.signal,
            }),
        },
        recommendations: {
          execute: (input) =>
            new CreateRecommendations(
              new TransactionalRecommendationBatchRepository(transactions),
              { now: () => input.evaluationTime },
              new Sha256ProcessingHasher(),
            ).execute({
              limit: input.limit,
              candidate: input.configuration.candidate,
              search: input.configuration.search,
              scoring: input.configuration.scoring,
              sources: input.configuration.sources,
              signal: input.signal,
            }),
        },
        logger: noOpLogger,
        clock: { now: () => new Date('2026-08-02T12:01:00.000Z') },
      }),
    );
    const pipelineResult = await pipeline.execute({
      initiatedBy: 'web',
      collectionConcurrency: 1,
      processingLimit: 10,
      evaluationTime: new Date('2026-08-02T12:00:00.000Z'),
      signal: new AbortController().signal,
    });
    expect(pipelineResult).toMatchObject({
      collection: { createdJobs: 1 },
      processing: { eligibleCount: 1 },
      recommendations: { selectedCount: 1 },
    });

    const repository = new PrismaRecommendationReportRepository(client);
    const updater = new UpdateJobApplicationStatus(
      repository,
      { now: () => new Date('2026-08-02T13:00:00.000Z') },
      noOpLogger,
    );
    const runtime = {
      pipeline,
      getReport: new GetRecommendationReport(repository),
      getDetails: new GetRecommendationDetails(repository, updater),
      updateStatus: updater,
      health: new PrismaDatabaseHealth(client),
    };
    const server = new NodeLocalServer(
      createLocalReportHandler({
        runtime,
        logger: noOpLogger,
        pipelineSignal: new AbortController().signal,
        collectionConcurrency: 1,
        processingLimit: 10,
      }),
    );
    const address = await server.start('127.0.0.1', 0);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${address.url}/recommendations`);
      await page.getByRole('link', { name: 'Details' }).click();
      await page.getByRole('heading', { name: 'Score breakdown' }).waitFor();
      await page.getByRole('button', { name: 'Mark applied' }).click();
      await page.waitForURL(/notice=status-updated/u);
      expect(
        await page
          .getByText('<strong>Persisted as text</strong>', {
            exact: false,
          })
          .count(),
      ).toBeGreaterThan(0);
    } finally {
      await browser.close();
      await server.close();
    }
    expect(
      await client.job.findFirstOrThrow({ select: { currentStatus: true } }),
    ).toEqual({ currentStatus: 'APPLIED' });
    expect(
      await client.jobStatusHistory.findMany({
        orderBy: { changedAt: 'asc' },
        select: { toStatus: true },
      }),
    ).toEqual([
      { toStatus: 'NEW' },
      { toStatus: 'VIEWED' },
      { toStatus: 'APPLIED' },
    ]);
  });

  it('excludes authoritative APPLIED and SKIPPED statuses', async () => {
    await persistSource('source-a', 'Source A');
    const applied = await upsertJob(transactions, makePosting());
    const skipped = await upsertJob(
      transactions,
      makePosting(
        {
          source: {
            sourceId: 'source-a',
            externalId: 'external-b',
            sourceUrl: 'https://jobs.example.test/b',
          },
          title: 'Analytics Engineer',
          company: 'Other Labs',
        },
        {
          canonicalUrl: 'https://jobs.example.test/b',
          normalizedTitle: 'analytics engineer',
          normalizedCompany: 'other labs',
        },
      ),
    );
    await new ProcessCollectedJobs(
      new TransactionalProcessingRepository(transactions),
      { now: () => new Date('2026-07-30T10:00:00.000Z') },
      { debug() {}, info() {}, warn() {}, error() {} },
      new Sha256ProcessingHasher(),
    ).execute(processingInput());
    await updateJobStatus(transactions, {
      jobId: applied.job.id,
      targetStatus: 'APPLIED',
      changedAt: '2026-07-30T11:00:00.000Z',
    });
    await updateJobStatus(transactions, {
      jobId: skipped.job.id,
      targetStatus: 'SKIPPED',
      changedAt: '2026-07-30T11:00:00.000Z',
    });

    const batch = await new CreateRecommendations(
      new TransactionalRecommendationBatchRepository(transactions),
      { now: () => new Date('2026-07-30T12:00:00.000Z') },
      new Sha256ProcessingHasher(),
    ).execute(recommendationInput());

    expect(batch).toMatchObject({ selectedCount: 0, items: [] });
    expect(await client.jobScore.count()).toBe(0);
    expect(await client.recommendation.count()).toBe(0);
  });

  it('rolls back a recommendation batch when a score write fails', async () => {
    await persistSource('source-a', 'Source A');
    await upsertJob(transactions, makePosting());
    await new ProcessCollectedJobs(
      new TransactionalProcessingRepository(transactions),
      { now: () => new Date('2026-07-30T10:00:00.000Z') },
      { debug() {}, info() {}, warn() {}, error() {} },
      new Sha256ProcessingHasher(),
    ).execute(processingInput());
    const persisted = new TransactionalRecommendationBatchRepository(
      transactions,
    );
    const corruptingRepository: RecommendationBatchRepository = {
      listEligibleCandidates: (limit) =>
        persisted.listEligibleCandidates(limit),
      saveBatch: (input: RecommendationBatchWrite) =>
        persisted.saveBatch({
          ...input,
          items: input.items.map((item) => ({
            ...item,
            processingDecisionId: '00000000-0000-4000-8000-000000000000',
          })),
        }),
    };

    await expect(
      new CreateRecommendations(
        corruptingRepository,
        { now: () => new Date('2026-07-30T12:00:00.000Z') },
        new Sha256ProcessingHasher(),
      ).execute(recommendationInput()),
    ).rejects.toThrow();
    expect(await client.recommendationBatch.count()).toBe(0);
    expect(await client.jobScore.count()).toBe(0);
    expect(await client.recommendation.count()).toBe(0);
  });

  it('persists normalized processing decisions and skips an identical rerun', async () => {
    await persistSource('source-a', 'Source A');
    await upsertJob(
      transactions,
      makePosting({
        description: 'Required: 5+ years of experience. German C1 required.',
      }),
    );
    const processor = new ProcessCollectedJobs(
      new TransactionalProcessingRepository(transactions),
      { now: () => new Date('2026-07-29T12:00:00.000Z') },
      { debug() {}, info() {}, warn() {}, error() {} },
      new Sha256ProcessingHasher(),
    );
    const input = {
      limit: 10,
      initiatedBy: 'database-test',
      candidate: {
        id: 'synthetic-candidate',
        displayName: 'Synthetic Candidate',
        education: [],
        professionalExperienceSummary: 'Synthetic.',
        skills: [],
        languages: [],
        citizenships: ['DE'],
        workAuthorizations: [{ country: 'DE', status: 'citizen' as const }],
        preferredEmploymentTypes: ['full-time' as const],
        location: {
          country: 'DE',
          willingToRelocate: false,
          relocationCountries: [],
        },
      },
      hardFilters: {
        allowedCountries: ['DE'],
        allowedCountryGroups: ['EU' as const],
        rejectUnknownLocation: false,
        unknownCandidateLanguageLevelPolicy: 'reject' as const,
        maximumSeniority: 'mid' as const,
        maximumRequiredExperienceYears: 3,
        allowMandatoryPhd: false,
        excludedCompanies: [],
        excludedIndustries: [],
        excludedTitlePhrases: [],
        rejectUnknownIndustry: false,
        removableTrackingParameters: ['utm_source'],
        companyLegalSuffixes: ['GmbH'],
      },
      signal: new AbortController().signal,
    };

    const first = await processor.execute(input);
    const second = await processor.execute(input);
    const decision = await client.jobProcessingDecision.findFirstOrThrow();
    const storedJob = await client.job.findFirstOrThrow();

    expect(first).toMatchObject({ rejectedCount: 1, skippedCount: 0 });
    expect(second).toMatchObject({ rejectedCount: 0, skippedCount: 1 });
    expect(decision).toMatchObject({
      processingStatus: 'REJECTED',
      hardFilterDecision: 'REJECTED',
      fingerprintVersion: 1,
    });
    expect(decision.hardFilterReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_REQUIRED_LANGUAGE' }),
        expect.objectContaining({ code: 'EXPERIENCE_EXCEEDS_MAXIMUM' }),
      ]),
    );
    expect(storedJob).toMatchObject({
      normalizationVersion: NORMALIZATION_VERSION,
      normalizedLocationKey: 'hybrid|unspecified|de::berlin',
    });
    expect(storedJob.normalizedPayload).not.toBeNull();
    expect(await client.jobProcessingRun.findFirst()).toMatchObject({
      fingerprintVersion: 1,
      skippedCount: 0,
    });

    await processor.execute({
      ...input,
      hardFilters: {
        ...input.hardFilters,
        maximumRequiredExperienceYears: 6,
      },
    });
    expect(await client.jobProcessingDecision.count()).toBe(2);
    await upsertJob(
      transactions,
      makePosting({
        title: 'Updated Platform Engineer',
        description: 'Required: 5+ years of experience. German C1 required.',
        collectedAt: '2026-07-29T13:00:00.000Z',
      }),
    );
    await processor.execute(input);
    expect(await client.jobProcessingDecision.count()).toBe(3);
    expect(
      await client.jobProcessingDecision.count({
        where: { inputRevisionNumber: 1 },
      }),
    ).toBe(1);
  });

  it('prevents concurrent duplicate decisions with PostgreSQL uniqueness', async () => {
    await persistSource('source-a', 'Source A');
    await upsertJob(transactions, makePosting());
    const makeProcessor = () =>
      new ProcessCollectedJobs(
        new TransactionalProcessingRepository(transactions),
        { now: () => new Date('2026-07-29T12:00:00.000Z') },
        { debug() {}, info() {}, warn() {}, error() {} },
        new Sha256ProcessingHasher(),
      );
    const input = processingInput();
    const summaries = await Promise.all([
      makeProcessor().execute(input),
      makeProcessor().execute(input),
    ]);
    expect(await client.jobProcessingDecision.count()).toBe(1);
    expect(summaries.reduce((sum, item) => sum + item.skippedCount, 0)).toBe(1);
    expect(summaries.reduce((sum, item) => sum + item.eligibleCount, 0)).toBe(
      1,
    );
  });

  it('rolls back normalized state and its decision together', async () => {
    await persistSource('source-a', 'Source A');
    await upsertJob(
      transactions,
      makePosting({ title: 'Senior Platform Engineer' }),
    );
    const processable = await transactions.execute((repositories) =>
      repositories.processing.listProcessableJobs(1),
    );
    const normalized = normalizeJobForProcessing(
      processable[0]!,
      processingInput().hardFilters,
      '2026-07-29T12:00:00.000Z',
    );
    expect(normalized.status).toBe('SUCCESS');
    if (normalized.status !== 'SUCCESS') return;
    const run = await transactions.execute((repositories) =>
      repositories.processing.createRun({
        startedAt: '2026-07-29T12:00:00.000Z',
        initiatedBy: 'rollback-test',
        normalizationVersion: NORMALIZATION_VERSION,
        fingerprintVersion: 1,
        filterRulesVersion: 'hard-filters-v1',
        configFingerprint: 'rollback-config',
      }),
    );
    await expect(
      transactions.execute(async (repositories) => {
        await repositories.processing.saveDecision({
          jobId: normalized.job.id,
          inputRevisionNumber: normalized.job.inputRevisionNumber,
          normalizationVersion: NORMALIZATION_VERSION,
          fingerprintVersion: 1,
          filterRulesVersion: 'hard-filters-v1',
          configFingerprint: 'rollback-config',
          runId: run.id,
          processingStatus: 'ELIGIBLE',
          processedAt: '2026-07-29T12:00:00.000Z',
          normalizedJob: normalized.job,
          normalizationIssues: [],
        });
        throw new Error('deliberate processing rollback');
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_QUERY_FAILED' });
    expect(await client.jobProcessingDecision.count()).toBe(0);
    expect(await client.job.findFirstOrThrow()).toMatchObject({
      normalizedPayload: null,
      seniority: null,
    });
  });

  it('clears stale current normalization fields after a changed revision', async () => {
    await persistSource('source-a', 'Source A');
    await upsertJob(
      transactions,
      makePosting({
        title: 'Senior Platform Engineer',
        description:
          'A bachelor degree and 5+ years of experience are required.',
      }),
    );
    const processor = new ProcessCollectedJobs(
      new TransactionalProcessingRepository(transactions),
      { now: () => new Date('2026-07-29T12:00:00.000Z') },
      { debug() {}, info() {}, warn() {}, error() {} },
      new Sha256ProcessingHasher(),
    );
    await processor.execute(processingInput());
    expect(await client.job.findFirstOrThrow()).toMatchObject({
      seniority: 'senior',
      requiredEducation: 'bachelor',
    });
    await upsertJob(
      transactions,
      makePosting({
        title: 'Platform Engineer',
        description: 'A synthetic role with no formal requirements.',
        collectedAt: '2026-07-29T13:00:00.000Z',
      }),
    );
    await processor.execute(processingInput());
    expect(await client.job.findFirstOrThrow()).toMatchObject({
      seniority: null,
      requiredEducation: null,
      requiredExperience: null,
    });
  });

  it('persists acyclic duplicate relationships and protects decision history', async () => {
    const sharedApplicationUrl = 'https://apply.example.test/shared';
    await client.job.createMany({
      data: [
        {
          ...directJobData('https://jobs.example.test/duplicate-a'),
          applicationUrl: sharedApplicationUrl,
          firstSeenAt: new Date('2026-07-28T10:00:00.000Z'),
        },
        {
          ...directJobData('https://jobs.example.test/duplicate-b'),
          applicationUrl: sharedApplicationUrl,
          firstSeenAt: new Date('2026-07-29T10:00:00.000Z'),
        },
      ],
    });
    await new ProcessCollectedJobs(
      new TransactionalProcessingRepository(transactions),
      { now: () => new Date('2026-07-30T12:00:00.000Z') },
      { debug() {}, info() {}, warn() {}, error() {} },
      new Sha256ProcessingHasher(),
    ).execute(processingInput());
    const duplicate = await client.jobProcessingDecision.findFirstOrThrow({
      where: { processingStatus: 'DUPLICATE' },
    });
    expect(duplicate.primaryJobId).not.toBeNull();
    expect(duplicate.primaryJobId).not.toBe(duplicate.jobId);
    if (duplicate.primaryJobId === null)
      throw new Error('Expected a primary duplicate relationship.');
    await expect(
      client.jobProcessingRun.delete({ where: { id: duplicate.runId } }),
    ).rejects.toBeDefined();
    await client.job.delete({ where: { id: duplicate.primaryJobId } });
    expect(
      await client.jobProcessingDecision.findUniqueOrThrow({
        where: { id: duplicate.id },
      }),
    ).toMatchObject({ primaryJobId: null });
  });

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

  it('extracts, normalizes, and persists a generic page through the real repositories', async () => {
    const fixedClock = { now: () => new Date('2026-07-29T10:00:00.000Z') };
    const noOpLogger = { debug() {}, info() {}, warn() {}, error() {} };
    const acquirer: HtmlPageAcquirer = {
      acquire: (request) =>
        Promise.resolve({
          requestedUrl: request.url,
          finalUrl: request.url,
          html: `<!doctype html><script type="application/ld+json">${JSON.stringify(
            {
              '@context': 'https://schema.org',
              '@type': 'JobPosting',
              title: 'Generic Persistence Engineer',
              hiringOrganization: { name: 'Synthetic Labs' },
              description: 'A deterministic generic extraction fixture.',
              url: request.url,
              identifier: { value: 'generic-persistence-1' },
            },
          )}</script>`,
          status: 200,
          requestCount: 1,
          redirectCount: 0,
          rendered: false,
          blockedResourceCount: 0,
        }),
    };
    const browser: BrowserPageRenderer = {
      render: () =>
        Promise.reject(new Error('Browser fallback was unexpected.')),
      close: () => Promise.resolve(),
    };
    const collector = new GenericWebCollector(
      'generic-page',
      new GenericExtractionEngine(
        acquirer,
        new CheerioDocumentExtractor(),
        browser,
        noOpLogger,
      ),
      fixedClock,
    );
    const summary = await new CollectionOrchestrator({
      registry: new CollectorRegistry([collector]),
      persistence: new ExistingCollectionPersistence(transactions),
      clock: fixedClock,
      logger: noOpLogger,
    }).collect({
      sources: [
        {
          id: 'generic-persistence',
          type: 'generic-page',
          displayName: 'Generic persistence fixture',
          enabled: true,
          company: 'Synthetic Labs',
          requestTimeoutMs: 1_000,
          requestsPerSecond: 1,
          url: 'https://jobs.example.test/generic-persistence',
          browserTimeoutMs: 3_000,
          maxDiscoveredLinks: 10,
          maxTraversalDepth: 0,
          allowBrowserFallback: false,
        },
      ],
      concurrency: 1,
      signal: new AbortController().signal,
      initiatedBy: 'generic-database-test',
    });

    expect(summary).toMatchObject({ status: 'COMPLETED', createdJobs: 1 });
    expect(await client.job.findFirst()).toMatchObject({
      title: 'Generic Persistence Engineer',
      company: 'Synthetic Labs',
      canonicalUrl: 'https://jobs.example.test/generic-persistence',
      metadata: { extractionStrategy: 'json-ld' },
    });
    expect(await client.collectionRunSourceResult.findFirst()).toMatchObject({
      discoveredCount: 1,
      insertedCount: 1,
      metadata: { pagesFetched: 1, browserFallbacks: 0 },
    });
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

function processingInput() {
  return {
    limit: 10,
    initiatedBy: 'database-test',
    candidate: {
      id: 'synthetic-candidate',
      displayName: 'Synthetic Candidate',
      education: [],
      professionalExperienceSummary: 'Synthetic.',
      skills: [],
      languages: [],
      citizenships: ['DE'],
      workAuthorizations: [{ country: 'DE', status: 'citizen' as const }],
      preferredEmploymentTypes: ['full-time' as const],
      location: {
        country: 'DE',
        willingToRelocate: false,
        relocationCountries: [],
      },
    },
    hardFilters: {
      allowedCountries: ['DE'],
      allowedCountryGroups: ['EU' as const],
      rejectUnknownLocation: false,
      unknownCandidateLanguageLevelPolicy: 'reject' as const,
      maximumSeniority: 'mid' as const,
      maximumRequiredExperienceYears: 3,
      allowMandatoryPhd: false,
      excludedCompanies: [],
      excludedIndustries: [],
      excludedTitlePhrases: [],
      rejectUnknownIndustry: false,
      removableTrackingParameters: ['utm_source'],
      companyLegalSuffixes: ['GmbH'],
    },
    signal: new AbortController().signal,
  } as const;
}

function recommendationInput() {
  const processing = processingInput();
  return {
    limit: 20,
    candidate: { ...processing.candidate, totalYearsExperience: 4 },
    search: {
      tracks: [
        {
          id: 'platform',
          displayName: 'Platform',
          enabled: true,
          targetTitles: ['Platform Engineer'],
          includeKeywords: [],
          excludeKeywords: [],
          preferredSkills: [],
          preferredIndustries: [],
          priority: 1,
          recommendationQuota: 5,
        },
      ],
      preferences: {
        preferredCountries: ['DE'],
        allowedRemotePolicies: ['hybrid' as const],
        willingToRelocate: false,
        relocationCountries: [],
        preferredCompanySizes: [],
        allowedEmploymentTypes: ['full-time' as const],
        excludedSeniorityLevels: [],
        excludedCompanies: [],
        excludedIndustries: [],
        requiredExperience: { minimumYears: 0 },
        dailyRecommendationLimit: 20,
        minimumAcceptableScore: createPercentage(0),
        maximumRecommendationsPerCompany: 5,
        hardFilters: processing.hardFilters,
      },
    },
    scoring: {
      weights: {
        titleRelevance: createPercentage(18),
        skills: createPercentage(16),
        experience: createPercentage(12),
        location: createPercentage(10),
        workAuthorization: createPercentage(10),
        education: createPercentage(6),
        language: createPercentage(6),
        companyPreference: createPercentage(5),
        freshness: createPercentage(7),
        salary: createPercentage(4),
        sourceQuality: createPercentage(4),
        applicationSimplicity: createPercentage(2),
      },
      settings: {
        titleAliases: [],
        skillAliases: [],
        experienceToleranceYears: 1,
        freshnessFullScoreDays: 3,
        freshnessHorizonDays: 60,
        sourceQuality: { 'generic-page': 70 },
        selector: {
          maximumSameTitle: 3,
          unknownCompanyJobsShareCap: false,
        },
      },
    },
    sources: [
      {
        id: 'source-a',
        type: 'generic-page' as const,
        enabled: true,
        displayName: 'Source A',
        tags: [],
        trackIds: [],
        settings: { url: 'https://jobs.example.test' },
      },
    ],
    signal: new AbortController().signal,
  } as const;
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
