import type {
  CandidateProfile,
  ScoringConfig,
  SearchConfiguration,
  SourceConfig,
} from '../../domain/index.js';

export interface ConfigurationBundle {
  readonly candidate: CandidateProfile;
  readonly search: SearchConfiguration;
  readonly scoring: ScoringConfig;
  readonly sources: readonly SourceConfig[];
}

export interface ConfigurationLoadOptions {
  readonly directory?: string;
  readonly useExamples?: boolean;
  readonly validationMode?: ConfigurationValidationMode;
}

export type ConfigurationValidationMode = 'runtime' | 'examples' | 'inspection';
