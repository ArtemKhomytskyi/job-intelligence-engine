import type { PrismaClient } from '@prisma/client';

import type {
  PersistenceRepositories,
  PersistenceTransactionManager,
} from '../../application/index.js';
import { mapPrismaError } from './prisma-errors.js';
import {
  PrismaCollectionRunRepository,
  PrismaJobRepository,
  PrismaJobSourceRepository,
  PrismaRecommendationRepository,
  PrismaProcessingRepository,
  PrismaScoreRepository,
  type PrismaRepositoryClient,
} from './repositories.js';

export function createPrismaRepositories(
  client: PrismaRepositoryClient,
): PersistenceRepositories {
  return {
    jobs: new PrismaJobRepository(client),
    sources: new PrismaJobSourceRepository(client),
    scores: new PrismaScoreRepository(client),
    recommendations: new PrismaRecommendationRepository(client),
    collectionRuns: new PrismaCollectionRunRepository(client),
    processing: new PrismaProcessingRepository(client),
  };
}

export class PrismaTransactionManager implements PersistenceTransactionManager {
  public constructor(private readonly client: PrismaClient) {}

  public async execute<T>(
    operation: (repositories: PersistenceRepositories) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.client.$transaction(
        (transaction) => operation(createPrismaRepositories(transaction)),
        { maxWait: 5_000, timeout: 10_000 },
      );
    } catch (cause: unknown) {
      throw mapPrismaError(cause);
    }
  }
}
