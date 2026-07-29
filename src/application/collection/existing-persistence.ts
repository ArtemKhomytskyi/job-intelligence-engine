import type { NormalizedJobPosting } from '../../domain/index.js';
import {
  completeCollectionRun,
  createCollectionRun,
  recordCollectionSourceResult,
  upsertJob,
  upsertJobSource,
} from '../persistence/use-cases.js';
import type {
  CollectionRunCompletion,
  CollectionSourceResultWrite,
  JobSourceWrite,
  JobUpsertResult,
  PersistedCollectionRun,
} from '../persistence/models.js';
import type { PersistenceTransactionManager } from '../persistence/ports.js';
import type { CollectionPersistence } from './ports.js';

export class ExistingCollectionPersistence implements CollectionPersistence {
  public constructor(
    private readonly transactions: PersistenceTransactionManager,
  ) {}

  public async upsertSource(input: JobSourceWrite): Promise<void> {
    await upsertJobSource(this.transactions, input);
  }

  public createRun(
    startedAt: string,
    initiatedBy: string,
  ): Promise<PersistedCollectionRun> {
    return createCollectionRun(this.transactions, { startedAt, initiatedBy });
  }

  public upsertJob(posting: NormalizedJobPosting): Promise<JobUpsertResult> {
    return upsertJob(this.transactions, posting);
  }

  public recordSourceResult(input: CollectionSourceResultWrite): Promise<void> {
    return recordCollectionSourceResult(this.transactions, input);
  }

  public completeRun(
    input: CollectionRunCompletion,
  ): Promise<PersistedCollectionRun> {
    return completeCollectionRun(this.transactions, input);
  }
}
