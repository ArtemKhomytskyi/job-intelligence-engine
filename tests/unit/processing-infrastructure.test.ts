import { describe, expect, it } from 'vitest';

import {
  TransactionalProcessingRepository,
  type PersistenceRepositories,
  type ProcessingDecisionKey,
  type ProcessingRepository,
} from '../../src/application/index.js';
import { Sha256ProcessingHasher } from '../../src/infrastructure/index.js';

describe('processing infrastructure', () => {
  it('provides deterministic SHA-256 without leaking hashing into application code', () => {
    const hasher = new Sha256ProcessingHasher();
    expect(hasher.sha256('synthetic input')).toBe(
      '3f48d11458e37cd22c904295e44cb2e10fec3d19095046a0c9197efb3c5286c7',
    );
    expect(hasher.sha256('synthetic input')).toBe(
      hasher.sha256('synthetic input'),
    );
  });

  it('delegates every processing operation through the transaction boundary', async () => {
    const calls: string[] = [];
    const key: ProcessingDecisionKey = {
      jobId: 'job-a',
      inputRevisionNumber: 0,
      normalizationVersion: 'normalization-v1',
      fingerprintVersion: 1,
      filterRulesVersion: 'hard-filters-v1',
      configFingerprint: 'config-a',
    };
    const processing: ProcessingRepository = {
      listProcessableJobs: () => {
        calls.push('list');
        return Promise.resolve([]);
      },
      createRun: (input) => {
        calls.push('create-run');
        return Promise.resolve({ ...input, id: 'run-a' });
      },
      listExistingDecisionKeys: () => {
        calls.push('lookup');
        return Promise.resolve([key]);
      },
      saveDecision: () => {
        calls.push('save');
        return Promise.resolve('CREATED');
      },
      completeRun: () => {
        calls.push('complete');
        return Promise.resolve();
      },
    };
    const transactions = {
      execute: <T>(
        operation: (repositories: PersistenceRepositories) => Promise<T>,
      ) => operation({ processing } as unknown as PersistenceRepositories),
    };
    const repository = new TransactionalProcessingRepository(transactions);
    await repository.listProcessableJobs(1);
    await repository.createRun({
      startedAt: '2026-07-30T00:00:00.000Z',
      initiatedBy: 'unit-test',
      normalizationVersion: 'normalization-v1',
      fingerprintVersion: 1,
      filterRulesVersion: 'hard-filters-v1',
      configFingerprint: 'config-a',
    });
    await repository.listExistingDecisionKeys({
      jobIds: ['job-a'],
      normalizationVersion: 'normalization-v1',
      fingerprintVersion: 1,
      filterRulesVersion: 'hard-filters-v1',
      configFingerprint: 'config-a',
    });
    await repository.saveDecision({
      ...key,
      runId: 'run-a',
      processingStatus: 'ELIGIBLE',
      processedAt: '2026-07-30T00:00:00.000Z',
      normalizationIssues: [],
    });
    await repository.completeRun({
      runId: 'run-a',
      completedAt: '2026-07-30T00:00:00.000Z',
      status: 'COMPLETED',
      consideredCount: 1,
      normalizedCount: 1,
      normalizationFailedCount: 0,
      duplicateCount: 0,
      possibleDuplicateCount: 0,
      rejectedCount: 0,
      eligibleCount: 1,
      errorCount: 0,
      skippedCount: 0,
    });
    expect(calls).toEqual(['list', 'create-run', 'lookup', 'save', 'complete']);
  });
});
