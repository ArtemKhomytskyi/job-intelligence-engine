import { parse } from 'yaml';

import {
  ConfigurationError,
  type ConfigurationSection,
} from '../../application/index.js';

export function parseYaml(
  content: string,
  filePath: string,
  section: ConfigurationSection,
): unknown {
  try {
    return parse(content, { maxAliasCount: 50, uniqueKeys: true });
  } catch (cause: unknown) {
    throw new ConfigurationError(
      [
        {
          code: 'CONFIG_YAML_INVALID',
          section,
          filePath,
          message: `Invalid YAML in ${filePath}.`,
        },
      ],
      { cause },
    );
  }
}
