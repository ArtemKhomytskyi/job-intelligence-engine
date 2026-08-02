import type { RunFullPipelineInput, RunFullPipelineResult } from './models.js';
import type { FullPipelineDependencies } from './ports.js';

export type PipelineStage =
  'configuration' | 'collection' | 'processing' | 'recommendations';

export class PipelineStageError extends Error {
  public constructor(
    public readonly stage: PipelineStage,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PipelineStageError';
  }
}

export class RunFullPipeline {
  public constructor(private readonly dependencies: FullPipelineDependencies) {}

  public async execute(
    input: RunFullPipelineInput,
  ): Promise<RunFullPipelineResult> {
    validateInput(input);
    const startedAt = input.evaluationTime.toISOString();
    this.dependencies.logger.info('full_pipeline_started', {
      initiatedBy: input.initiatedBy,
      startedAt,
    });
    try {
      this.stageStarted('configuration');
      const configuration = await this.dependencies.configuration.load();
      this.stageCompleted('configuration');

      this.stageStarted('collection');
      const collection = await this.dependencies.collection.execute({
        configuration,
        initiatedBy: input.initiatedBy,
        concurrency: input.collectionConcurrency,
        signal: input.signal,
      });
      if (collection.status === 'FAILED' || collection.status === 'CANCELLED')
        throw new PipelineStageError(
          'collection',
          `Collection ${collection.status.toLowerCase()}; downstream stages were not run.`,
        );
      this.stageCompleted('collection', collection.runId);

      this.stageStarted('processing');
      const processing = await this.dependencies.processing.execute({
        configuration,
        initiatedBy: input.initiatedBy,
        limit: input.processingLimit,
        signal: input.signal,
      });
      if (processing.status === 'FAILED' || processing.status === 'CANCELLED')
        throw new PipelineStageError(
          'processing',
          `Processing ${processing.status.toLowerCase()}; recommendations were not generated.`,
        );
      this.stageCompleted('processing', processing.runId);

      this.stageStarted('recommendations');
      const recommendations = await this.dependencies.recommendations.execute({
        configuration,
        initiatedBy: input.initiatedBy,
        limit:
          input.recommendationLimit ??
          configuration.search.preferences.dailyRecommendationLimit,
        evaluationTime: input.evaluationTime,
        signal: input.signal,
      });
      this.stageCompleted('recommendations', recommendations.id);
      const completedAt = this.dependencies.clock.now().toISOString();
      this.dependencies.logger.info('full_pipeline_completed', {
        initiatedBy: input.initiatedBy,
        collectionRunId: collection.runId,
        processingRunId: processing.runId,
        recommendationBatchId: recommendations.id,
      });
      return {
        startedAt,
        completedAt,
        collection,
        processing,
        recommendations,
      };
    } catch (cause: unknown) {
      this.dependencies.logger.error('full_pipeline_failed', {
        initiatedBy: input.initiatedBy,
        errorCode: cause instanceof Error ? cause.name : 'PIPELINE_ERROR',
      });
      throw cause;
    }
  }

  private stageStarted(stage: PipelineStage): void {
    this.dependencies.logger.info('full_pipeline_stage_started', { stage });
  }

  private stageCompleted(stage: PipelineStage, runId?: string): void {
    this.dependencies.logger.info('full_pipeline_stage_completed', {
      stage,
      runId,
    });
  }
}

function validateInput(input: RunFullPipelineInput): void {
  if (!Number.isFinite(input.evaluationTime.getTime()))
    throw new RangeError('Pipeline evaluation time must be valid.');
  if (
    !Number.isInteger(input.collectionConcurrency) ||
    input.collectionConcurrency < 1 ||
    input.collectionConcurrency > 8
  )
    throw new RangeError(
      'Collection concurrency must be an integer from 1 through 8.',
    );
  if (
    !Number.isInteger(input.processingLimit) ||
    input.processingLimit < 1 ||
    input.processingLimit > 10_000
  )
    throw new RangeError(
      'Processing limit must be an integer from 1 through 10000.',
    );
  if (
    input.recommendationLimit !== undefined &&
    (!Number.isInteger(input.recommendationLimit) ||
      input.recommendationLimit < 1 ||
      input.recommendationLimit > 1_000)
  )
    throw new RangeError(
      'Recommendation limit must be an integer from 1 through 1000.',
    );
}
