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

export interface ProcessingRepository {
  listProcessableJobs(limit: number): Promise<readonly ProcessableJob[]>;
  createRun(input: ProcessingRunWrite): Promise<PersistedProcessingRun>;
  listExistingDecisionKeys(
    input: ProcessingDecisionLookup,
  ): Promise<readonly ProcessingDecisionKey[]>;
  saveDecision(input: ProcessingDecisionWrite): Promise<ProcessingSaveOutcome>;
  completeRun(input: ProcessingRunCompletion): Promise<void>;
}

export interface ProcessingHasher {
  sha256(value: string): string;
}
