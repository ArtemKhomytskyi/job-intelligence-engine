import { request as requestHttp, type RequestOptions } from 'node:http';
import { request as requestHttps } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

import type { ValidatedConnectionTarget } from './public-url-safety-validator.js';

export interface ConnectionBoundTransportRequest {
  readonly target: ValidatedConnectionTarget;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}

export interface ConnectionBoundTransportResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: AsyncIterable<Uint8Array>;
  cancel(): void;
}

export interface ConnectionBoundTransport {
  request(
    request: ConnectionBoundTransportRequest,
  ): Promise<ConnectionBoundTransportResponse>;
}

export class NodeConnectionBoundTransport implements ConnectionBoundTransport {
  public constructor(private readonly tlsCa?: string) {}

  public request(
    input: ConnectionBoundTransportRequest,
  ): Promise<ConnectionBoundTransportResponse> {
    const url = new URL(input.target.url);
    const requestImplementation =
      url.protocol === 'https:' ? requestHttps : requestHttp;
    const options = buildConnectionBoundRequestOptions(input, this.tlsCa);
    return new Promise((resolve, reject) => {
      const request = requestImplementation(options, (response) => {
        resolve({
          status: response.statusCode ?? 0,
          headers: normalizeHeaders(response.headers),
          body: response,
          cancel: () => response.destroy(),
        });
      });
      request.once('error', reject);
      request.end();
    });
  }
}

export function buildConnectionBoundRequestOptions(
  input: ConnectionBoundTransportRequest,
  tlsCa?: string,
): RequestOptions {
  const url = new URL(input.target.url);
  if (normalizeLookupHostname(url.hostname) !== input.target.hostname)
    throw new Error('Connection target hostname does not match its URL.');
  const tlsServername =
    isIP(input.target.hostname) === 0 ? input.target.hostname : undefined;
  return {
    protocol: url.protocol,
    hostname: input.target.hostname,
    port: url.port.length === 0 ? undefined : Number(url.port),
    method: 'GET',
    path: `${url.pathname}${url.search}`,
    headers: {
      ...input.headers,
      host: url.host,
    },
    agent: false,
    signal: input.signal,
    lookup: pinnedLookup(input.target),
    ...(tlsServername === undefined ? {} : { servername: tlsServername }),
    ...(tlsCa === undefined ? {} : { ca: tlsCa }),
  };
}

function pinnedLookup(target: ValidatedConnectionTarget): LookupFunction {
  return (hostname, options, callback) => {
    if (normalizeLookupHostname(hostname) !== target.hostname) {
      const error = new Error(
        'Pinned lookup rejected an unexpected hostname.',
      ) as NodeJS.ErrnoException;
      error.code = 'EACCES';
      callback(error, '', 0);
      return;
    }
    if (options.all) {
      callback(null, [{ address: target.address, family: target.family }]);
      return;
    }
    callback(null, target.address, target.family);
  };
}

function normalizeLookupHostname(value: string): string {
  const unwrapped =
    value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
  return unwrapped.toLocaleLowerCase('en-US').replace(/\.+$/u, '');
}

function normalizeHeaders(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLocaleLowerCase('en-US'),
      Array.isArray(value) ? value[0] : value,
    ]),
  );
}
