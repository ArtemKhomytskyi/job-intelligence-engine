import type {
  CandidateProfile,
  ScoringConfig,
  SearchConfiguration,
  SourceConfig,
} from '../../domain/index.js';
import type {
  ConfigurationBundle,
  ConfigurationLoadOptions,
} from './configuration-bundle.js';
import {
  ConfigurationError,
  type ConfigurationIssue,
  type ConfigurationSection,
} from './errors.js';
import type { ConfigFileReader, ConfigurationDecoder } from './ports.js';
import { validateConfiguration } from './validate-configuration.js';

const CONFIGURATION_SECTIONS: readonly ConfigurationSection[] = [
  'profile',
  'search',
  'scoring',
  'sources',
];

export interface ConfigurationDependencies {
  readonly reader: ConfigFileReader;
  readonly decoder: ConfigurationDecoder;
}

export async function loadConfiguration(
  dependencies: ConfigurationDependencies,
  options: ConfigurationLoadOptions = {},
): Promise<ConfigurationBundle> {
  const directory = options.directory ?? 'config';
  const useExamples = options.useExamples ?? false;
  const issues: ConfigurationIssue[] = [];
  let candidate: CandidateProfile | undefined;
  let search: SearchConfiguration | undefined;
  let scoring: ScoringConfig | undefined;
  let sources: readonly SourceConfig[] | undefined;

  for (const section of CONFIGURATION_SECTIONS) {
    try {
      const file = await dependencies.reader.read({
        directory,
        section,
        useExamples,
      });
      const document = dependencies.decoder.decode(section, file);

      switch (document.section) {
        case 'profile':
          candidate = document.value;
          break;
        case 'search':
          search = document.value;
          break;
        case 'scoring':
          scoring = document.value;
          break;
        case 'sources':
          sources = document.value;
          break;
      }
    } catch (error: unknown) {
      if (error instanceof ConfigurationError) {
        issues.push(...error.issues);
      } else {
        issues.push({
          code: 'CONFIG_INTERNAL_ERROR',
          section,
          message: `Unexpected failure while loading the ${section} configuration.`,
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new ConfigurationError(issues);
  }

  if (
    candidate === undefined ||
    search === undefined ||
    scoring === undefined ||
    sources === undefined
  ) {
    throw new ConfigurationError([
      {
        code: 'CONFIG_INTERNAL_ERROR',
        section: 'profile',
        message:
          'Configuration loader completed without all required sections.',
      },
    ]);
  }

  const bundle: ConfigurationBundle = { candidate, search, scoring, sources };
  validateConfiguration(bundle);
  return bundle;
}
