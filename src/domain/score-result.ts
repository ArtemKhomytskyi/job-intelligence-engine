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
  readonly opportunityScore: number;
  readonly selectedTrackId: string;
  readonly components: readonly ScoreComponentResult[];
  readonly positiveReasons: readonly ScoreReason[];
  readonly concerns: readonly ScoreReason[];
  readonly missingData: readonly string[];
  readonly completeness: number;
}
