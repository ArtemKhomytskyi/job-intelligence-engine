import type { PersistenceTransactionManager } from '../persistence/ports.js';
import type {
  PersistedProcessingRun,
  ProcessingDecisionLookup,
  ProcessingDecisionKey,
  ProcessingDecisionWrite,
  ProcessingRunCompletion,
  ProcessingRunWrite,
  ProcessingSaveOutcome,
  ProcessableJob,
} from './models.js';
import type { ProcessingRepository } from './ports.js';

export class TransactionalProcessingRepository implements ProcessingRepository {
  public constructor(
    private readonly transactions: PersistenceTransactionManager,
  ) {}

  public listProcessableJobs(
    limit: number,
  ): Promise<readonly ProcessableJob[]> {
    return this.transactions.execute((repositories) =>
      repositories.processing.listProcessableJobs(limit),
    );
  }

  public createRun(input: ProcessingRunWrite): Promise<PersistedProcessingRun> {
    return this.transactions.execute((repositories) =>
      repositories.processing.createRun(input),
    );
  }

  public listExistingDecisionKeys(
    input: ProcessingDecisionLookup,
  ): Promise<readonly ProcessingDecisionKey[]> {
    return this.transactions.execute((repositories) =>
      repositories.processing.listExistingDecisionKeys(input),
    );
  }

  public saveDecision(
    input: ProcessingDecisionWrite,
  ): Promise<ProcessingSaveOutcome> {
    return this.transactions.execute((repositories) =>
      repositories.processing.saveDecision(input),
    );
  }

  public completeRun(input: ProcessingRunCompletion): Promise<void> {
    return this.transactions.execute((repositories) =>
      repositories.processing.completeRun(input),
    );
  }
}
