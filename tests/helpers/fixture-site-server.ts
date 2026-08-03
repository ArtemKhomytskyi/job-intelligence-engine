import { createServer, type Server } from 'node:http';
import { once } from 'node:events';

export interface FixtureResponse {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly delayMs?: number;
}

export class FixtureSiteServer {
  private server: Server | undefined;
  private originValue: string | undefined;
  private readonly requests: {
    readonly method: string;
    readonly url: string;
    readonly host?: string;
  }[] = [];
  public constructor(
    private readonly routes: Readonly<Record<string, FixtureResponse>>,
  ) {}

  public async start(): Promise<string> {
    const server = createServer((request, response) => {
      this.requests.push({
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        ...(request.headers.host === undefined
          ? {}
          : { host: request.headers.host }),
      });
      const route = this.routes[request.url ?? '/'];
      if (route === undefined) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      const send = (): void => {
        if (response.destroyed) return;
        response.writeHead(route.status ?? 200, {
          'content-type': 'text/html; charset=utf-8',
          ...(route.headers ?? {}),
        });
        response.end(route.body ?? '');
      };
      if (route.delayMs === undefined) send();
      else setTimeout(send, route.delayMs);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Fixture server did not expose a TCP address.');
    this.server = server;
    this.originValue = `http://127.0.0.1:${address.port}`;
    return this.originValue;
  }

  public getRequests(): readonly {
    readonly method: string;
    readonly url: string;
    readonly host?: string;
  }[] {
    return [...this.requests];
  }

  public async close(): Promise<void> {
    if (this.server === undefined) return;
    this.server.close();
    await once(this.server, 'close');
    this.server = undefined;
  }
}
