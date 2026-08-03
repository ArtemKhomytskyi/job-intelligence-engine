import { NodeLocalServer, StreamLogger } from '../../infrastructure/index.js';
import { ConfigurationError } from '../../application/index.js';
import {
  createLocalRuntime,
  type LocalRuntime,
} from '../composition/local-runtime.js';
import { createLocalReportHandler } from '../web/local-report-handler.js';
import type { CommandOutput } from './validate-config-command.js';

export interface ServeCommandOptions {
  readonly configDirectory: string;
  readonly host: string;
  readonly port: number;
  readonly concurrency: number;
  readonly processingLimit: number;
  readonly verbose: boolean;
  readonly signal: AbortSignal;
}

export async function runServe(
  options: ServeCommandOptions,
  output: CommandOutput,
  runtimeFactory: (
    options: Parameters<typeof createLocalRuntime>[0],
  ) => LocalRuntime = createLocalRuntime,
): Promise<number> {
  let runtime: LocalRuntime | undefined;
  let server: NodeLocalServer | undefined;
  const logger = new StreamLogger(output.writeStderr, options.verbose);
  try {
    validateServerOptions(options);
    runtime = runtimeFactory({
      configDirectory: options.configDirectory,
      logger,
    });
    const sourceReadiness = await runtime.inspectSourceReadiness();
    await runtime.health.check();
    server = new NodeLocalServer(
      createLocalReportHandler({
        runtime,
        logger,
        pipelineSignal: options.signal,
        collectionConcurrency: options.concurrency,
        processingLimit: options.processingLimit,
        sourceReadiness,
      }),
    );
    const address = await server.start(options.host, options.port);
    logger.info('local_server_started', {
      host: address.host,
      port: address.port,
    });
    output.writeStdout(`JIE local report available at ${address.url}\n`);
    await waitForAbort(options.signal);
    return 0;
  } catch (error: unknown) {
    output.writeStderr(
      `${error instanceof Error ? error.message : 'The local report could not be started.'}\n`,
    );
    return error instanceof RangeError || error instanceof ConfigurationError
      ? 2
      : 3;
  } finally {
    if (server !== undefined) {
      try {
        await server.close();
        logger.info('local_server_stopped');
      } catch (error: unknown) {
        logger.error('local_server_stop_failed', {
          errorCode: error instanceof Error ? error.name : 'SERVER_ERROR',
        });
      }
    }
    if (runtime !== undefined) await runtime.close();
  }
}

export function validateServerOptions(
  options: Pick<
    ServeCommandOptions,
    'host' | 'port' | 'concurrency' | 'processingLimit'
  >,
): void {
  if (options.host !== '127.0.0.1')
    throw new RangeError('V1 serve host must be 127.0.0.1.');
  if (
    !Number.isInteger(options.port) ||
    options.port < 1 ||
    options.port > 65_535
  )
    throw new RangeError('Port must be an integer from 1 through 65535.');
  if (
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 8
  )
    throw new RangeError(
      'Collection concurrency must be an integer from 1 through 8.',
    );
  if (
    !Number.isInteger(options.processingLimit) ||
    options.processingLimit < 1 ||
    options.processingLimit > 10_000
  )
    throw new RangeError(
      'Processing limit must be an integer from 1 through 10000.',
    );
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener('abort', () => resolve(), { once: true }),
  );
}
