import { describe, expect, it } from 'vitest';

import type { Logger, Sleeper } from '../../src/application/index.js';

import {
  NodeFetchHttpClient,
  PublicUrlSafetyValidator,
  RetryingHttpClient,
  buildConnectionBoundRequestOptions,
  type AddressResolver,
  type ConnectionBoundTransport,
  type ConnectionBoundTransportRequest,
  type ConnectionBoundTransportResponse,
  type ValidatedConnectionTarget,
} from '../../src/infrastructure/index.js';

const signal = new AbortController().signal;
const baseRequest = {
  url: 'https://SOURCE.SYNTHETIC.TEST./jobs',
  timeoutMs: 1_000,
  signal,
  rateLimitKey: 'source',
  minimumIntervalMs: 0,
};

describe('connection-bound source networking', () => {
  it('normalizes hostnames and selects a validated address deterministically', async () => {
    const resolvedHosts: string[] = [];
    const validator = new PublicUrlSafetyValidator({
      resolve(hostname) {
        resolvedHosts.push(hostname);
        return Promise.resolve([
          '2001:4860:4860::8888',
          '93.184.216.35',
          '93.184.216.34',
        ]);
      },
    });
    await expect(
      validator.resolveForConnection(baseRequest.url, false),
    ).resolves.toEqual({
      url: 'https://source.synthetic.test/jobs',
      hostname: 'source.synthetic.test',
      address: '93.184.216.34',
      family: 4,
    });
    expect(resolvedHosts).toEqual(['source.synthetic.test']);
  });

  it.each([
    [['93.184.216.34', '10.0.0.1']],
    [['93.184.216.34', '::1']],
    [['::ffff:7f00:1']],
    [['0:0:0:0:0:0:0:1']],
    [['10.0.0.1']],
  ])(
    'rejects the entire hostname when any answer is forbidden: %o',
    async (addresses) => {
      const validator = resolverReturning(addresses);
      await expect(
        validator.resolveForConnection(baseRequest.url, false),
      ).rejects.toMatchObject({ code: 'URL_UNSAFE' });
    },
  );

  it('fails closed on resolver failure, empty answers, and invalid final addresses', async () => {
    const failing = new PublicUrlSafetyValidator({
      resolve: () => Promise.reject(new Error('synthetic resolver failure')),
    });
    await expect(
      failing.resolveForConnection(baseRequest.url, false),
    ).rejects.toMatchObject({ code: 'DNS_RESOLUTION_FAILED' });
    for (const addresses of [[], ['not-an-address']])
      await expect(
        resolverReturning(addresses).resolveForConnection(
          baseRequest.url,
          false,
        ),
      ).rejects.toMatchObject({ code: 'DNS_RESOLUTION_FAILED' });
  });

  it('connects only to the address selected from the single policy resolution', async () => {
    let resolutions = 0;
    const validator = new PublicUrlSafetyValidator({
      resolve: () => {
        resolutions += 1;
        return Promise.resolve(
          resolutions === 1 ? ['93.184.216.34'] : ['127.0.0.1'],
        );
      },
    });
    const requests: ConnectionBoundTransportRequest[] = [];
    const client = new NodeFetchHttpClient(
      validator,
      recordingTransport(requests),
    );
    await expect(client.getText(baseRequest)).resolves.toMatchObject({
      data: 'ok',
    });
    expect(resolutions).toBe(1);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.target).toMatchObject({
      hostname: 'source.synthetic.test',
      address: '93.184.216.34',
    });
  });

  it('revalidates and binds each redirect hostname independently', async () => {
    const answers: Record<string, readonly string[]> = {
      'first.synthetic.test': ['93.184.216.34'],
      'second.synthetic.test': ['93.184.216.35'],
    };
    const resolver: AddressResolver = {
      resolve: (hostname) => Promise.resolve(answers[hostname] ?? []),
    };
    const requests: ConnectionBoundTransportRequest[] = [];
    const transport: ConnectionBoundTransport = {
      request(input) {
        requests.push(input);
        return Promise.resolve(
          input.target.hostname === 'first.synthetic.test'
            ? response('', 302, {
                location: 'https://second.synthetic.test/final',
              })
            : response('ok'),
        );
      },
    };
    const client = new NodeFetchHttpClient(
      new PublicUrlSafetyValidator(resolver),
      transport,
    );
    await expect(
      client.getText({
        ...baseRequest,
        url: 'https://first.synthetic.test/start',
      }),
    ).resolves.toMatchObject({
      finalUrl: 'https://second.synthetic.test/final',
    });
    expect(requests.map((item) => item.target.address)).toEqual([
      '93.184.216.34',
      '93.184.216.35',
    ]);
  });

  it('rejects a redirect target whose final resolver address is private', async () => {
    const client = new NodeFetchHttpClient(
      new PublicUrlSafetyValidator({
        resolve: (hostname) =>
          Promise.resolve(
            hostname === 'first.synthetic.test'
              ? ['93.184.216.34']
              : ['127.0.0.1'],
          ),
      }),
      {
        request: () =>
          Promise.resolve(
            response('', 302, {
              location: 'https://redirect.synthetic.test/private',
            }),
          ),
      },
    );
    await expect(
      client.getText({
        ...baseRequest,
        url: 'https://first.synthetic.test/start',
      }),
    ).rejects.toMatchObject({ code: 'URL_UNSAFE' });
  });

  it('revalidates retries and stops before transport when DNS changes to private', async () => {
    let resolutions = 0;
    let transportCalls = 0;
    const base = new NodeFetchHttpClient(
      new PublicUrlSafetyValidator({
        resolve: () => {
          resolutions += 1;
          return Promise.resolve(
            resolutions === 1 ? ['93.184.216.34'] : ['127.0.0.1'],
          );
        },
      }),
      {
        request: () => {
          transportCalls += 1;
          return Promise.reject(new Error('synthetic transient failure'));
        },
      },
    );
    const sleeper: Sleeper = { sleep: () => Promise.resolve() };
    const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
    const client = new RetryingHttpClient(base, sleeper, logger);
    await expect(client.getText(baseRequest)).rejects.toMatchObject({
      code: 'URL_UNSAFE',
      context: { attempts: 2 },
    });
    expect(resolutions).toBe(2);
    expect(transportCalls).toBe(1);
  });

  it('preserves original Host, TLS SNI, verification defaults, and disables reuse', () => {
    const target: ValidatedConnectionTarget = {
      url: 'https://source.synthetic.test:8443/jobs?q=1',
      hostname: 'source.synthetic.test',
      address: '93.184.216.34',
      family: 4,
    };
    const options = buildConnectionBoundRequestOptions({
      target,
      headers: { accept: 'application/json' },
      signal,
    });
    expect(options).toMatchObject({
      hostname: 'source.synthetic.test',
      servername: 'source.synthetic.test',
      port: 8443,
      path: '/jobs?q=1',
      agent: false,
      headers: {
        host: 'source.synthetic.test:8443',
        accept: 'application/json',
      },
    });
    expect(options).not.toHaveProperty('rejectUnauthorized');
    const lookup = options.lookup;
    if (lookup === undefined) throw new Error('Pinned lookup is required.');
    return new Promise<void>((resolve, reject) => {
      lookup('source.synthetic.test', {}, (error, address, family) => {
        try {
          expect(error).toBeNull();
          expect(address).toBe('93.184.216.34');
          expect(family).toBe(4);
          resolve();
        } catch (cause: unknown) {
          reject(
            cause instanceof Error ? cause : new Error('Assertion failed'),
          );
        }
      });
    });
  });

  it('prevents a pinned lookup from being reused for another hostname', () => {
    const options = buildConnectionBoundRequestOptions({
      target: {
        url: 'https://source.synthetic.test/jobs',
        hostname: 'source.synthetic.test',
        address: '93.184.216.34',
        family: 4,
      },
      headers: {},
      signal,
    });
    const lookup = options.lookup;
    if (lookup === undefined) throw new Error('Pinned lookup is required.');
    return new Promise<void>((resolve, reject) => {
      lookup('other.synthetic.test', {}, (error) => {
        try {
          expect(error).toMatchObject({ code: 'EACCES' });
          resolve();
        } catch (cause: unknown) {
          reject(
            cause instanceof Error ? cause : new Error('Assertion failed'),
          );
        }
      });
    });
  });
});

function resolverReturning(
  addresses: readonly string[],
): PublicUrlSafetyValidator {
  return new PublicUrlSafetyValidator({
    resolve: () => Promise.resolve(addresses),
  });
}

function recordingTransport(
  requests: ConnectionBoundTransportRequest[],
): ConnectionBoundTransport {
  return {
    request(input) {
      requests.push(input);
      return Promise.resolve(response('ok'));
    },
  };
}

function response(
  body: string,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): ConnectionBoundTransportResponse {
  return {
    status,
    headers,
    body: {
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield new TextEncoder().encode(body);
      },
    },
    cancel() {},
  };
}
