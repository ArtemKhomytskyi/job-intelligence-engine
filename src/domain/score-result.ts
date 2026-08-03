import type { ScoringComponentKey } from './scoring-config.js';

export type ScoreReasonImpact =
  'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MISSING_DATA';

export interface ScoreReason {
  readonly code: string;
  readonly message: string;
  readonly impact: ScoreReasonImpact;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ScoreComponentResult {
  readonly key: ScoringComponentKey;
  readonly rawScore: number;
  readonly weight: number;
  readonly contribution: number;
  readonly reasons: readonly ScoreReason[];
  readonly confidence: number;
}

export interface ScoreResult {
  readonly totalScore: number;
  readonly candidateFitScore?: number;
  readonly opportunityScore: number;
  readonly selectedTrackId: string;
  readonly validTrackMatch?: boolean;
  readonly exclusionReason?: string;
  readonly trackEvaluations?: readonly TrackEvaluationResult[];
  readonly components: readonly ScoreComponentResult[];
  readonly positiveReasons: readonly ScoreReason[];
  readonly concerns: readonly ScoreReason[];
  readonly missingData: readonly string[];
  readonly completeness: number;
}

export interface TrackEvaluationResult {
  readonly trackId: string;
  readonly validMatch: boolean;
  readonly candidateFitScore: number;
  readonly opportunityScore: number;
  readonly finalScore: number;
  readonly positiveEvidence: readonly ScoreReason[];
  readonly negativeEvidence: readonly ScoreReason[];
  readonly missingEvidence: readonly string[];
  readonly exclusionReason?: string;
}

export interface MultiTrackScoreResult {
  readonly score?: ScoreResult;
  readonly evaluations: readonly TrackEvaluationResult[];
  readonly exclusionReason?: 'NO_VALID_TRACK_MATCH';
}
