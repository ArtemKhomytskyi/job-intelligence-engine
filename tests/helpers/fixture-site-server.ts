import { createServer, type Server } from 'node:http';
import { once } from 'node:events';

export interface FixtureResponse {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export class FixtureSiteServer {
  private server: Server | undefined;
  private originValue: string | undefined;
  public constructor(
    private readonly routes: Readonly<Record<string, FixtureResponse>>,
  ) {}

  public async start(): Promise<string> {
    const server = createServer((request, response) => {
      const route = this.routes[request.url ?? '/'];
      if (route === undefined) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      response.writeHead(route.status ?? 200, {
        'content-type': 'text/html; charset=utf-8',
        ...(route.headers ?? {}),
      });
      response.end(route.body ?? '');
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

  public async close(): Promise<void> {
    if (this.server === undefined) return;
    this.server.close();
    await once(this.server, 'close');
    this.server = undefined;
  }
}
