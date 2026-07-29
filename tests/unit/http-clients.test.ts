import { describe, expect, it, vi } from 'vitest';
import {
  CollectionError,
  type Clock,
  type HttpClient,
  type Logger,
  type Sleeper,
} from '../../src/application/index.js';
import {
  NodeFetchHttpClient,
  RateLimitedHttpClient,
  RetryingHttpClient,
} from '../../src/infrastructure/index.js';

const signal = new AbortController().signal;
const request = {
  url: 'https://example.test/jobs?token=secret',
  timeoutMs: 1000,
  signal,
  rateLimitKey: 'source',
  minimumIntervalMs: 100,
};
const decoder = { decode: (value: unknown) => value };
const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

describe('HTTP clients', () => {
  it('decodes JSON and classifies server responses without query leakage', async () => {
    const client = new NodeFetchHttpClient(() =>
      Promise.resolve(
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(client.getJson(request, decoder)).resolves.toMatchObject({
      data: { ok: true },
      attempts: 1,
    });
    const failing = new NodeFetchHttpClient(() =>
      Promise.resolve(new Response('{}', { status: 503 })),
    );
    await expect(failing.getJson(request, decoder)).rejects.toMatchObject({
      code: 'HTTP_SERVER_ERROR',
      context: { endpoint: 'https://example.test/jobs', retryable: true },
    });
    for (const [status, code] of [
      [404, 'HTTP_CLIENT_ERROR'],
      [429, 'HTTP_RATE_LIMITED'],
    ] as const) {
      const statusClient = new NodeFetchHttpClient(() =>
        Promise.resolve(new Response('{}', { status })),
      );
      await expect(
        statusClient.getJson(request, decoder),
      ).rejects.toMatchObject({ code });
    }
    const invalid = new NodeFetchHttpClient(() =>
      Promise.resolve(new Response('{')),
    );
    await expect(invalid.getJson(request, decoder)).rejects.toMatchObject({
      code: 'HTTP_INVALID_JSON',
    });
    const oversized = new NodeFetchHttpClient(() =>
      Promise.resolve(
        new Response('{}', { headers: { 'content-length': '6000000' } }),
      ),
    );
    await expect(oversized.getJson(request, decoder)).rejects.toMatchObject({
      code: 'HTTP_RESPONSE_INVALID',
    });
    await expect(
      new NodeFetchHttpClient().getJson(
        { ...request, url: 'http://example.test' },
        decoder,
      ),
    ).rejects.toMatchObject({ code: 'URL_UNSAFE' });
  });

  it('maps timeout and caller cancellation separately', async () => {
    vi.useFakeTimers();
    const hanging = new NodeFetchHttpClient(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          ),
        ),
    );
    const timeoutAssertion = expect(
      hanging.getJson({ ...request, timeoutMs: 10 }, decoder),
    ).rejects.toMatchObject({ code: 'HTTP_TIMEOUT' });
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);
    await timeoutAssertion;
    const controller = new AbortController();
    const cancelled = hanging.getJson(
      { ...request, signal: controller.signal },
      decoder,
    );
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({
      code: 'COLLECTION_ABORTED',
    });
    vi.useRealTimers();
  });

  it('bounds redirects and detects redirect loops', async () => {
    const redirecting = new NodeFetchHttpClient((url) => {
      const value =
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      return Promise.resolve(
        new Response('', {
          status: 302,
          headers: { location: value.endsWith('/one') ? '/two' : '/one' },
        }),
      );
    });
    await expect(
      redirecting.getText({
        ...request,
        url: 'https://example.test/one',
        maximumRedirects: 5,
      }),
    ).rejects.toMatchObject({ code: 'REDIRECT_LOOP' });
    await expect(
      redirecting.getText({
        ...request,
        url: 'https://example.test/one',
        maximumRedirects: 0,
      }),
    ).rejects.toMatchObject({ code: 'REDIRECT_LIMIT_EXCEEDED' });
    const missingLocation = new NodeFetchHttpClient(() =>
      Promise.resolve(new Response('', { status: 302 })),
    );
    await expect(missingLocation.getText(request)).rejects.toMatchObject({
      code: 'HTTP_RESPONSE_INVALID',
    });
  });

  it('retries only retryable failures', async () => {
    let calls = 0;
    const delegate: HttpClient = {
      getText: () => Promise.reject(new Error('not used')),
      getJson(_request, responseDecoder) {
        calls += 1;
        if (calls < 3)
          return Promise.reject(
            new CollectionError('HTTP_NETWORK_ERROR', 'temporary', {
              retryable: true,
            }),
          );
        return Promise.resolve({
          data: responseDecoder.decode(1),
          status: 200,
          attempts: 1,
        });
      },
    };
    const sleeper: Sleeper = { async sleep() {} };
    await expect(
      new RetryingHttpClient(delegate, sleeper, logger).getJson(request, {
        decode: () => 1,
      }),
    ).resolves.toMatchObject({ data: 1, attempts: 3 });
    const permanent: HttpClient = {
      getText: () => Promise.reject(new Error('not used')),
      getJson: () =>
        Promise.reject(
          new CollectionError('HTTP_CLIENT_ERROR', 'permanent', {
            retryable: false,
          }),
        ),
    };
    await expect(
      new RetryingHttpClient(permanent, sleeper, logger).getJson(
        request,
        decoder,
      ),
    ).rejects.toMatchObject({ code: 'HTTP_CLIENT_ERROR' });
  });

  it('enforces a minimum interval for the same source', async () => {
    let now = 0;
    const waits: number[] = [];
    const clock: Clock = { now: () => new Date(now) };
    const sleeper: Sleeper = {
      sleep(delay) {
        waits.push(delay);
        now += delay;
        return Promise.resolve();
      },
    };
    const delegate: HttpClient = {
      getText: () => Promise.reject(new Error('not used')),
      getJson(_request, responseDecoder) {
        return Promise.resolve({
          data: responseDecoder.decode(true),
          status: 200,
          attempts: 1,
        });
      },
    };
    const client = new RateLimitedHttpClient(delegate, clock, sleeper);
    await client.getJson(request, { decode: () => true });
    await client.getJson(request, { decode: () => true });
    expect(waits).toEqual([100]);
  });
});
