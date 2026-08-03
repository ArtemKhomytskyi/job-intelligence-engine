import { createServer } from 'node:http';

import { describe, expect, it } from 'vitest';

import {
  ConfigurationError,
  PipelineStageError,
  type RunFullPipelineResult,
} from '../../src/application/index.js';
import {
  formatFullPipelineResult,
  runFullPipelineCommand,
} from '../../src/interfaces/cli/run-command.js';
import { runServe } from '../../src/interfaces/cli/serve-command.js';
import type { LocalRuntime } from '../../src/interfaces/composition/local-runtime.js';

describe('Chunk 7 CLI commands', () => {
  it('prints a deterministic complete pipeline summary and empty result', async () => {
    const output = captureOutput();
    const runtime = fakeRuntime();
    await expect(
      runFullPipelineCommand(commandOptions(), output, () => runtime),
    ).resolves.toBe(0);
    expect(output.stdout.join('')).toBe(
      `${formatFullPipelineResult(result(), false)}\n`,
    );
    expect(output.stdout.join('')).toContain('Pipeline run complete');
    expect(output.stdout.join('')).toContain('Selected: 0');
    expect(runtime.closed).toBe(true);
  });

  it('maps invalid configuration, pipeline-stage failure, and database failure', async () => {
    const cases: readonly [Error, number][] = [
      [
        new ConfigurationError([
          {
            code: 'CONFIG_SCHEMA_INVALID',
            section: 'search',
            message: 'invalid',
          },
        ]),
        2,
      ],
      [new PipelineStageError('recommendations', 'recommendations failed'), 4],
      [new Error('database unavailable'), 3],
    ];
    for (const [failure, exitCode] of cases) {
      const output = captureOutput();
      const runtime = fakeRuntime(failure);
      await expect(
        runFullPipelineCommand(commandOptions(), output, () => runtime),
      ).resolves.toBe(exitCode);
      expect(output.stdout).toEqual([]);
      expect(runtime.closed).toBe(true);
    }
  });

  it('rejects unsafe serve host and invalid port before runtime creation', async () => {
    let created = false;
    const factory = (): LocalRuntime => {
      created = true;
      return fakeRuntime();
    };
    await expect(
      runServe(
        { ...serveOptions(), host: '0.0.0.0' },
        captureOutput(),
        factory,
      ),
    ).resolves.toBe(2);
    await expect(
      runServe({ ...serveOptions(), port: 70_000 }, captureOutput(), factory),
    ).resolves.toBe(2);
    expect(created).toBe(false);
  });

  it('checks database health, starts on loopback, and shuts down gracefully', async () => {
    const port = await availablePort();
    const controller = new AbortController();
    const output = captureOutput((value) => {
      if (value.includes('JIE local report available')) controller.abort();
    });
    const runtime = fakeRuntime();
    await expect(
      runServe(
        { ...serveOptions(), port, signal: controller.signal },
        output,
        () => runtime,
      ),
    ).resolves.toBe(0);
    expect(output.stdout.join('')).toContain(`http://127.0.0.1:${port}`);
    expect(runtime.healthChecks).toBe(1);
    expect(runtime.closed).toBe(true);
  });

  it('starts the local report when no real source is ready', async () => {
    const port = await availablePort();
    const controller = new AbortController();
    const output = captureOutput((value) => {
      if (value.includes('JIE local report available')) controller.abort();
    });
    const runtime = fakeRuntime();
    runtime.inspectSourceReadiness = () =>
      Promise.resolve({ sources: [], hasRealEnabledSource: false });

    await expect(
      runServe(
        { ...serveOptions(), port, signal: controller.signal },
        output,
        () => runtime,
      ),
    ).resolves.toBe(0);
    expect(output.stdout.join('')).toContain(`http://127.0.0.1:${port}`);
    expect(runtime.healthChecks).toBe(1);
  });

  it('fails safely when startup database health fails or the address is in use', async () => {
    const healthOutput = captureOutput();
    const unhealthy = fakeRuntime(new Error('database unavailable'), true);
    await expect(
      runServe(serveOptions(), healthOutput, () => unhealthy),
    ).resolves.toBe(3);
    expect(healthOutput.stderr.join('')).toContain('database unavailable');

    const occupied = createServer();
    await new Promise<void>((resolve) =>
      occupied.listen(0, '127.0.0.1', resolve),
    );
    const address = occupied.address();
    if (address === null || typeof address === 'string')
      throw new Error('Expected a TCP test address.');
    try {
      const output = captureOutput();
      await expect(
        runServe({ ...serveOptions(), port: address.port }, output, () =>
          fakeRuntime(),
        ),
      ).resolves.toBe(3);
      expect(output.stderr.join('')).toContain('already in use');
    } finally {
      await new Promise<void>((resolve, reject) =>
        occupied.close((error) =>
          error === undefined ? resolve() : reject(error),
        ),
      );
    }
  });
});

interface FakeRuntime extends LocalRuntime {
  closed: boolean;
  healthChecks: number;
}

function fakeRuntime(
  pipelineFailure?: Error,
  healthFailure = false,
): FakeRuntime {
  const runtime: FakeRuntime = {
    closed: false,
    healthChecks: 0,
    pipeline: {
      execute: () =>
        pipelineFailure === undefined
          ? Promise.resolve(result())
          : Promise.reject(pipelineFailure),
    },
    getReport: {
      execute: () => Promise.reject(new Error('not used')),
    },
    getDetails: {
      execute: () => Promise.reject(new Error('not used')),
    },
    updateStatus: {
      execute: () => Promise.reject(new Error('not used')),
    },
    health: {
      check: () => {
        runtime.healthChecks += 1;
        return healthFailure
          ? Promise.reject(pipelineFailure ?? new Error('database unavailable'))
          : Promise.resolve();
      },
    },
    validateConfiguration: () => Promise.resolve(),
    inspectSourceReadiness: () =>
      Promise.resolve({ sources: [], hasRealEnabledSource: true }),
    close: () => {
      runtime.closed = true;
      return Promise.resolve();
    },
  };
  return runtime;
}

function commandOptions() {
  return {
    configDirectory: 'config',
    concurrency: 2,
    processingLimit: 100,
    verbose: false,
    asJson: false,
    signal: new AbortController().signal,
  };
}

function serveOptions() {
  return {
    configDirectory: 'config',
    host: '127.0.0.1',
    port: 3000,
    concurrency: 2,
    processingLimit: 100,
    verbose: false,
    signal: new AbortController().signal,
  };
}

function result(): RunFullPipelineResult {
  return {
    startedAt: '2026-08-02T10:00:00.000Z',
    completedAt: '2026-08-02T10:01:00.000Z',
    collection: {
      runId: 'collection-run',
      startedAt: '2026-08-02T10:00:00.000Z',
      completedAt: '2026-08-02T10:00:20.000Z',
      status: 'PARTIALLY_FAILED',
      attemptedSourceCount: 2,
      succeededSourceCount: 1,
      failedSourceCount: 1,
      rawJobsFound: 4,
      createdJobs: 2,
      updatedJobs: 1,
      unchangedJobs: 1,
      linkedJobs: 0,
      invalidJobs: 0,
      persistenceFailures: 0,
      durationMs: 20_000,
      sourceSummaries: [],
    },
    processing: {
      runId: 'processing-run',
      startedAt: '2026-08-02T10:00:20.000Z',
      completedAt: '2026-08-02T10:00:40.000Z',
      status: 'COMPLETED',
      consideredCount: 4,
      normalizedCount: 4,
      normalizationFailedCount: 0,
      duplicateCount: 1,
      possibleDuplicateCount: 0,
      rejectedCount: 1,
      eligibleCount: 2,
      errorCount: 0,
      skippedCount: 0,
    },
    recommendations: {
      id: 'batch-empty',
      inputHash: 'hash',
      evaluationTime: '2026-08-02T10:00:00.000Z',
      requestedLimit: 20,
      selectedCount: 0,
      configurationFingerprint: 'config',
      scoringVersion: 'v1',
      selectorVersion: 'v1',
      createdAt: '2026-08-02T10:00:40.000Z',
      items: [],
      reused: false,
    },
  };
}

function captureOutput(onStdout?: (value: string) => void) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    writeStdout: (value: string) => {
      stdout.push(value);
      onStdout?.(value);
    },
    writeStderr: (value: string) => stderr.push(value),
  };
}

async function availablePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  if (address === null || typeof address === 'string')
    throw new Error('Expected a TCP test address.');
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error === undefined ? resolve() : reject(error))),
  );
  return address.port;
}
