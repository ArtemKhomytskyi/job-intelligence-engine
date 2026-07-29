import {
  ConfigurationError,
  loadConfiguration,
  summarizeConfiguration,
} from '../../application/index.js';
import {
  FileSystemConfigReader,
  ZodYamlConfigurationDecoder,
} from '../../infrastructure/index.js';
import {
  formatConfigurationErrors,
  formatConfigurationSummary,
} from './output.js';

export interface CommandOutput {
  readonly writeStdout: (value: string) => void;
  readonly writeStderr: (value: string) => void;
}

export interface ValidateConfigOptions {
  readonly configDirectory: string;
  readonly useExamples: boolean;
  readonly asJson: boolean;
}

export async function runValidateConfig(
  options: ValidateConfigOptions,
  output: CommandOutput,
): Promise<number> {
  try {
    const bundle = await loadConfiguration(
      {
        reader: new FileSystemConfigReader(),
        decoder: new ZodYamlConfigurationDecoder(),
      },
      {
        directory: options.configDirectory,
        useExamples: options.useExamples,
      },
    );
    output.writeStdout(
      `${formatConfigurationSummary(summarizeConfiguration(bundle), options.asJson)}\n`,
    );
    return 0;
  } catch (error: unknown) {
    const issues =
      error instanceof ConfigurationError
        ? error.issues
        : [
            {
              code: 'CONFIG_INTERNAL_ERROR' as const,
              section: 'profile' as const,
              message:
                'Unexpected internal error while validating configuration.',
            },
          ];
    output.writeStderr(
      `${formatConfigurationErrors(issues, options.asJson)}\n`,
    );
    return 1;
  }
}
