import {
  ConfigurationError,
  PipelineStageError,
  type RunFullPipelineResult,
} from '../../application/index.js';
import { StreamLogger } from '../../infrastructure/index.js';
import {
  createLocalRuntime,
  type LocalRuntime,
} from '../composition/local-runtime.js';
import type { CommandOutput } from './validate-config-command.js';

export interface RunCommandOptions {
  readonly configDirectory: string;
  readonly concurrency: number;
  readonly processingLimit: number;
  readonly recommendationLimit?: number;
  readonly verbose: boolean;
  readonly asJson: boolean;
  readonly signal: AbortSignal;
}

export type LocalRuntimeFactory = (
  options: Parameters<typeof createLocalRuntime>[0],
) => LocalRuntime;

export async function runFullPipelineCommand(
  options: RunCommandOptions,
  output: CommandOutput,
  runtimeFactory: LocalRuntimeFactory = createLocalRuntime,
): Promise<number> {
  let runtime: LocalRuntime | undefined;
  try {
    const logger = new StreamLogger(output.writeStderr, options.verbose);
    runtime = runtimeFactory({
      configDirectory: options.configDirectory,
      logger,
    });
    const result = await runtime.pipeline.execute({
      initiatedBy: 'cli',
      collectionConcurrency: options.concurrency,
      processingLimit: options.processingLimit,
      ...(options.recommendationLimit === undefined
        ? {}
        : { recommendationLimit: options.recommendationLimit }),
      evaluationTime: new Date(),
      signal: options.signal,
    });
    output.writeStdout(`${formatFullPipelineResult(result, options.asJson)}\n`);
    return 0;
  } catch (error: unknown) {
    output.writeStderr(
      `${error instanceof Error ? error.message : 'Pipeline run failed unexpectedly.'}\n`,
    );
    if (error instanceof ConfigurationError || error instanceof RangeError)
      return 2;
    return error instanceof PipelineStageError ? 4 : 3;
  } finally {
    if (runtime !== undefined) await runtime.close();
  }
}

export function formatFullPipelineResult(
  result: RunFullPipelineResult,
  asJson: boolean,
): string {
  if (asJson) return JSON.stringify(result, undefined, 2);
  return [
    'Pipeline run complete',
    '',
    'Collection:',
    `  Run ID: ${result.collection.runId}`,
    `  Status: ${result.collection.status}`,
    `  Sources attempted: ${result.collection.attemptedSourceCount}`,
    `  Sources succeeded: ${result.collection.succeededSourceCount}`,
    `  Sources failed: ${result.collection.failedSourceCount}`,
    `  Jobs collected: ${result.collection.rawJobsFound}`,
    `  Jobs created: ${result.collection.createdJobs}`,
    `  Jobs updated: ${result.collection.updatedJobs}`,
    '',
    'Processing:',
    `  Run ID: ${result.processing.runId}`,
    `  Status: ${result.processing.status}`,
    `  Jobs considered: ${result.processing.consideredCount}`,
    `  Normalized: ${result.processing.normalizedCount}`,
    `  Duplicates: ${result.processing.duplicateCount}`,
    `  Possible duplicates: ${result.processing.possibleDuplicateCount}`,
    `  Rejected: ${result.processing.rejectedCount}`,
    `  Eligible: ${result.processing.eligibleCount}`,
    `  Errors: ${result.processing.errorCount}`,
    '',
    'Recommendations:',
    `  Batch ID: ${result.recommendations.id}`,
    `  Requested: ${result.recommendations.requestedLimit}`,
    `  Selected: ${result.recommendations.selectedCount}`,
    `  Reused: ${result.recommendations.reused ? 'yes' : 'no'}`,
  ].join('\n');
}
