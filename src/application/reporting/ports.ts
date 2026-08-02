import type {
  LatestPipelineState,
  RecommendationBatchView,
  RecommendationDetails,
  UpdateApplicationStatusInput,
  UpdateApplicationStatusResult,
} from './models.js';

export interface RecommendationReportRepository {
  getRecommendationBatch(
    batchId?: string,
  ): Promise<RecommendationBatchView | undefined>;
  getRecommendationDetails(
    recommendationId: string,
  ): Promise<RecommendationDetails | undefined>;
  updateApplicationStatus(
    input: UpdateApplicationStatusInput,
  ): Promise<UpdateApplicationStatusResult | undefined>;
  getLatestPipelineState(): Promise<LatestPipelineState>;
}
