import type { NormalizedJobPosting } from './normalized-job-posting.js';
import type { ScoreResult } from './score-result.js';

export interface Recommendation {
  readonly job: NormalizedJobPosting;
  readonly score: ScoreResult;
  readonly rank: number;
  readonly generatedAt: string;
  readonly explanationSummary: string;
}
