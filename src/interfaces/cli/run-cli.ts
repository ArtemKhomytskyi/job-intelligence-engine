import { parseArgs } from 'node:util';

import {
  runDatabaseCommand,
  type DatabaseCommand,
} from './database-command.js';
import { formatHelp } from './output.js';
import { runCollect } from './collect-command.js';
import { runProcess } from './process-command.js';
import { runRecommend } from './recommend-command.js';
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
        concurrency: { type: 'string', default: '3' },
        limit: { type: 'string' },
        verbose: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });

    if (parsed.values.help || parsed.positionals[0] === undefined) {
      output.writeStdout(`${formatHelp()}\n`);
      return 0;
    }

    const command = parsed.positionals[0];
    if (parsed.positionals.length !== 1) {
      output.writeStderr(
        `Unknown command. Run "npm run cli -- --help" for usage.\n`,
      );
      return 2;
    }

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

function isDatabaseCommand(command: string): command is DatabaseCommand {
  return (
    command === 'db:check' ||
    command === 'db:migrate' ||
    command === 'db:status'
  );
}
