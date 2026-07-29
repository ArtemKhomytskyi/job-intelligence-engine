import type {
  CandidateProfile,
  ScoringConfig,
  SearchConfiguration,
  SourceConfig,
} from '../../domain/index.js';
import type { ConfigurationSection } from './errors.js';

export interface ConfigurationFileRequest {
  readonly directory: string;
  readonly section: ConfigurationSection;
  readonly useExamples: boolean;
}

export interface ConfigurationFile {
  readonly path: string;
  readonly content: string;
}

export interface ConfigFileReader {
  read(request: ConfigurationFileRequest): Promise<ConfigurationFile>;
}

export type DecodedConfigurationDocument =
  | { readonly section: 'profile'; readonly value: CandidateProfile }
  | { readonly section: 'search'; readonly value: SearchConfiguration }
  | { readonly section: 'scoring'; readonly value: ScoringConfig }
  | { readonly section: 'sources'; readonly value: readonly SourceConfig[] };

export interface ConfigurationDecoder {
  decode(
    section: ConfigurationSection,
    file: ConfigurationFile,
  ): DecodedConfigurationDocument;
}
