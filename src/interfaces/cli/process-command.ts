import {
  ConfigurationError,
  loadConfiguration,
  ProcessCollectedJobs,
  TransactionalProcessingRepository,
  type ProcessingRunSummary,
} from '../../application/index.js';
import {
  createPrismaClient,
  FileSystemConfigReader,
  PrismaTransactionManager,
  Sha256ProcessingHasher,
  StreamLogger,
  SystemClock,
  ZodYamlConfigurationDecoder,
} from '../../infrastructure/index.js';
import type { CommandOutput } from './validate-config-command.js';

export interface ProcessCommandOptions {
  readonly configDirectory: string;
  readonly limit: number;
  readonly verbose: boolean;
  readonly asJson: boolean;
  readonly signal: AbortSignal;
}

export async function runProcess(
  options: ProcessCommandOptions,
  output: CommandOutput,
): Promise<number> {
  let client: ReturnType<typeof createPrismaClient> | undefined;
  try {
    const bundle = await loadConfiguration(
      {
        reader: new FileSystemConfigReader(),
        decoder: new ZodYamlConfigurationDecoder(),
      },
      { directory: options.configDirectory },
    );
    client = createPrismaClient();
    const processor = new ProcessCollectedJobs(
      new TransactionalProcessingRepository(
        new PrismaTransactionManager(client),
      ),
      new SystemClock(),
      new StreamLogger(output.writeStderr, options.verbose),
      new Sha256ProcessingHasher(),
    );
    const summary = await processor.execute({
      limit: options.limit,
      initiatedBy: 'cli',
      candidate: bundle.candidate,
      hardFilters: bundle.search.preferences.hardFilters,
      signal: options.signal,
    });
    output.writeStdout(`${formatProcessingSummary(summary, options.asJson)}\n`);
    return summary.status === 'FAILED' || summary.status === 'CANCELLED'
      ? 4
      : 0;
  } catch (error: unknown) {
    output.writeStderr(
      `${error instanceof Error ? error.message : 'Processing failed unexpectedly.'}\n`,
    );
    return error instanceof ConfigurationError || error instanceof RangeError
      ? 2
      : 3;
  } finally {
    if (client !== undefined) await client.$disconnect();
  }
}

export function formatProcessingSummary(
  summary: ProcessingRunSummary,
  asJson: boolean,
): string {
  if (asJson) return JSON.stringify(summary, undefined, 2);
  return [
    `Processing ${summary.status.toLowerCase()}`,
    `Run: ${summary.runId}`,
    `Considered: ${summary.consideredCount}`,
    `Normalized: ${summary.normalizedCount} (${summary.normalizationFailedCount} failed)`,
    `Deduplication: ${summary.duplicateCount} duplicates, ${summary.possibleDuplicateCount} possible duplicates`,
    `Filters: ${summary.rejectedCount} rejected, ${summary.eligibleCount} eligible`,
    `Skipped: ${summary.skippedCount}`,
    `Errors: ${summary.errorCount}`,
  ].join('\n');
}
