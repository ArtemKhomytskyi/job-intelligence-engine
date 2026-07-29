import type { z } from 'zod';

import {
  ConfigurationError,
  type ConfigurationDecoder,
  type ConfigurationFile,
  type ConfigurationIssue,
  type ConfigurationSection,
  type DecodedConfigurationDocument,
} from '../../application/index.js';
import {
  mapProfile,
  mapScoring,
  mapSearch,
  mapSources,
} from './configuration-mapper.js';
import { profileSchema } from './schemas/profile-schema.js';
import { scoringSchema } from './schemas/scoring-schema.js';
import { searchSchema } from './schemas/search-schema.js';
import { sourcesSchema } from './schemas/sources-schema.js';
import { parseYaml } from './yaml-parser.js';

export class ZodYamlConfigurationDecoder implements ConfigurationDecoder {
  public decode(
    section: ConfigurationSection,
    file: ConfigurationFile,
  ): DecodedConfigurationDocument {
    const input = parseYaml(file.content, file.path, section);

    switch (section) {
      case 'profile': {
        const value = parseSchema(profileSchema, input, section, file.path);
        return { section, value: mapProfile(value) };
      }
      case 'search': {
        const value = parseSchema(searchSchema, input, section, file.path);
        return { section, value: mapSearch(value, file.path) };
      }
      case 'scoring': {
        const value = parseSchema(scoringSchema, input, section, file.path);
        return { section, value: mapScoring(value) };
      }
      case 'sources': {
        const value = parseSchema(sourcesSchema, input, section, file.path);
        return { section, value: mapSources(value) };
      }
    }
  }
}

function parseSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
  section: ConfigurationSection,
  filePath: string,
): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const issues: ConfigurationIssue[] = result.error.issues.map((issue) => ({
    code: 'CONFIG_SCHEMA_INVALID',
    section,
    filePath,
    ...(issue.path.length === 0 ? {} : { fieldPath: formatPath(issue.path) }),
    message: issue.message,
  }));
  throw new ConfigurationError(issues, { cause: result.error });
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number') {
      return `${formatted}[${segment}]`;
    }
    const separator = formatted.length === 0 ? '' : '.';
    return `${formatted}${separator}${String(segment)}`;
  }, '');
}
