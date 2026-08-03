import {
  CollectionOrchestrator,
  CompanyDiscoveryService,
  CreateRecommendations,
  ExistingCollectionPersistence,
  GetRecommendationDetails,
  GetRecommendationReport,
  ProcessCollectedJobs,
  RunFullPipeline,
  SingleActivePipelineRunner,
  TransactionalProcessingRepository,
  TransactionalRecommendationBatchRepository,
  UpdateJobApplicationStatus,
  loadConfiguration,
  resolveCompanySources,
  toCollectableSources,
  type Clock,
  type CompanyHealthRecord,
  type CrawlHealthSummary,
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
  type ProviderDiscoveryResult,
  type SourceReadinessReport,
} from '../../domain/index.js';
import {
  AbortableSleeper,
  ConditionalCachingHttpClient,
  FileSystemConfigReader,
  NodeFetchHttpClient,
  PlaywrightBrowserRenderer,
  PrismaDatabaseHealth,
  PrismaCompanyRegistryStore,
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
import { createCollectorRegistry } from './collector-composition.js';

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
  discoverCompany?(
    url: string,
    signal?: AbortSignal,
  ): Promise<ProviderDiscoveryResult>;
  discoverAll?(
    signal?: AbortSignal,
  ): Promise<readonly ProviderDiscoveryResult[]>;
  getCompanyHealth?(
    companyId: string,
  ): Promise<CompanyHealthRecord | undefined>;
  getCollectionHealth?(): Promise<CrawlHealthSummary>;
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
  const baseHttp = new NodeFetchHttpClient(urlSafety);
  const http = new ConditionalCachingHttpClient(
    new RetryingHttpClient(
      new RateLimitedHttpClient(baseHttp, clock, sleeper),
      sleeper,
      options.logger,
    ),
    client,
  );
  const companyRegistry = new PrismaCompanyRegistryStore(client);
  const discovery = new CompanyDiscoveryService(http, companyRegistry);
  const browser = new PlaywrightBrowserRenderer(urlSafety, clock);
  const registry = createCollectorRegistry({
    http,
    clock,
    browser,
    logger: options.logger,
  });
  const pipeline = new SingleActivePipelineRunner(
    new RunFullPipeline({
      configuration: {
        load: () => loadLocalConfiguration(options.configDirectory),
      },
      collection: {
        execute: async (input) => {
          const explicitSources = input.configuration.sources.some(
            (source) => source.enabled,
          )
            ? toCollectableSources(input.configuration.sources)
            : [];
          const discovered = await resolveCompanySources(
            discovery,
            input.configuration.companies ?? [],
            {
              collectedAt: clock.now().toISOString(),
              signal: input.signal,
            },
          );
          const discoveredAt = clock.now().toISOString();
          await Promise.all(
            discovered.discoveries.map((result) =>
              companyRegistry.recordDiscovery(result, discoveredAt),
            ),
          );
          for (const result of discovered.discoveries)
            if (result.status === 'UNKNOWN_PROVIDER')
              options.logger.warn('Company provider discovery failed.', {
                companyId: result.companyId,
                errorCode: 'UNKNOWN_PROVIDER',
              });
          const summary = await new CollectionOrchestrator({
            registry,
            persistence: new ExistingCollectionPersistence(transactions),
            clock,
            logger: options.logger,
          }).collect({
            sources: [...explicitSources, ...discovered.sources],
            concurrency: input.concurrency,
            signal: input.signal,
            initiatedBy: input.initiatedBy,
          });
          await Promise.all(
            discovered.discoveries.flatMap((result) => {
              const source = summary.sourceSummaries.find(
                (candidate) =>
                  candidate.sourceId === `company-${result.companyId}`,
              );
              return source === undefined
                ? []
                : [
                    companyRegistry.recordCrawl(
                      result.companyId,
                      summary,
                      source,
                      summary.completedAt,
                    ),
                  ];
            }),
          );
          return summary;
        },
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
            sources: [
              ...input.configuration.sources,
              ...(input.configuration.companies ?? []).map((company) => ({
                id: `company-${company.id}`,
                tags: company.tags,
                trackIds: company.trackIds,
                trackPolicy: company.trackPolicy,
              })),
            ],
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
    async discoverCompany(
      url: string,
      signal = new AbortController().signal,
    ): Promise<ProviderDiscoveryResult> {
      const parsed = new URL(url);
      const slug = parsed.hostname
        .replace(/^www\./u, '')
        .replace(/[^a-z0-9]+/giu, '-')
        .replace(/^-|-$/gu, '')
        .toLocaleLowerCase('en-US');
      const result = await discovery.discover(
        {
          id: slug.length === 0 ? 'discovered-company' : slug,
          name: parsed.hostname,
          enabled: true,
          careersUrl: parsed.toString(),
          tags: [],
          trackIds: [],
          trackPolicy: 'preferred',
        },
        { collectedAt: clock.now().toISOString(), signal },
      );
      await companyRegistry.recordDiscovery(result, clock.now().toISOString());
      return result;
    },
    async discoverAll(
      signal = new AbortController().signal,
    ): Promise<readonly ProviderDiscoveryResult[]> {
      const configuration = await loadLocalConfiguration(
        options.configDirectory,
      );
      const resolution = await resolveCompanySources(
        discovery,
        configuration.companies ?? [],
        { collectedAt: clock.now().toISOString(), signal },
      );
      const discoveredAt = clock.now().toISOString();
      await Promise.all(
        resolution.discoveries.map((result) =>
          companyRegistry.recordDiscovery(result, discoveredAt),
        ),
      );
      return resolution.discoveries;
    },
    getCompanyHealth: (companyId) => companyRegistry.getCompany(companyId),
    getCollectionHealth: () => companyRegistry.getHealth(),
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
