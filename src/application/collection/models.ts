import type { JsonValue, NormalizedJobPosting } from '../../domain/index.js';

export type CollectorSourceType = 'greenhouse' | 'lever';

export interface CollectableSourceBase {
  readonly id: string;
  readonly type: CollectorSourceType;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly company: string;
  readonly requestTimeoutMs: number;
  readonly requestsPerSecond: number;
}

export interface GreenhouseCollectableSource extends CollectableSourceBase {
  readonly type: 'greenhouse';
  readonly boardToken: string;
}

export interface LeverCollectableSource extends CollectableSourceBase {
  readonly type: 'lever';
  readonly companySlug: string;
}

export type CollectableSource =
  GreenhouseCollectableSource | LeverCollectableSource;

export interface CollectedJobCandidate {
  readonly externalId: string;
  readonly title: string;
  readonly company: string;
  readonly sourceUrl: string;
  readonly applicationUrl?: string;
  readonly description?: string;
  readonly locationText?: string;
  readonly department?: string;
  readonly rawEmploymentType?: string;
  readonly rawWorkplaceType?: string;
  readonly publishedAt?: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface CollectionContext {
  readonly collectedAt: string;
  readonly signal: AbortSignal;
}

export interface CollectorWarning {
  readonly code: 'JOB_NORMALIZATION_FAILED' | 'DUPLICATE_SOURCE_JOB';
  readonly message: string;
  readonly externalId?: string;
}

export interface CollectorResult {
  readonly sourceId: string;
  readonly sourceType: CollectorSourceType;
  readonly requestCount: number;
  readonly rawJobCount: number;
  readonly invalidJobCount: number;
  readonly warnings: readonly CollectorWarning[];
  readonly candidates: readonly NormalizedJobPosting[];
  readonly durationMs: number;
}

export type SourceCollectionStatus =
  'SUCCEEDED' | 'PARTIALLY_FAILED' | 'FAILED' | 'CANCELLED';

export interface SourceCollectionSummary {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceType: string;
  readonly status: SourceCollectionStatus;
  readonly rawJobsFound: number;
  readonly createdJobs: number;
  readonly updatedJobs: number;
  readonly unchangedJobs: number;
  readonly linkedJobs: number;
  readonly invalidJobs: number;
  readonly persistenceFailures: number;
  readonly requestCount: number;
  readonly durationMs: number;
  readonly failureCode?: string;
  readonly failureMessage?: string;
}

export type CollectionFinalStatus =
  'COMPLETED' | 'PARTIALLY_FAILED' | 'FAILED' | 'CANCELLED';

export interface CollectionRunSummary {
  readonly runId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: CollectionFinalStatus;
  readonly attemptedSourceCount: number;
  readonly succeededSourceCount: number;
  readonly failedSourceCount: number;
  readonly rawJobsFound: number;
  readonly createdJobs: number;
  readonly updatedJobs: number;
  readonly unchangedJobs: number;
  readonly linkedJobs: number;
  readonly invalidJobs: number;
  readonly persistenceFailures: number;
  readonly durationMs: number;
  readonly sourceSummaries: readonly SourceCollectionSummary[];
}

export interface CollectionRequest {
  readonly sources: readonly CollectableSource[];
  readonly concurrency: number;
  readonly signal: AbortSignal;
  readonly initiatedBy: string;
}
