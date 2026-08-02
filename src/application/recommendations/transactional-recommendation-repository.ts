import type { PersistenceTransactionManager } from '../persistence/ports.js';
import type {
  PersistedRecommendationBatch,
  RecommendationBatchWrite,
  RecommendationCandidateRecord,
} from './models.js';
import type { RecommendationBatchRepository } from './ports.js';

export class TransactionalRecommendationBatchRepository implements RecommendationBatchRepository {
  public constructor(
    private readonly transactions: PersistenceTransactionManager,
  ) {}

  public listEligibleCandidates(
    limit: number,
  ): Promise<readonly RecommendationCandidateRecord[]> {
    return this.transactions.execute((repositories) =>
      repositories.recommendationBatches.listEligibleCandidates(limit),
    );
  }

  public saveBatch(
    input: RecommendationBatchWrite,
  ): Promise<PersistedRecommendationBatch> {
    return this.transactions.execute((repositories) =>
      repositories.recommendationBatches.saveBatch(input),
    );
  }
}
