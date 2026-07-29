import {
  CollectionError,
  CollectionOrchestrator,
  CollectorRegistry,
  ConfigurationError,
  ExistingCollectionPersistence,
  GenericExtractionEngine,
  GenericWebCollector,
  loadConfiguration,
  toCollectableSources,
  type CollectionRunSummary,
} from '../../application/index.js';
import {
  AbortableSleeper,
  createPrismaClient,
  FileSystemConfigReader,
  GreenhouseCollector,
  LeverCollector,
  NodeFetchHttpClient,
  HttpPageAcquirer,
  CheerioDocumentExtractor,
  PlaywrightBrowserRenderer,
  PublicUrlSafetyValidator,
  PrismaTransactionManager,
  RateLimitedHttpClient,
  RetryingHttpClient,
  StreamLogger,
  SystemClock,
  ZodYamlConfigurationDecoder,
} from '../../infrastructure/index.js';
import type { CommandOutput } from './validate-config-command.js';

export interface CollectCommandOptions {
  readonly configDirectory: string;
  readonly sourceIds: readonly string[];
  readonly sourceType?: string;
  readonly concurrency: number;
  readonly verbose: boolean;
  readonly asJson: boolean;
  readonly signal: AbortSignal;
}

export async function runCollect(
  options: CollectCommandOptions,
  output: CommandOutput,
): Promise<number> {
  const logger = new StreamLogger(output.writeStderr, options.verbose);
  let client: ReturnType<typeof createPrismaClient> | undefined;
  let browser: PlaywrightBrowserRenderer | undefined;
  try {
    if (
      !Number.isInteger(options.concurrency) ||
      options.concurrency < 1 ||
      options.concurrency > 8
    )
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        'Concurrency must be an integer from 1 through 8.',
      );
    if (
      options.sourceType !== undefined &&
      options.sourceType !== 'greenhouse' &&
      options.sourceType !== 'lever' &&
      options.sourceType !== 'generic-page' &&
      options.sourceType !== 'generic-job-list'
    )
      throw new CollectionError(
        'SOURCE_CONFIGURATION_INVALID',
        'Source type must be greenhouse, lever, generic-page, or generic-job-list.',
      );
    const bundle = await loadConfiguration(
      {
        reader: new FileSystemConfigReader(),
        decoder: new ZodYamlConfigurationDecoder(),
      },
      { directory: options.configDirectory },
    );
    const sources = toCollectableSources(bundle.sources, {
      ...(options.sourceIds.length === 0
        ? {}
        : { sourceIds: new Set(options.sourceIds) }),
      ...(options.sourceType === undefined
        ? {}
        : { sourceType: options.sourceType }),
    });
    const clock = new SystemClock();
    const sleeper = new AbortableSleeper();
    const urlSafety = new PublicUrlSafetyValidator();
    const baseHttp = new NodeFetchHttpClient(fetch, urlSafety);
    const http = new RetryingHttpClient(
      new RateLimitedHttpClient(baseHttp, clock, sleeper),
      sleeper,
      logger,
    );
    browser = new PlaywrightBrowserRenderer(urlSafety, clock);
    const extractionEngine = new GenericExtractionEngine(
      new HttpPageAcquirer(http),
      new CheerioDocumentExtractor(),
      browser,
      logger,
    );
    const registry = new CollectorRegistry([
      new GreenhouseCollector(http, clock),
      new LeverCollector(http, clock),
      new GenericWebCollector('generic-page', extractionEngine, clock),
      new GenericWebCollector('generic-job-list', extractionEngine, clock),
    ]);
    client = createPrismaClient();
    const persistence = new ExistingCollectionPersistence(
      new PrismaTransactionManager(client),
    );
    const summary = await new CollectionOrchestrator({
      registry,
      persistence,
      clock,
      logger,
    }).collect({
      sources,
      concurrency: options.concurrency,
      signal: options.signal,
      initiatedBy: 'cli',
    });
    output.writeStdout(`${formatCollectionSummary(summary, options.asJson)}\n`);
    return summary.status === 'FAILED' || summary.status === 'CANCELLED'
      ? 4
      : 0;
  } catch (error: unknown) {
    const code = error instanceof CollectionError ? error.code : undefined;
    output.writeStderr(
      `${error instanceof Error ? error.message : 'Collection failed unexpectedly.'}\n`,
    );
    if (
      error instanceof ConfigurationError ||
      code === 'SOURCE_CONFIGURATION_INVALID'
    )
      return 2;
    return code === 'COLLECTION_RUN_PERSISTENCE_FAILED' || code === undefined
      ? 3
      : 4;
  } finally {
    if (browser !== undefined) await browser.close();
    if (client !== undefined) await client.$disconnect();
  }
}

export function formatCollectionSummary(
  summary: CollectionRunSummary,
  asJson: boolean,
): string {
  if (asJson) return JSON.stringify(summary, undefined, 2);
  const lines = [
    `Collection ${summary.status.toLowerCase()}`,
    `Run: ${summary.runId}`,
    `Sources: ${summary.succeededSourceCount} succeeded, ${summary.failedSourceCount} failed`,
    `Jobs: ${summary.createdJobs} created, ${summary.updatedJobs} updated, ${summary.unchangedJobs} unchanged, ${summary.linkedJobs} linked, ${summary.invalidJobs} invalid`,
    `Persistence failures: ${summary.persistenceFailures}`,
    `Duration: ${summary.durationMs} ms`,
  ];
  for (const source of summary.sourceSummaries)
    lines.push(
      `- ${source.sourceName}: ${source.status} (${source.rawJobsFound} found, ${source.createdJobs} created, ${source.persistenceFailures} persistence failures)`,
    );
  return lines.join('\n');
}
