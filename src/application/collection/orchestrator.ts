import type { JsonValue } from '../../domain/index.js';
import type {
  CollectionRunCompletion,
  CollectionSourceResultWrite,
  JobSourceWrite,
  JobUpsertOutcome,
} from '../persistence/models.js';
import { CollectorRegistry } from './collector-registry.js';
import { asCollectionError, CollectionError } from './errors.js';
import type {
  CollectableSource,
  CollectionFinalStatus,
  CollectionRequest,
  CollectionRunSummary,
  SourceCollectionStatus,
  SourceCollectionSummary,
} from './models.js';
import type { Clock, CollectionPersistence, Logger } from './ports.js';

export interface CollectionOrchestratorDependencies {
  readonly registry: CollectorRegistry;
  readonly persistence: CollectionPersistence;
  readonly clock: Clock;
  readonly logger: Logger;
}

export class CollectionOrchestrator {
  public constructor(
    private readonly dependencies: CollectionOrchestratorDependencies,
  ) {}

  public async collect(
    request: CollectionRequest,
  ): Promise<CollectionRunSummary> {
    if (
      !Number.isInteger(request.concurrency) ||
      request.concurrency < 1 ||
      request.concurrency > 8
    ) {
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        'Collection concurrency must be an integer from 1 through 8.',
      );
    }
    if (request.sources.length === 0) {
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        'At least one enabled supported source is required.',
      );
    }

    const started = this.dependencies.clock.now();
    let runId: string;
    try {
      runId = (
        await this.dependencies.persistence.createRun(
          started.toISOString(),
          request.initiatedBy,
        )
      ).id;
    } catch (cause: unknown) {
      throw new CollectionError(
        'COLLECTION_RUN_PERSISTENCE_FAILED',
        'The collection run could not be initialized.',
        {},
        { cause },
      );
    }

    const sourceSummaries = await this.collectSources(
      runId,
      request.sources,
      request.concurrency,
      request.perProviderConcurrency ?? Math.min(2, request.concurrency),
      request.signal,
    );
    const completed = this.dependencies.clock.now();
    const status = finalStatus(sourceSummaries, request.signal.aborted);
    const totals = aggregate(sourceSummaries);
    const completion: CollectionRunCompletion = {
      runId,
      status,
      completedAt: completed.toISOString(),
      discoveredCount: totals.rawJobsFound,
      insertedCount: totals.createdJobs,
      updatedCount: totals.updatedJobs,
      duplicateCount: totals.unchangedJobs + totals.linkedJobs,
      failedCount: totals.invalidJobs + totals.persistenceFailures,
      errorSummary: buildErrorSummary(sourceSummaries),
    };
    try {
      await this.dependencies.persistence.completeRun(completion);
    } catch (cause: unknown) {
      throw new CollectionError(
        'COLLECTION_RUN_PERSISTENCE_FAILED',
        'The collection run could not be finalized.',
        {},
        { cause },
      );
    }

    return {
      runId,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      status,
      attemptedSourceCount: sourceSummaries.length,
      succeededSourceCount: sourceSummaries.filter((summary) =>
        ['SUCCEEDED', 'PARTIALLY_FAILED'].includes(summary.status),
      ).length,
      failedSourceCount: sourceSummaries.filter(
        (summary) => summary.status === 'FAILED',
      ).length,
      ...totals,
      durationMs: Math.max(0, completed.getTime() - started.getTime()),
      sourceSummaries,
    };
  }

  private async collectSources(
    runId: string,
    sources: readonly CollectableSource[],
    concurrency: number,
    perProviderConcurrency: number,
    signal: AbortSignal,
  ): Promise<readonly SourceCollectionSummary[]> {
    if (
      !Number.isInteger(perProviderConcurrency) ||
      perProviderConcurrency < 1 ||
      perProviderConcurrency > concurrency
    )
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        'Per-provider concurrency must be an integer between 1 and total concurrency.',
      );
    const summaries = sources.map(
      (): SourceCollectionSummary | undefined => undefined,
    );
    let nextIndex = 0;
    const limiter = new ProviderConcurrencyLimiter(perProviderConcurrency);
    const worker = async (): Promise<void> => {
      while (!signal.aborted) {
        const index = nextIndex;
        if (index >= sources.length) return;
        nextIndex += 1;
        const source = sources[index];
        if (source === undefined) return;
        const release = await limiter.acquire(source.type);
        try {
          summaries[index] = await this.collectSource(runId, source, signal);
        } finally {
          release();
        }
      }
    };
    const workerCount = Math.min(concurrency, sources.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => worker()),
    );
    return summaries.filter(
      (summary): summary is SourceCollectionSummary => summary !== undefined,
    );
  }

  private async collectSource(
    runId: string,
    source: CollectableSource,
    signal: AbortSignal,
  ): Promise<SourceCollectionSummary> {
    const started = this.dependencies.clock.now();
    const base = {
      sourceId: source.id,
      sourceName: source.displayName,
      sourceType: source.type,
    };
    try {
      await this.dependencies.persistence.upsertSource(toSourceWrite(source));
      const collector = this.dependencies.registry.resolve(source.type);
      const result = await collector.collect(source, {
        collectedAt: started.toISOString(),
        signal,
      });
      const outcomes: Record<JobUpsertOutcome, number> = {
        CREATED: 0,
        UPDATED: 0,
        UNCHANGED: 0,
        LINKED_TO_EXISTING: 0,
      };
      let persistenceFailures = 0;
      for (const candidate of result.candidates) {
        if (signal.aborted) break;
        try {
          const upsert =
            await this.dependencies.persistence.upsertJob(candidate);
          outcomes[upsert.outcome] += 1;
        } catch {
          persistenceFailures += 1;
          this.dependencies.logger.warn('Job persistence failed.', {
            collectionRunId: runId,
            sourceId: source.id,
            errorCode: 'JOB_PERSISTENCE_FAILED',
          });
        }
      }
      const completed = this.dependencies.clock.now();
      const status: SourceCollectionStatus = signal.aborted
        ? 'CANCELLED'
        : persistenceFailures > 0
          ? 'PARTIALLY_FAILED'
          : 'SUCCEEDED';
      const summary: SourceCollectionSummary = {
        ...base,
        status,
        rawJobsFound: result.rawJobCount,
        createdJobs: outcomes.CREATED,
        updatedJobs: outcomes.UPDATED,
        unchangedJobs: outcomes.UNCHANGED,
        linkedJobs: outcomes.LINKED_TO_EXISTING,
        invalidJobs: result.invalidJobCount,
        persistenceFailures,
        requestCount: result.requestCount,
        durationMs: Math.max(0, completed.getTime() - started.getTime()),
        ...(persistenceFailures === 0
          ? {}
          : {
              failureCode: 'JOB_PERSISTENCE_FAILED',
              failureMessage: `${persistenceFailures} job persistence operation(s) failed.`,
            }),
      };
      await this.recordSource(
        runId,
        summary,
        started,
        completed,
        result.warnings.map((warning) => warning.code),
        result.diagnostics,
      );
      return summary;
    } catch (error: unknown) {
      const failure = asCollectionError(error, {
        sourceId: source.id,
        sourceType: source.type,
      });
      const completed = this.dependencies.clock.now();
      const cancelled = signal.aborted || failure.code === 'COLLECTION_ABORTED';
      const summary: SourceCollectionSummary = {
        ...base,
        status: cancelled ? 'CANCELLED' : 'FAILED',
        rawJobsFound: 0,
        createdJobs: 0,
        updatedJobs: 0,
        unchangedJobs: 0,
        linkedJobs: 0,
        invalidJobs: 0,
        persistenceFailures: 0,
        requestCount: failure.context.attempts ?? 0,
        durationMs: Math.max(0, completed.getTime() - started.getTime()),
        failureCode: failure.code,
        failureMessage: failure.message,
      };
      try {
        await this.recordSource(runId, summary, started, completed, []);
      } catch {
        this.dependencies.logger.error('Source result persistence failed.', {
          collectionRunId: runId,
          sourceId: source.id,
          errorCode: 'COLLECTION_RUN_PERSISTENCE_FAILED',
        });
      }
      return summary;
    }
  }

  private recordSource(
    runId: string,
    summary: SourceCollectionSummary,
    started: Date,
    completed: Date,
    warnings: readonly string[],
    diagnostics?: Readonly<Record<string, JsonValue>>,
  ): Promise<void> {
    const input: CollectionSourceResultWrite = {
      collectionRunId: runId,
      configSourceId: summary.sourceId,
      status: mapSourceStatus(summary.status),
      discoveredCount: summary.rawJobsFound,
      insertedCount: summary.createdJobs,
      updatedCount: summary.updatedJobs,
      duplicateCount: summary.unchangedJobs + summary.linkedJobs,
      invalidCount: summary.invalidJobs,
      failedCount: summary.persistenceFailures,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      ...(summary.failureCode === undefined
        ? {}
        : { errorCode: summary.failureCode }),
      ...(summary.failureMessage === undefined
        ? {}
        : { errorMessage: summary.failureMessage }),
      metadata: {
        unchangedCount: summary.unchangedJobs,
        linkedCount: summary.linkedJobs,
        requestCount: summary.requestCount,
        warnings,
        ...(diagnostics ?? {}),
      },
    };
    return this.dependencies.persistence.recordSourceResult(input);
  }
}

class ProviderConcurrencyLimiter {
  private readonly active = new Map<string, number>();
  private readonly waiting = new Map<string, Array<() => void>>();

  public constructor(private readonly maximum: number) {}

  public async acquire(key: string): Promise<() => void> {
    if ((this.active.get(key) ?? 0) >= this.maximum)
      await new Promise<void>((resolve) => {
        const queue = this.waiting.get(key) ?? [];
        queue.push(resolve);
        this.waiting.set(key, queue);
      });
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
    return () => this.release(key);
  }

  private release(key: string): void {
    this.active.set(key, Math.max(0, (this.active.get(key) ?? 1) - 1));
    const next = this.waiting.get(key)?.shift();
    if (next !== undefined) next();
  }
}

function toSourceWrite(source: CollectableSource): JobSourceWrite {
  const settings: JsonValue = sourceSettings(source);
  return {
    configSourceId: source.id,
    type: source.type,
    displayName: source.displayName,
    enabled: source.enabled,
    settings,
  };
}

function sourceSettings(source: CollectableSource): JsonValue {
  switch (source.type) {
    case 'greenhouse':
      return { boardToken: source.boardToken };
    case 'lever':
      return { companySlug: source.companySlug };
    case 'generic-page':
    case 'generic-job-list':
      return {
        url: source.url,
        browserTimeoutMs: source.browserTimeoutMs,
        maxDiscoveredLinks: source.maxDiscoveredLinks,
        maxTraversalDepth: source.maxTraversalDepth,
        allowBrowserFallback: source.allowBrowserFallback,
      };
    case 'ashby':
    case 'smartrecruiters':
    case 'workable':
    case 'bamboohr':
    case 'recruitee':
    case 'teamtailor':
    case 'personio':
    case 'jobvite':
      return {
        identifier: source.identifier,
        ...(source.url === undefined ? {} : { url: source.url }),
      };
  }
}

function mapSourceStatus(
  status: SourceCollectionStatus,
): CollectionSourceResultWrite['status'] {
  switch (status) {
    case 'SUCCEEDED':
      return 'COMPLETED';
    case 'PARTIALLY_FAILED':
      return 'PARTIALLY_FAILED';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'SKIPPED';
  }
}

function finalStatus(
  summaries: readonly SourceCollectionSummary[],
  aborted: boolean,
): CollectionFinalStatus {
  if (aborted) return 'CANCELLED';
  if (
    summaries.length === 0 ||
    summaries.every((summary) => summary.status === 'FAILED')
  ) {
    return 'FAILED';
  }
  if (
    summaries.some((summary) =>
      ['FAILED', 'PARTIALLY_FAILED'].includes(summary.status),
    )
  ) {
    return 'PARTIALLY_FAILED';
  }
  return 'COMPLETED';
}

function aggregate(summaries: readonly SourceCollectionSummary[]) {
  return summaries.reduce(
    (totals, summary) => ({
      rawJobsFound: totals.rawJobsFound + summary.rawJobsFound,
      createdJobs: totals.createdJobs + summary.createdJobs,
      updatedJobs: totals.updatedJobs + summary.updatedJobs,
      unchangedJobs: totals.unchangedJobs + summary.unchangedJobs,
      linkedJobs: totals.linkedJobs + summary.linkedJobs,
      invalidJobs: totals.invalidJobs + summary.invalidJobs,
      persistenceFailures:
        totals.persistenceFailures + summary.persistenceFailures,
    }),
    {
      rawJobsFound: 0,
      createdJobs: 0,
      updatedJobs: 0,
      unchangedJobs: 0,
      linkedJobs: 0,
      invalidJobs: 0,
      persistenceFailures: 0,
    },
  );
}

function buildErrorSummary(
  summaries: readonly SourceCollectionSummary[],
): JsonValue {
  return summaries
    .filter((summary) => summary.failureCode !== undefined)
    .map((summary) => ({
      sourceId: summary.sourceId,
      code: summary.failureCode ?? 'UNKNOWN',
      message: summary.failureMessage ?? 'Source collection failed.',
    }));
}
