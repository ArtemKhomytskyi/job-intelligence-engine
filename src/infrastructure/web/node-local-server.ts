import { createServer, type RequestListener, type Server } from 'node:http';

export interface LocalServerAddress {
  readonly host: string;
  readonly port: number;
  readonly url: string;
}

export class LocalServerError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LocalServerError';
  }
}

export class NodeLocalServer {
  private server: Server | undefined;
  private address: LocalServerAddress | undefined;

  public constructor(private readonly listener: RequestListener) {}

  public async start(host: string, port: number): Promise<LocalServerAddress> {
    if (this.server !== undefined)
      throw new LocalServerError('The local server is already running.');
    const server = createServer(this.listener);
    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;
    server.keepAliveTimeout = 5_000;
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => reject(error);
        server.once('error', onError);
        server.listen({ host, port, exclusive: true }, () => {
          server.off('error', onError);
          resolve();
        });
      });
    } catch (cause: unknown) {
      server.close();
      const code = isErrorWithCode(cause) ? cause.code : undefined;
      throw new LocalServerError(
        code === 'EADDRINUSE'
          ? `Port ${port} is already in use on ${host}.`
          : 'The local report server could not be started.',
        { cause },
      );
    }
    const bound = server.address();
    if (bound === null || typeof bound === 'string') {
      server.close();
      throw new LocalServerError(
        'The local server did not return a TCP address.',
      );
    }
    this.server = server;
    this.address = {
      host,
      port: bound.port,
      url: `http://${host}:${bound.port}`,
    };
    return this.address;
  }

  public getAddress(): LocalServerAddress | undefined {
    return this.address;
  }

  public async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.address = undefined;
    if (server === undefined) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      );
      server.closeIdleConnections();
    });
  }
}

function isErrorWithCode(
  value: unknown,
): value is Error & { readonly code: string } {
  return (
    value instanceof Error && 'code' in value && typeof value.code === 'string'
  );
}
