import type {
  AtsProvider,
  JsonValue,
  NormalizedJobPosting,
} from '../../domain/index.js';

export type CollectorSourceType =
  AtsProvider | 'generic-page' | 'generic-job-list';

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

export interface AdditionalAtsCollectableSource extends CollectableSourceBase {
  readonly type: Exclude<AtsProvider, 'greenhouse' | 'lever'>;
  readonly identifier: string;
  readonly url?: string;
}

export interface GenericWebCollectableSource extends CollectableSourceBase {
  readonly type: 'generic-page' | 'generic-job-list';
  readonly url: string;
  readonly browserTimeoutMs: number;
  readonly maxDiscoveredLinks: number;
  readonly maxTraversalDepth: number;
  readonly allowBrowserFallback: boolean;
  readonly allowTestLoopback?: boolean;
}

export type CollectableSource =
  | GreenhouseCollectableSource
  | LeverCollectableSource
  | AdditionalAtsCollectableSource
  | GenericWebCollectableSource;

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
  readonly expiresAt?: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface CollectionContext {
  readonly collectedAt: string;
  readonly signal: AbortSignal;
}

export interface CollectorWarning {
  readonly code:
    | 'JOB_NORMALIZATION_FAILED'
    | 'DUPLICATE_SOURCE_JOB'
    | 'PAGE_EXTRACTION_FAILED'
    | 'MALFORMED_JSON_LD'
    | 'TRAVERSAL_LIMIT_REACHED'
    | 'BROWSER_FALLBACK_FAILED'
    | 'KNOWN_ATS_DETECTED';
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
  readonly diagnostics?: Readonly<Record<string, JsonValue>>;
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
  readonly perProviderConcurrency?: number;
  readonly signal: AbortSignal;
  readonly initiatedBy: string;
}
