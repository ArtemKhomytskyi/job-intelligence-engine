import {
  ConfigurationError,
  CreateRecommendations,
  TransactionalRecommendationBatchRepository,
  loadConfiguration,
  type PersistedRecommendationBatch,
} from '../../application/index.js';
import {
  FileSystemConfigReader,
  PrismaTransactionManager,
  Sha256ProcessingHasher,
  SystemClock,
  ZodYamlConfigurationDecoder,
  createPrismaClient,
} from '../../infrastructure/index.js';
import type { CommandOutput } from './validate-config-command.js';

export interface RecommendCommandOptions {
  readonly configDirectory: string;
  readonly limit: number;
  readonly asJson: boolean;
  readonly signal: AbortSignal;
}

export async function runRecommend(
  options: RecommendCommandOptions,
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
    const batch = await new CreateRecommendations(
      new TransactionalRecommendationBatchRepository(
        new PrismaTransactionManager(client),
      ),
      new SystemClock(),
      new Sha256ProcessingHasher(),
    ).execute({
      limit: options.limit,
      candidate: bundle.candidate,
      search: bundle.search,
      scoring: bundle.scoring,
      sources: bundle.sources,
      signal: options.signal,
    });
    output.writeStdout(`${formatRecommendationBatch(batch, options.asJson)}\n`);
    return 0;
  } catch (error: unknown) {
    output.writeStderr(
      `${error instanceof Error ? error.message : 'Recommendation generation failed unexpectedly.'}\n`,
    );
    return error instanceof ConfigurationError || error instanceof RangeError
      ? 2
      : 3;
  } finally {
    if (client !== undefined) await client.$disconnect();
  }
}

export function formatRecommendationBatch(
  batch: PersistedRecommendationBatch,
  asJson: boolean,
): string {
  if (asJson) return JSON.stringify(batch, undefined, 2);
  const header = [
    `Recommendation batch: ${batch.id}${batch.reused ? ' (reused)' : ''}`,
    `Evaluation time: ${batch.evaluationTime}`,
    `Requested: ${batch.requestedLimit}`,
    `Selected: ${batch.selectedCount}`,
  ];
  if (batch.items.length === 0)
    return [
      ...header,
      'No eligible recommendations met the configured criteria.',
    ].join('\n');
  return [
    ...header,
    ...batch.items.map((item) => {
      const positives = item.score.positiveReasons
        .slice(0, 2)
        .map((reason) => reason.code)
        .join(', ');
      const concerns = item.score.concerns
        .slice(0, 2)
        .map((reason) => reason.code)
        .join(', ');
      return `${item.rank}. ${item.title} — ${item.company} | ${item.score.selectedTrackId} | score ${item.score.totalScore.toFixed(2)} | opportunity ${item.score.opportunityScore.toFixed(2)} | positives: ${positives || 'none'} | concerns: ${concerns || 'none'} | missing: ${item.score.missingData.length}`;
    }),
  ].join('\n');
}
