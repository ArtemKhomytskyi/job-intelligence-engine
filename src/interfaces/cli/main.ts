import { runCli } from './run-cli.js';

const exitCode = await runCli(process.argv.slice(2), {
  writeStdout: (value) => process.stdout.write(value),
  writeStderr: (value) => process.stderr.write(value),
});

process.exitCode = exitCode;
