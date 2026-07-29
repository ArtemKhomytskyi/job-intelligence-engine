import type {
  JobStatus,
  JsonValue,
  NormalizedJobPosting,
} from '../../domain/index.js';

export type JobUpsertOutcome =
  'CREATED' | 'UPDATED' | 'UNCHANGED' | 'LINKED_TO_EXISTING';

export interface PersistedJobSource {
  readonly id: string;
  readonly configSourceId: string;
  readonly type: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly settings?: JsonValue;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JobSourceWrite {
  readonly configSourceId: string;
  readonly type: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly settings?: JsonValue;
}

export interface PersistedJob {
  readonly id: string;
  readonly title: string;
  readonly company: string;
  readonly canonicalUrl: string;
  readonly normalizedTitle: string;
  readonly normalizedCompany: string;
  readonly currentStatus: JobStatus;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly lastCollectedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JobUpsertRequest {
  readonly posting: NormalizedJobPosting;
  readonly fingerprint: JobFingerprintValue;
}

export interface JobFingerprintValue {
  readonly value: string;
  readonly algorithm: 'sha256';
  readonly version: 1;
  readonly kind: 'exact-identity';
}

export interface JobUpsertResult {
  readonly outcome: JobUpsertOutcome;
  readonly job: PersistedJob;
  readonly revisionNumber?: number;
}

export interface StatusUpdate {
  readonly jobId: string;
  readonly targetStatus: JobStatus;
  readonly changedAt: string;
  readonly reason?: string;
  readonly metadata?: JsonValue;
}

export interface StatusUpdateResult {
  readonly changed: boolean;
  readonly job: PersistedJob;
}

export interface PersistedStatusHistory {
  readonly id: string;
  readonly jobId: string;
  readonly fromStatus?: JobStatus;
  readonly toStatus: JobStatus;
  readonly changedAt: string;
  readonly reason?: string;
}

export interface ScoreComponentWrite {
  readonly key: string;
  readonly rawScore: number;
  readonly weight: number;
  readonly contribution: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export interface ScoreWrite {
  readonly jobId: string;
  readonly searchTrackId: string;
  readonly totalScore: number;
  readonly confidence: number;
  readonly positiveReasons: readonly string[];
  readonly concerns: readonly string[];
  readonly missingData: readonly string[];
  readonly scoringVersion: string;
  readonly calculatedAt: string;
  readonly components: readonly ScoreComponentWrite[];
}

export interface PersistedScore extends ScoreWrite {
  readonly id: string;
  readonly createdAt: string;
}

export interface RecommendationWrite {
  readonly jobId: string;
  readonly scoreId: string;
  readonly searchTrackId: string;
  readonly rank: number;
  readonly recommendationBatch: string;
  readonly explanation: string;
  readonly generatedAt: string;
  readonly active: boolean;
}

export interface PersistedRecommendation extends RecommendationWrite {
  readonly id: string;
  readonly createdAt: string;
}

export const COLLECTION_RUN_STATUSES = [
  'RUNNING',
  'COMPLETED',
  'PARTIALLY_FAILED',
  'FAILED',
  'CANCELLED',
] as const;
export type CollectionRunStatus = (typeof COLLECTION_RUN_STATUSES)[number];

export const COLLECTION_SOURCE_STATUSES = [
  'RUNNING',
  'COMPLETED',
  'PARTIALLY_FAILED',
  'FAILED',
  'SKIPPED',
] as const;
export type CollectionSourceStatus =
  (typeof COLLECTION_SOURCE_STATUSES)[number];

export interface CollectionCounts {
  readonly discoveredCount: number;
  readonly insertedCount: number;
  readonly updatedCount: number;
  readonly duplicateCount: number;
  readonly failedCount: number;
}

export interface CollectionRunWrite {
  readonly startedAt: string;
  readonly initiatedBy: string;
}

export interface CollectionRunCompletion extends CollectionCounts {
  readonly runId: string;
  readonly status: Exclude<CollectionRunStatus, 'RUNNING'>;
  readonly completedAt: string;
  readonly errorSummary?: JsonValue;
}

export interface PersistedCollectionRun extends CollectionCounts {
  readonly id: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: CollectionRunStatus;
  readonly initiatedBy: string;
  readonly errorSummary?: JsonValue;
}

export interface CollectionSourceResultWrite {
  readonly collectionRunId: string;
  readonly configSourceId: string;
  readonly status: CollectionSourceStatus;
  readonly discoveredCount: number;
  readonly insertedCount: number;
  readonly updatedCount: number;
  readonly duplicateCount: number;
  readonly invalidCount: number;
  readonly failedCount: number;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly metadata?: JsonValue;
}
