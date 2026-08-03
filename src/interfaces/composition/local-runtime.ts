import {
  CollectionOrchestrator,
  CollectorRegistry,
  CreateRecommendations,
  ExistingCollectionPersistence,
  GenericExtractionEngine,
  GenericWebCollector,
  GetRecommendationDetails,
  GetRecommendationReport,
  ProcessCollectedJobs,
  RunFullPipeline,
  SingleActivePipelineRunner,
  TransactionalProcessingRepository,
  TransactionalRecommendationBatchRepository,
  UpdateJobApplicationStatus,
  loadConfiguration,
  toCollectableSources,
  type Clock,
  type DatabaseHealthPort,
  type FullPipelineRunner,
  type Logger,
  type RecommendationDetails,
  type RecommendationReport,
  type RecommendationReportQuery,
  type UpdateApplicationStatusResult,
  type UserApplicationStatus,
} from '../../application/index.js';
import {
  inspectSourceReadiness,
  type SourceReadinessReport,
} from '../../domain/index.js';
import {
  AbortableSleeper,
  CheerioDocumentExtractor,
  FileSystemConfigReader,
  GreenhouseCollector,
  HttpPageAcquirer,
  LeverCollector,
  NodeFetchHttpClient,
  PlaywrightBrowserRenderer,
  PrismaDatabaseHealth,
  PrismaRecommendationReportRepository,
  PrismaTransactionManager,
  PublicUrlSafetyValidator,
  RateLimitedHttpClient,
  RetryingHttpClient,
  Sha256ProcessingHasher,
  SystemClock,
  ZodYamlConfigurationDecoder,
  createPrismaClient,
} from '../../infrastructure/index.js';

export interface LocalRuntimeOptions {
  readonly configDirectory: string;
  readonly logger: Logger;
}

export interface LocalRuntime {
  readonly pipeline: FullPipelineRunner;
  readonly getReport: {
    execute(query: RecommendationReportQuery): Promise<RecommendationReport>;
  };
  readonly getDetails: {
    execute(recommendationId: string): Promise<RecommendationDetails>;
  };
  readonly updateStatus: {
    execute(
      recommendationId: string,
      targetStatus: UserApplicationStatus,
      reason?: string,
    ): Promise<UpdateApplicationStatusResult>;
  };
  readonly health: DatabaseHealthPort;
  validateConfiguration(): Promise<void>;
  inspectSourceReadiness(): Promise<SourceReadinessReport>;
  close(): Promise<void>;
}

export function createLocalRuntime(options: LocalRuntimeOptions): LocalRuntime {
  const client = createPrismaClient();
  const clock = new SystemClock();
  const transactions = new PrismaTransactionManager(client);
  const sleeper = new AbortableSleeper();
  const urlSafety = new PublicUrlSafetyValidator();
  const baseHttp = new NodeFetchHttpClient(fetch, urlSafety);
  const http = new RetryingHttpClient(
    new RateLimitedHttpClient(baseHttp, clock, sleeper),
    sleeper,
    options.logger,
  );
  const browser = new PlaywrightBrowserRenderer(urlSafety, clock);
  const extractionEngine = new GenericExtractionEngine(
    new HttpPageAcquirer(http),
    new CheerioDocumentExtractor(),
    browser,
    options.logger,
  );
  const registry = new CollectorRegistry([
    new GreenhouseCollector(http, clock),
    new LeverCollector(http, clock),
    new GenericWebCollector('generic-page', extractionEngine, clock),
    new GenericWebCollector('generic-job-list', extractionEngine, clock),
  ]);
  const pipeline = new SingleActivePipelineRunner(
    new RunFullPipeline({
      configuration: {
        load: () => loadLocalConfiguration(options.configDirectory),
      },
      collection: {
        execute: (input) =>
          new CollectionOrchestrator({
            registry,
            persistence: new ExistingCollectionPersistence(transactions),
            clock,
            logger: options.logger,
          }).collect({
            sources: toCollectableSources(input.configuration.sources),
            concurrency: input.concurrency,
            signal: input.signal,
            initiatedBy: input.initiatedBy,
          }),
      },
      processing: {
        execute: (input) =>
          new ProcessCollectedJobs(
            new TransactionalProcessingRepository(transactions),
            clock,
            options.logger,
            new Sha256ProcessingHasher(),
          ).execute({
            limit: input.limit,
            initiatedBy: input.initiatedBy,
            candidate: input.configuration.candidate,
            hardFilters: input.configuration.search.preferences.hardFilters,
            signal: input.signal,
          }),
      },
      recommendations: {
        execute: (input) =>
          new CreateRecommendations(
            new TransactionalRecommendationBatchRepository(transactions),
            new FixedClock(input.evaluationTime),
            new Sha256ProcessingHasher(),
          ).execute({
            limit: input.limit,
            candidate: input.configuration.candidate,
            search: input.configuration.search,
            scoring: input.configuration.scoring,
            sources: input.configuration.sources,
            signal: input.signal,
          }),
      },
      logger: options.logger,
      clock,
    }),
  );
  const reportRepository = new PrismaRecommendationReportRepository(client);
  const updateStatus = new UpdateJobApplicationStatus(
    reportRepository,
    clock,
    options.logger,
  );
  return {
    pipeline,
    getReport: new GetRecommendationReport(reportRepository),
    getDetails: new GetRecommendationDetails(reportRepository, updateStatus),
    updateStatus,
    health: new PrismaDatabaseHealth(client),
    async validateConfiguration(): Promise<void> {
      await loadLocalConfiguration(options.configDirectory);
    },
    async inspectSourceReadiness(): Promise<SourceReadinessReport> {
      const configuration = await loadLocalConfiguration(
        options.configDirectory,
        'inspection',
      );
      return inspectSourceReadiness(configuration.sources);
    },
    async close(): Promise<void> {
      await browser.close();
      await client.$disconnect();
    },
  };
}

function loadLocalConfiguration(
  configDirectory: string,
  validationMode: 'runtime' | 'inspection' = 'runtime',
) {
  return loadConfiguration(
    {
      reader: new FileSystemConfigReader(),
      decoder: new ZodYamlConfigurationDecoder(),
    },
    { directory: configDirectory, validationMode },
  );
}

class FixedClock implements Clock {
  public constructor(private readonly value: Date) {}

  public now(): Date {
    return new Date(this.value.getTime());
  }
}
