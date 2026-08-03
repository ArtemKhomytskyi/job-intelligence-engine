import {
  ConfigurationError,
  loadConfiguration,
} from '../../application/index.js';
import {
  inspectSourceReadiness,
  type SourceReadinessReport,
} from '../../domain/index.js';
import {
  FileSystemConfigReader,
  ZodYamlConfigurationDecoder,
} from '../../infrastructure/index.js';
import type { CommandOutput } from './validate-config-command.js';

export interface SourcesCheckOptions {
  readonly configDirectory: string;
  readonly useExamples: boolean;
  readonly asJson: boolean;
}

export async function runSourcesCheck(
  options: SourcesCheckOptions,
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
        validationMode: 'inspection',
      },
    );
    const report = inspectSourceReadiness(bundle.sources);
    output.writeStdout(`${formatSourceReadiness(report, options.asJson)}\n`);
    return report.hasRealEnabledSource ? 0 : 1;
  } catch (error: unknown) {
    output.writeStderr(
      `${error instanceof ConfigurationError ? error.message : 'Source readiness could not be inspected.'}\n`,
    );
    return 2;
  }
}

export function formatSourceReadiness(
  report: SourceReadinessReport,
  asJson: boolean,
): string {
  if (asJson) return JSON.stringify(report, undefined, 2);
  const lines = report.sources.map(
    (source) =>
      `- ${source.id} | ${source.type} | ${source.enabled ? 'enabled' : 'disabled'} | ${source.classification.toLocaleLowerCase('en-US')} | ${source.configurationReady ? 'ready' : source.reasons.join(', ')}`,
  );
  return [
    report.hasRealEnabledSource
      ? 'Source configuration ready'
      : 'No real enabled job sources configured',
    ...lines,
    '',
    'This check performs no network requests.',
  ].join('\n');
}
