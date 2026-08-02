import type { ConfigurationBundle } from '../configuration/configuration-bundle.js';
import type { CollectionRunSummary } from '../collection/models.js';
import type { ProcessingRunSummary } from '../processing/models.js';
import type { PersistedRecommendationBatch } from '../recommendations/models.js';

export interface RunFullPipelineInput {
  readonly initiatedBy: 'cli' | 'web';
  readonly collectionConcurrency: number;
  readonly processingLimit: number;
  readonly recommendationLimit?: number;
  readonly evaluationTime: Date;
  readonly signal: AbortSignal;
}

export interface RunFullPipelineResult {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly collection: CollectionRunSummary;
  readonly processing: ProcessingRunSummary;
  readonly recommendations: PersistedRecommendationBatch;
}

export interface FullPipelineStageInput {
  readonly configuration: ConfigurationBundle;
  readonly initiatedBy: 'cli' | 'web';
  readonly signal: AbortSignal;
}

export interface CollectionStageInput extends FullPipelineStageInput {
  readonly concurrency: number;
}

export interface ProcessingStageInput extends FullPipelineStageInput {
  readonly limit: number;
}

export interface RecommendationStageInput extends FullPipelineStageInput {
  readonly limit: number;
  readonly evaluationTime: Date;
}
