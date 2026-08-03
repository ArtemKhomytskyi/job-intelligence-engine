import { describe, expect, it } from 'vitest';

import {
  ActivePipelineRunError,
  ConfigurationError,
  PipelineStageError,
  RunFullPipeline,
  SingleActivePipelineRunner,
  type CollectionRunSummary,
  type ConfigurationBundle,
  type FullPipelineDependencies,
  type PersistedRecommendationBatch,
  type ProcessingRunSummary,
} from '../../src/application/index.js';

const signal = new AbortController().signal;
const configuration = {
  search: { preferences: { dailyRecommendationLimit: 7 } },
} as ConfigurationBundle;

describe('full pipeline application service', () => {
  it('validates configuration first and runs every stage in deterministic order', async () => {
    const events: string[] = [];
    const service = new RunFullPipeline(dependencies(events));
    const result = await service.execute(input());

    expect(events).toEqual([
      'configuration',
      'collection',
      'processing',
      'recommendations:7',
    ]);
    expect(result).toMatchObject({
      collection: { runId: 'collection-run' },
      processing: { runId: 'processing-run' },
      recommendations: { id: 'batch-a', selectedCount: 1 },
    });
  });

  it('continues after partial collection and accepts an empty batch', async () => {
    const events: string[] = [];
    const ports = dependencies(events);
    ports.collection.execute = () =>
      Promise.resolve({ ...collectionSummary(), status: 'PARTIALLY_FAILED' });
    ports.recommendations.execute = () =>
      Promise.resolve({ ...batch(), selectedCount: 0, items: [] });
    await expect(
      new RunFullPipeline(ports).execute(input()),
    ).resolves.toMatchObject({
      recommendations: { selectedCount: 0 },
    });
    expect(events).toContain('processing');
  });

  it('stops before collection on configuration failure', async () => {
    const events: string[] = [];
    const ports = dependencies(events);
    ports.configuration.load = () =>
      Promise.reject(new Error('invalid configuration'));
    await expect(new RunFullPipeline(ports).execute(input())).rejects.toThrow(
      'invalid configuration',
    );
    expect(events).toEqual([]);
  });

  it('creates no collection run when placeholder configuration is rejected', async () => {
    const events: string[] = [];
    const ports = dependencies(events);
    ports.configuration.load = () =>
      Promise.reject(
        new ConfigurationError([
          {
            code: 'PLACEHOLDER_SOURCE_NOT_ALLOWED',
            section: 'sources',
            message: 'Configure a real source before collection.',
          },
        ]),
      );
    await expect(new RunFullPipeline(ports).execute(input())).rejects.toThrow(
      'Configure a real source before collection.',
    );
    expect(events).toEqual([]);
  });

  it.each(['FAILED', 'CANCELLED'] as const)(
    'does not process when collection is %s',
    async (status) => {
      const events: string[] = [];
      const ports = dependencies(events);
      ports.collection.execute = () =>
        Promise.resolve({ ...collectionSummary(), status });
      await expect(
        new RunFullPipeline(ports).execute(input()),
      ).rejects.toBeInstanceOf(PipelineStageError);
      expect(events).not.toContain('processing');
    },
  );

  it('rejects invalid bounds before configuration access', async () => {
    const events: string[] = [];
    await expect(
      new RunFullPipeline(dependencies(events)).execute({
        ...input(),
        collectionConcurrency: 0,
      }),
    ).rejects.toThrow('integer from 1 through 8');
    expect(events).toEqual([]);
  });

  it.each([
    [{ evaluationTime: new Date('invalid') }, 'evaluation time'],
    [{ processingLimit: 0 }, 'integer from 1 through 10000'],
    [{ recommendationLimit: 0 }, 'integer from 1 through 1000'],
  ] as const)(
    'rejects invalid pipeline input %o',
    async (override, message) => {
      await expect(
        new RunFullPipeline(dependencies([])).execute({
          ...input(),
          ...override,
        }),
      ).rejects.toThrow(message);
    },
  );

  it('uses an explicit recommendation limit and stops on failed processing', async () => {
    const events: string[] = [];
    const ports = dependencies(events);
    await new RunFullPipeline(ports).execute({
      ...input(),
      recommendationLimit: 3,
    });
    expect(events).toContain('recommendations:3');

    ports.processing.execute = () =>
      Promise.resolve({ ...processingSummary(), status: 'FAILED' });
    await expect(
      new RunFullPipeline(ports).execute(input()),
    ).rejects.toMatchObject({ stage: 'processing' });
  });

  it('rejects a concurrent run and releases the lock after completion and failure', async () => {
    let resolveFirst:
      ((result: ReturnType<typeof pipelineResult>) => void) | undefined;
    const first = new Promise<ReturnType<typeof pipelineResult>>((resolve) => {
      resolveFirst = resolve;
    });
    let call = 0;
    const runner = new SingleActivePipelineRunner({
      execute: () => {
        call += 1;
        return call === 1
          ? first
          : Promise.reject(new Error('synthetic failure'));
      },
    });
    const active = runner.execute(input());
    expect(runner.isActive()).toBe(true);
    await expect(runner.execute(input())).rejects.toBeInstanceOf(
      ActivePipelineRunError,
    );
    resolveFirst?.(pipelineResult());
    await active;
    expect(runner.isActive()).toBe(false);
    await expect(runner.execute(input())).rejects.toThrow('synthetic failure');
    expect(runner.isActive()).toBe(false);
  });
});

function dependencies(events: string[]): FullPipelineDependencies {
  return {
    configuration: {
      load: () => {
        events.push('configuration');
        return Promise.resolve(configuration);
      },
    },
    collection: {
      execute: () => {
        events.push('collection');
        return Promise.resolve(collectionSummary());
      },
    },
    processing: {
      execute: () => {
        events.push('processing');
        return Promise.resolve(processingSummary());
      },
    },
    recommendations: {
      execute: (stageInput) => {
        events.push(`recommendations:${stageInput.limit}`);
        return Promise.resolve(batch());
      },
    },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    clock: { now: () => new Date('2026-08-02T10:02:00.000Z') },
  };
}

function input() {
  return {
    initiatedBy: 'cli' as const,
    collectionConcurrency: 2,
    processingLimit: 100,
    evaluationTime: new Date('2026-08-02T10:00:00.000Z'),
    signal,
  };
}

function collectionSummary(): CollectionRunSummary {
  return {
    runId: 'collection-run',
    startedAt: '2026-08-02T10:00:00.000Z',
    completedAt: '2026-08-02T10:01:00.000Z',
    status: 'COMPLETED',
    attemptedSourceCount: 2,
    succeededSourceCount: 2,
    failedSourceCount: 0,
    rawJobsFound: 3,
    createdJobs: 2,
    updatedJobs: 1,
    unchangedJobs: 0,
    linkedJobs: 0,
    invalidJobs: 0,
    persistenceFailures: 0,
    durationMs: 60_000,
    sourceSummaries: [],
  };
}

function processingSummary(): ProcessingRunSummary {
  return {
    runId: 'processing-run',
    startedAt: '2026-08-02T10:01:00.000Z',
    completedAt: '2026-08-02T10:02:00.000Z',
    status: 'COMPLETED',
    consideredCount: 3,
    normalizedCount: 3,
    normalizationFailedCount: 0,
    duplicateCount: 0,
    possibleDuplicateCount: 0,
    rejectedCount: 1,
    eligibleCount: 2,
    errorCount: 0,
    skippedCount: 0,
  };
}

function batch(): PersistedRecommendationBatch {
  return {
    id: 'batch-a',
    inputHash: 'hash',
    evaluationTime: '2026-08-02T10:00:00.000Z',
    requestedLimit: 7,
    selectedCount: 1,
    configurationFingerprint: 'config',
    scoringVersion: 'score-v1',
    selectorVersion: 'selector-v1',
    createdAt: '2026-08-02T10:02:00.000Z',
    reused: false,
    items: [],
  };
}

function pipelineResult() {
  return {
    startedAt: '2026-08-02T10:00:00.000Z',
    completedAt: '2026-08-02T10:02:00.000Z',
    collection: collectionSummary(),
    processing: processingSummary(),
    recommendations: batch(),
  };
}
