import type {
  CollectionRunCompletion,
  CollectionRunWrite,
  CollectionSourceResultWrite,
  JobSourceWrite,
  JobUpsertRequest,
  JobUpsertResult,
  PersistedCollectionRun,
  PersistedJob,
  PersistedJobSource,
  PersistedRecommendation,
  PersistedScore,
  PersistedStatusHistory,
  RecommendationWrite,
  ScoreWrite,
  StatusUpdate,
  StatusUpdateResult,
} from './models.js';
import type { ProcessingRepository } from '../processing/ports.js';
import type { RecommendationBatchRepository } from '../recommendations/ports.js';

export interface JobSourceRepository {
  upsert(input: JobSourceWrite): Promise<PersistedJobSource>;
  findByConfigSourceId(
    configSourceId: string,
  ): Promise<PersistedJobSource | undefined>;
}

export interface JobRepository {
  upsert(input: JobUpsertRequest): Promise<JobUpsertResult>;
  findById(id: string): Promise<PersistedJob | undefined>;
  updateStatus(input: StatusUpdate): Promise<StatusUpdateResult>;
  listStatusHistory(jobId: string): Promise<readonly PersistedStatusHistory[]>;
}

export interface ScoreRepository {
  save(input: ScoreWrite): Promise<PersistedScore>;
  findLatest(
    jobId: string,
    searchTrackId: string,
  ): Promise<PersistedScore | undefined>;
}

export interface RecommendationRepository {
  save(input: RecommendationWrite): Promise<PersistedRecommendation>;
  findBatch(
    recommendationBatch: string,
  ): Promise<readonly PersistedRecommendation[]>;
}

export interface CollectionRunRepository {
  create(input: CollectionRunWrite): Promise<PersistedCollectionRun>;
  recordSourceResult(input: CollectionSourceResultWrite): Promise<void>;
  complete(input: CollectionRunCompletion): Promise<PersistedCollectionRun>;
  findById(id: string): Promise<PersistedCollectionRun | undefined>;
}

export interface PersistenceRepositories {
  readonly jobs: JobRepository;
  readonly sources: JobSourceRepository;
  readonly scores: ScoreRepository;
  readonly recommendations: RecommendationRepository;
  readonly collectionRuns: CollectionRunRepository;
  readonly processing: ProcessingRepository;
  readonly recommendationBatches: RecommendationBatchRepository;
}

export interface PersistenceTransactionManager {
  execute<T>(
    operation: (repositories: PersistenceRepositories) => Promise<T>,
  ): Promise<T>;
}

export interface DatabaseHealthPort {
  check(): Promise<void>;
}

export interface DatabaseMigrationPort {
  deploy(): Promise<void>;
  status(): Promise<void>;
}
