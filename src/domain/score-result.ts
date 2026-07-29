import type { ScoringComponentKey, ScoringWeights } from './scoring-config.js';
import type { Percentage } from './value-objects.js';

export interface ScoreComponentResult {
  readonly key: ScoringComponentKey;
  readonly rawScore: Percentage;
  readonly weight: ScoringWeights[ScoringComponentKey];
  readonly contribution: Percentage;
  readonly reasons: readonly string[];
}

export interface ScoreResult {
  readonly totalScore: Percentage;
  readonly selectedTrackId: string;
  readonly components: readonly ScoreComponentResult[];
  readonly positiveReasons: readonly string[];
  readonly concerns: readonly string[];
  readonly missingData: readonly string[];
  readonly completeness: Percentage;
}
