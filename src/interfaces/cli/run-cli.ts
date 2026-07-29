import { parseArgs } from 'node:util';

import { formatHelp } from './output.js';
import {
  type CommandOutput,
  runValidateConfig,
} from './validate-config-command.js';

export async function runCli(
  args: readonly string[],
  output: CommandOutput,
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
        help: { type: 'boolean', short: 'h', default: false },
      },
    });

    if (parsed.values.help || parsed.positionals[0] === undefined) {
      output.writeStdout(`${formatHelp()}\n`);
      return 0;
    }

    if (
      parsed.positionals[0] !== 'validate-config' ||
      parsed.positionals.length !== 1
    ) {
      output.writeStderr(
        `Unknown command. Run "npm run cli -- validate-config --help" for usage.\n`,
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
