import type {
  DuplicateDecision,
  EnrichedNormalizedJob,
  HardFilterResult,
  NormalizationIssue,
  ProcessableJob,
} from '../../domain/index.js';

export type ProcessingStatus =
  | 'ELIGIBLE'
  | 'REJECTED'
  | 'DUPLICATE'
  | 'POSSIBLE_DUPLICATE'
  | 'NORMALIZATION_FAILED'
  | 'ERROR';

export interface ProcessingRunWrite {
  readonly startedAt: string;
  readonly initiatedBy: string;
  readonly normalizationVersion: string;
  readonly fingerprintVersion: number;
  readonly filterRulesVersion: string;
  readonly configFingerprint: string;
}

export interface PersistedProcessingRun extends ProcessingRunWrite {
  readonly id: string;
}

export interface ProcessingDecisionKey {
  readonly jobId: string;
  readonly inputRevisionNumber: number;
  readonly normalizationVersion: string;
  readonly fingerprintVersion: number;
  readonly filterRulesVersion: string;
  readonly configFingerprint: string;
}

export interface ProcessingDecisionWrite extends ProcessingDecisionKey {
  readonly runId: string;
  readonly processingStatus: ProcessingStatus;
  readonly processedAt: string;
  readonly normalizedJob?: EnrichedNormalizedJob;
  readonly normalizationIssues: readonly NormalizationIssue[];
  readonly processingFingerprint?: string;
  readonly duplicateDecision?: DuplicateDecision;
  readonly hardFilterResult?: HardFilterResult;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface ProcessingRunSummary {
  readonly runId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: 'COMPLETED' | 'PARTIALLY_FAILED' | 'FAILED' | 'CANCELLED';
  readonly consideredCount: number;
  readonly normalizedCount: number;
  readonly normalizationFailedCount: number;
  readonly duplicateCount: number;
  readonly possibleDuplicateCount: number;
  readonly rejectedCount: number;
  readonly eligibleCount: number;
  readonly errorCount: number;
  readonly skippedCount: number;
}

export interface ProcessingRunCompletion extends Omit<
  ProcessingRunSummary,
  'runId' | 'startedAt'
> {
  readonly runId: string;
}

export interface ProcessCollectedJobsInput {
  readonly limit: number;
  readonly initiatedBy: string;
  readonly candidate: import('../../domain/index.js').CandidateProfile;
  readonly hardFilters: import('../../domain/index.js').HardFilterConfiguration;
  readonly signal: AbortSignal;
}

export type { ProcessableJob };

export interface ProcessingDecisionLookup {
  readonly jobIds: readonly string[];
  readonly normalizationVersion: string;
  readonly fingerprintVersion: number;
  readonly filterRulesVersion: string;
  readonly configFingerprint: string;
}

export type ProcessingSaveOutcome = 'CREATED' | 'ALREADY_EXISTS';
