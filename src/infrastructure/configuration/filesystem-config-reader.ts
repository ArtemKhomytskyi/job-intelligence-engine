import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  ConfigurationError,
  type ConfigFileReader,
  type ConfigurationFile,
  type ConfigurationFileRequest,
} from '../../application/index.js';

export class FileSystemConfigReader implements ConfigFileReader {
  public async read(
    request: ConfigurationFileRequest,
  ): Promise<ConfigurationFile> {
    const suffix = request.useExamples ? '.example' : '';
    const path = resolve(request.directory, `${request.section}${suffix}.yaml`);

    try {
      return { path, content: await readFile(path, 'utf8') };
    } catch (cause: unknown) {
      const notFound = getErrorCode(cause) === 'ENOENT';
      throw new ConfigurationError(
        [
          {
            code: notFound ? 'CONFIG_FILE_NOT_FOUND' : 'CONFIG_FILE_UNREADABLE',
            section: request.section,
            filePath: path,
            message: notFound
              ? `Configuration file not found: ${path}`
              : `Configuration file could not be read: ${path}`,
          },
        ],
        { cause },
      );
    }
  }
}

function getErrorCode(error: unknown): unknown {
  if (error instanceof Error && 'code' in error) {
    return error.code;
  }
  return undefined;
}
