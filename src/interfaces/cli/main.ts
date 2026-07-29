import { runCli } from './run-cli.js';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
const exitCode = await runCli(
  process.argv.slice(2),
  {
    writeStdout: (value) => process.stdout.write(value),
    writeStderr: (value) => process.stderr.write(value),
  },
  controller.signal,
);

process.exitCode = exitCode;
