import {
  ATS_PROVIDERS,
  type ProviderDiscoveryResult,
} from '../../domain/index.js';
import { StreamLogger } from '../../infrastructure/index.js';
import { createLocalRuntime } from '../composition/local-runtime.js';
import type { LocalRuntime } from '../composition/local-runtime.js';
import type { CommandOutput } from './validate-config-command.js';

export type SourceIntelligenceCommand =
  | 'discover-company'
  | 'discover-all'
  | 'show-providers'
  | 'show-company'
  | 'show-discovery'
  | 'health'
  | 'coverage';

export interface SourceIntelligenceOptions {
  readonly configDirectory: string;
  readonly url?: string;
  readonly companyId?: string;
  readonly asJson: boolean;
  readonly verbose: boolean;
  readonly signal: AbortSignal;
}

type SourceIntelligenceRuntime = Pick<
  LocalRuntime,
  | 'discoverCompany'
  | 'discoverAll'
  | 'getCompanyHealth'
  | 'getCollectionHealth'
  | 'close'
>;

export type SourceIntelligenceRuntimeFactory = (
  options: Parameters<typeof createLocalRuntime>[0],
) => SourceIntelligenceRuntime;

export async function runSourceIntelligence(
  command: SourceIntelligenceCommand,
  options: SourceIntelligenceOptions,
  output: CommandOutput,
  runtimeFactory: SourceIntelligenceRuntimeFactory = createLocalRuntime,
): Promise<number> {
  if (command === 'show-providers') {
    output.writeStdout(
      `${options.asJson ? JSON.stringify(ATS_PROVIDERS, undefined, 2) : ATS_PROVIDERS.join('\n')}\n`,
    );
    return 0;
  }
  const runtime = runtimeFactory({
    configDirectory: options.configDirectory,
    logger: new StreamLogger(output.writeStderr, options.verbose),
  });
  try {
    if (command === 'discover-company') {
      if (options.url === undefined)
        throw new RangeError(
          'discover-company requires a URL argument or --url.',
        );
      if (runtime.discoverCompany === undefined)
        throw new Error('Company discovery is unavailable.');
      const result = await runtime.discoverCompany(options.url, options.signal);
      output.writeStdout(`${formatDiscovery(result, options.asJson)}\n`);
      return result.status === 'DISCOVERED' ? 0 : 1;
    }
    if (command === 'discover-all') {
      if (runtime.discoverAll === undefined)
        throw new Error('Company discovery is unavailable.');
      const results = await runtime.discoverAll(options.signal);
      output.writeStdout(
        `${options.asJson ? JSON.stringify(results, undefined, 2) : results.map((result) => formatDiscovery(result, false)).join('\n\n')}\n`,
      );
      return results.every((result) => result.status === 'DISCOVERED') ? 0 : 1;
    }
    if (command === 'show-company') {
      if (options.companyId === undefined)
        throw new RangeError('show-company requires --company <id>.');
      if (runtime.getCompanyHealth === undefined)
        throw new Error('Company health is unavailable.');
      const company = await runtime.getCompanyHealth(options.companyId);
      if (company === undefined) {
        output.writeStderr(`Company "${options.companyId}" was not found.\n`);
        return 1;
      }
      output.writeStdout(`${JSON.stringify(company, undefined, 2)}\n`);
      return 0;
    }
    if (runtime.getCollectionHealth === undefined)
      throw new Error('Collection health is unavailable.');
    const health = await runtime.getCollectionHealth();
    if (options.asJson || command === 'show-discovery')
      output.writeStdout(`${JSON.stringify(health, undefined, 2)}\n`);
    else if (command === 'coverage')
      output.writeStdout(`${formatCoverage(health.companies)}\n`);
    else
      output.writeStdout(
        [
          'Collection health',
          `Companies: ${health.companyCount}`,
          `Discovered: ${health.discoveredCompanyCount}`,
          `Unknown providers: ${health.unknownProviderCount}`,
          `Healthy: ${health.healthyCompanyCount}`,
          `Failed: ${health.failedCompanyCount}`,
          `Jobs in latest company crawls: ${health.totalJobs}`,
        ].join('\n') + '\n',
      );
    return 0;
  } catch (error: unknown) {
    output.writeStderr(
      `${error instanceof Error ? error.message : 'Source intelligence command failed.'}\n`,
    );
    return error instanceof RangeError ? 2 : 3;
  } finally {
    await runtime.close();
  }
}

function formatDiscovery(
  result: ProviderDiscoveryResult,
  asJson: boolean,
): string {
  if (asJson) return JSON.stringify(result, undefined, 2);
  return [
    `Company: ${result.companyName}`,
    `Provider: ${result.provider ?? 'UNKNOWN_PROVIDER'}`,
    `Collector: ${result.provider ?? 'none'}`,
    `Confidence: ${result.confidence}%`,
    `Method: ${result.method}`,
    ...(result.diagnostics.length === 0
      ? []
      : [`Diagnostics: ${result.diagnostics.join(' ')}`]),
  ].join('\n');
}

function formatCoverage(
  companies: readonly {
    readonly provider?: string;
    readonly jobCount: number;
  }[],
): string {
  const rows = new Map<string, { companies: number; jobs: number }>();
  for (const company of companies) {
    const provider = company.provider ?? 'UNKNOWN_PROVIDER';
    const row = rows.get(provider) ?? { companies: 0, jobs: 0 };
    rows.set(provider, {
      companies: row.companies + 1,
      jobs: row.jobs + company.jobCount,
    });
  }
  return [
    'Provider | Companies | Jobs',
    ...[...rows.entries()].map(
      ([provider, row]) => `${provider} | ${row.companies} | ${row.jobs}`,
    ),
  ].join('\n');
}
