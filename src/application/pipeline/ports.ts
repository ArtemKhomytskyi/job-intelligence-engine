import type { ConfigurationBundle } from '../configuration/configuration-bundle.js';
import type { CollectionRunSummary } from '../collection/models.js';
import type { Clock, Logger } from '../collection/ports.js';
import type { ProcessingRunSummary } from '../processing/models.js';
import type { PersistedRecommendationBatch } from '../recommendations/models.js';
import type {
  CollectionStageInput,
  ProcessingStageInput,
  RecommendationStageInput,
} from './models.js';

export interface FullPipelineConfigurationPort {
  load(): Promise<ConfigurationBundle>;
}

export interface FullPipelineCollectionPort {
  execute(input: CollectionStageInput): Promise<CollectionRunSummary>;
}

export interface FullPipelineProcessingPort {
  execute(input: ProcessingStageInput): Promise<ProcessingRunSummary>;
}

export interface FullPipelineRecommendationPort {
  execute(
    input: RecommendationStageInput,
  ): Promise<PersistedRecommendationBatch>;
}

export interface FullPipelineDependencies {
  readonly configuration: FullPipelineConfigurationPort;
  readonly collection: FullPipelineCollectionPort;
  readonly processing: FullPipelineProcessingPort;
  readonly recommendations: FullPipelineRecommendationPort;
  readonly logger: Logger;
  readonly clock: Clock;
}
