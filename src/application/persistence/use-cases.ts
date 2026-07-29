import type { NormalizedJobPosting } from '../../domain/index.js';
import { createExactJobFingerprint } from './fingerprint.js';
import type {
  CollectionRunCompletion,
  CollectionRunWrite,
  CollectionSourceResultWrite,
  JobSourceWrite,
  JobUpsertResult,
  PersistedCollectionRun,
  PersistedJobSource,
  PersistedRecommendation,
  PersistedScore,
  RecommendationWrite,
  ScoreWrite,
  StatusUpdate,
  StatusUpdateResult,
} from './models.js';
import type { PersistenceTransactionManager } from './ports.js';

export function upsertJob(
  transactions: PersistenceTransactionManager,
  posting: NormalizedJobPosting,
): Promise<JobUpsertResult> {
  const fingerprint = createExactJobFingerprint(posting);
  return transactions.execute((repositories) =>
    repositories.jobs.upsert({ posting, fingerprint }),
  );
}

export function upsertJobSource(
  transactions: PersistenceTransactionManager,
  input: JobSourceWrite,
): Promise<PersistedJobSource> {
  return transactions.execute((repositories) =>
    repositories.sources.upsert(input),
  );
}

export function updateJobStatus(
  transactions: PersistenceTransactionManager,
  input: StatusUpdate,
): Promise<StatusUpdateResult> {
  return transactions.execute((repositories) =>
    repositories.jobs.updateStatus(input),
  );
}

export function saveScore(
  transactions: PersistenceTransactionManager,
  input: ScoreWrite,
): Promise<PersistedScore> {
  return transactions.execute((repositories) =>
    repositories.scores.save(input),
  );
}

export function saveRecommendation(
  transactions: PersistenceTransactionManager,
  input: RecommendationWrite,
): Promise<PersistedRecommendation> {
  return transactions.execute((repositories) =>
    repositories.recommendations.save(input),
  );
}

export function createCollectionRun(
  transactions: PersistenceTransactionManager,
  input: CollectionRunWrite,
): Promise<PersistedCollectionRun> {
  return transactions.execute((repositories) =>
    repositories.collectionRuns.create(input),
  );
}

export function recordCollectionSourceResult(
  transactions: PersistenceTransactionManager,
  input: CollectionSourceResultWrite,
): Promise<void> {
  return transactions.execute((repositories) =>
    repositories.collectionRuns.recordSourceResult(input),
  );
}

export function completeCollectionRun(
  transactions: PersistenceTransactionManager,
  input: CollectionRunCompletion,
): Promise<PersistedCollectionRun> {
  return transactions.execute((repositories) =>
    repositories.collectionRuns.complete(input),
  );
}
