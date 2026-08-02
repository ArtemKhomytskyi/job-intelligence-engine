import type {
  EnrichedNormalizedJob,
  JobStatus,
  ScoreResult,
  ScoringSourceContext,
} from '../../domain/index.js';

export const MAX_SCORING_CANDIDATES = 5_000;

export interface RecommendationCandidateRecord {
  readonly jobId: string;
  readonly processingDecisionId: string;
  readonly inputRevisionNumber: number;
  readonly currentStatus: JobStatus;
  readonly normalizedJob: EnrichedNormalizedJob;
  readonly sourceIds: readonly string[];
  readonly source: ScoringSourceContext & {
    readonly trackIds: readonly string[];
  };
}

export interface RecommendationBatchItemWrite {
  readonly jobId: string;
  readonly processingDecisionId: string;
  readonly inputRevisionNumber: number;
  readonly rank: number;
  readonly score: ScoreResult;
}

export interface RecommendationBatchWrite {
  readonly inputHash: string;
  readonly evaluationTime: string;
  readonly requestedLimit: number;
  readonly configurationFingerprint: string;
  readonly scoringVersion: string;
  readonly selectorVersion: string;
  readonly items: readonly RecommendationBatchItemWrite[];
}

export interface PersistedRecommendationItem extends RecommendationBatchItemWrite {
  readonly scoreId: string;
  readonly title: string;
  readonly company: string;
}

export interface PersistedRecommendationBatch {
  readonly id: string;
  readonly inputHash: string;
  readonly evaluationTime: string;
  readonly requestedLimit: number;
  readonly selectedCount: number;
  readonly configurationFingerprint: string;
  readonly scoringVersion: string;
  readonly selectorVersion: string;
  readonly createdAt: string;
  readonly items: readonly PersistedRecommendationItem[];
  readonly reused: boolean;
}

export interface CreateRecommendationsInput {
  readonly limit: number;
  readonly candidate: import('../../domain/index.js').CandidateProfile;
  readonly search: import('../../domain/index.js').SearchConfiguration;
  readonly scoring: import('../../domain/index.js').ScoringConfig;
  readonly sources: readonly import('../../domain/index.js').SourceConfig[];
  readonly signal: AbortSignal;
}
