import type { JobStatus, ScoreReason } from '../../domain/index.js';

export const REPORT_SORTS = [
  'rank',
  'score-desc',
  'opportunity-desc',
  'freshness-desc',
  'company',
  'title',
  'status-updated-desc',
] as const;
export type ReportSort = (typeof REPORT_SORTS)[number];

export const REPORT_STATUSES = [
  'NEW',
  'RECOMMENDED',
  'VIEWED',
  'APPLIED',
  'SKIPPED',
  'REJECTED',
  'ARCHIVED',
  'EXPIRED',
] as const satisfies readonly JobStatus[];

export const USER_APPLICATION_STATUSES = [
  'VIEWED',
  'APPLIED',
  'SKIPPED',
] as const;
export type UserApplicationStatus = (typeof USER_APPLICATION_STATUSES)[number];

export interface RecommendationReportQuery {
  readonly trackId?: string;
  readonly status?: JobStatus;
  readonly company?: string;
  readonly minimumScore?: number;
  readonly batchId?: string;
  readonly sort: ReportSort;
}

export interface ScoreComponentView {
  readonly key: string;
  readonly score: number;
  readonly weight: number;
  readonly contribution: number;
  readonly confidence: number;
  readonly reasons: readonly ScoreReason[];
}

export interface RecommendationListItem {
  readonly recommendationId: string;
  readonly jobId: string;
  readonly rank: number;
  readonly title: string;
  readonly company: string;
  readonly selectedTrackId: string;
  readonly finalScore: number;
  readonly opportunityScore: number;
  readonly location?: string;
  readonly remotePolicy?: string;
  readonly salarySummary?: string;
  readonly publishedAt?: string;
  readonly applicationUrl?: string;
  readonly currentStatus: JobStatus;
  readonly statusUpdatedAt: string;
  readonly positives: readonly ScoreReason[];
  readonly concerns: readonly ScoreReason[];
  readonly missingDataCount: number;
  readonly generatedAt: string;
}

export interface RecommendationBatchView {
  readonly id: string;
  readonly evaluationTime: string;
  readonly requestedLimit: number;
  readonly selectedCount: number;
  readonly createdAt: string;
  readonly reused?: boolean;
  readonly items: readonly RecommendationListItem[];
}

export interface RecommendationReport {
  readonly batch?: RecommendationBatchView;
  readonly query: RecommendationReportQuery;
  readonly items: readonly RecommendationListItem[];
  readonly availableTrackIds: readonly string[];
  readonly availableCompanies: readonly string[];
  readonly latestState?: LatestPipelineState;
}

export interface StatusHistoryView {
  readonly id: string;
  readonly fromStatus?: JobStatus;
  readonly toStatus: JobStatus;
  readonly changedAt: string;
  readonly reason?: string;
}

export interface RecommendationDetails {
  readonly recommendationId: string;
  readonly batchId: string;
  readonly jobId: string;
  readonly rank: number;
  readonly originalTitle: string;
  readonly normalizedTitle: string;
  readonly company: string;
  readonly location?: string;
  readonly remotePolicy?: string;
  readonly employmentType?: string;
  readonly salarySummary?: string;
  readonly experienceRequirements: readonly string[];
  readonly educationRequirements: readonly string[];
  readonly languages: readonly string[];
  readonly skills: readonly string[];
  readonly applicationUrl?: string;
  readonly sourceUrl?: string;
  readonly description?: string;
  readonly selectedTrackId: string;
  readonly finalScore: number;
  readonly candidateFitScore?: number;
  readonly opportunityScore: number;
  readonly threshold?: number;
  readonly evaluationOutcome?: string;
  readonly alternativeTrackEvaluations?: readonly string[];
  readonly completeness: number;
  readonly components: readonly ScoreComponentView[];
  readonly positives: readonly ScoreReason[];
  readonly concerns: readonly ScoreReason[];
  readonly missingData: readonly string[];
  readonly currentStatus: JobStatus;
  readonly statusHistory: readonly StatusHistoryView[];
  readonly processedAt?: string;
  readonly generatedAt: string;
  readonly normalizedAt?: string;
}

export interface LatestCollectionState {
  readonly runId: string;
  readonly status: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly sourcesAttempted: number;
  readonly sourcesSucceeded: number;
  readonly sourcesFailed: number;
  readonly jobsCollected: number;
  readonly jobsCreated: number;
  readonly jobsUpdated: number;
}

export interface LatestProcessingState {
  readonly runId: string;
  readonly status: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly considered: number;
  readonly normalized: number;
  readonly duplicates: number;
  readonly possibleDuplicates: number;
  readonly rejected: number;
  readonly eligible: number;
  readonly errors: number;
}

export interface LatestRecommendationState {
  readonly batchId: string;
  readonly evaluationTime: string;
  readonly selected: number;
  readonly requested: number;
  readonly evaluated?: number;
  readonly outcomeCounts?: Readonly<Record<string, number>>;
  readonly diagnostics?: readonly RecommendationDiagnosticView[];
}

export interface RecommendationDiagnosticView {
  readonly jobId: string;
  readonly title: string;
  readonly company: string;
  readonly outcome: string;
  readonly exclusionReason?: string;
  readonly threshold: number;
  readonly selectedTrackId?: string;
  readonly finalScore?: number;
  readonly candidateFitScore?: number;
  readonly opportunityScore?: number;
}

export interface LatestPipelineState {
  readonly collection?: LatestCollectionState;
  readonly processing?: LatestProcessingState;
  readonly recommendations?: LatestRecommendationState;
}

export interface UpdateApplicationStatusInput {
  readonly recommendationId: string;
  readonly targetStatus: UserApplicationStatus;
  readonly changedAt: string;
  readonly reason: string;
}

export interface UpdateApplicationStatusResult {
  readonly changed: boolean;
  readonly jobId: string;
  readonly currentStatus: JobStatus;
}
