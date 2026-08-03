import { parseArgs } from 'node:util';

import {
  runDatabaseCommand,
  type DatabaseCommand,
} from './database-command.js';
import { formatHelp } from './output.js';
import { runCollect } from './collect-command.js';
import { runProcess } from './process-command.js';
import { runRecommend } from './recommend-command.js';
import { runFullPipelineCommand } from './run-command.js';
import { runServe } from './serve-command.js';
import { runSourcesCheck } from './sources-check-command.js';
import {
  runSourceIntelligence,
  type SourceIntelligenceCommand,
} from './source-intelligence-command.js';
import {
  type CommandOutput,
  runValidateConfig,
} from './validate-config-command.js';

export async function runCli(
  args: readonly string[],
  output: CommandOutput,
  signal: AbortSignal = new AbortController().signal,
): Promise<number> {
  try {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        'config-dir': { type: 'string' },
        examples: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        source: { type: 'string', multiple: true, default: [] },
        type: { type: 'string' },
        url: { type: 'string' },
        company: { type: 'string' },
        concurrency: { type: 'string', default: '3' },
        limit: { type: 'string' },
        'processing-limit': { type: 'string', default: '1000' },
        host: { type: 'string', default: '127.0.0.1' },
        port: { type: 'string', default: '3000' },
        verbose: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });

    if (parsed.values.help || parsed.positionals[0] === undefined) {
      output.writeStdout(`${formatHelp()}\n`);
      return 0;
    }

    const command = parsed.positionals[0];
    const sourceIntelligence = isSourceIntelligenceCommand(command);
    if (
      parsed.positionals.length !== 1 &&
      !(command === 'discover-company' && parsed.positionals.length === 2)
    ) {
      output.writeStderr(
        `Unknown command. Run "npm run cli -- --help" for usage.\n`,
      );
      return 2;
    }

    if (sourceIntelligence)
      return runSourceIntelligence(
        command,
        {
          configDirectory: parsed.values['config-dir'] ?? 'config',
          ...((parsed.values.url ?? parsed.positionals[1]) === undefined
            ? {}
            : { url: parsed.values.url ?? parsed.positionals[1] }),
          ...(parsed.values.company === undefined
            ? {}
            : { companyId: parsed.values.company }),
          asJson: parsed.values.json,
          verbose: parsed.values.verbose,
          signal,
        },
        output,
      );

    if (isDatabaseCommand(command)) {
      return runDatabaseCommand(command, output);
    }

    if (command === 'collect') {
      return runCollect(
        {
          configDirectory: parsed.values['config-dir'] ?? 'config',
          sourceIds: parsed.values.source,
          ...(parsed.values.type === undefined
            ? {}
            : { sourceType: parsed.values.type }),
          concurrency: Number(parsed.values.concurrency),
          verbose: parsed.values.verbose,
          asJson: parsed.values.json,
          signal,
        },
        output,
      );
    }

    if (command === 'process') {
      return runProcess(
        {
          configDirectory: parsed.values['config-dir'] ?? 'config',
          limit: Number(parsed.values.limit ?? '1000'),
          verbose: parsed.values.verbose,
          asJson: parsed.values.json,
          signal,
        },
        output,
      );
    }

    if (command === 'recommend') {
      return runRecommend(
        {
          configDirectory: parsed.values['config-dir'] ?? 'config',
          limit: Number(parsed.values.limit ?? '20'),
          asJson: parsed.values.json,
          signal,
        },
        output,
      );
    }

    if (command === 'run') {
      return runFullPipelineCommand(
        {
          configDirectory: parsed.values['config-dir'] ?? 'config',
          concurrency: Number(parsed.values.concurrency),
          processingLimit: Number(parsed.values['processing-limit']),
          ...(parsed.values.limit === undefined
            ? {}
            : { recommendationLimit: Number(parsed.values.limit) }),
          verbose: parsed.values.verbose,
          asJson: parsed.values.json,
          signal,
        },
        output,
      );
    }

    if (command === 'serve') {
      return runServe(
        {
          configDirectory: parsed.values['config-dir'] ?? 'config',
          host: parsed.values.host,
          port: Number(parsed.values.port),
          concurrency: Number(parsed.values.concurrency),
          processingLimit: Number(parsed.values['processing-limit']),
          verbose: parsed.values.verbose,
          signal,
        },
        output,
      );
    }

    if (command === 'sources:check') {
      return runSourcesCheck(
        {
          configDirectory: parsed.values['config-dir'] ?? 'config',
          useExamples: parsed.values.examples,
          asJson: parsed.values.json,
        },
        output,
      );
    }

    if (command !== 'validate-config') {
      output.writeStderr(
        `Unknown command. Run "npm run cli -- --help" for usage.\n`,
      );
      return 2;
    }

    return runValidateConfig(
      {
        configDirectory: parsed.values['config-dir'] ?? 'config',
        useExamples: parsed.values.examples,
        asJson: parsed.values.json,
      },
      output,
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Invalid CLI arguments.';
    output.writeStderr(`${message}\n`);
    return 2;
  }
}

function isSourceIntelligenceCommand(
  command: string,
): command is SourceIntelligenceCommand {
  return [
    'discover-company',
    'discover-all',
    'show-providers',
    'show-company',
    'show-discovery',
    'health',
    'coverage',
  ].includes(command);
}

function isDatabaseCommand(command: string): command is DatabaseCommand {
  return (
    command === 'db:check' ||
    command === 'db:migrate' ||
    command === 'db:status'
  );
}
