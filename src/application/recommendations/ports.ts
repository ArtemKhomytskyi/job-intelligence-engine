import type {
  PersistedRecommendationBatch,
  RecommendationBatchWrite,
  RecommendationCandidateRecord,
} from './models.js';

export interface RecommendationBatchRepository {
  listEligibleCandidates(
    limit: number,
  ): Promise<readonly RecommendationCandidateRecord[]>;
  saveBatch(
    input: RecommendationBatchWrite,
  ): Promise<PersistedRecommendationBatch>;
}
