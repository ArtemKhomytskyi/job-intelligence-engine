import type {
  HttpClient,
  HttpRequest,
  HttpJsonResponse,
  JsonDecoder,
} from '../../application/index.js';
import { CollectionError } from '../../application/index.js';

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export class NodeFetchHttpClient implements HttpClient {
  public constructor(
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  public async getJson<T>(
    request: HttpRequest,
    decoder: JsonDecoder<T>,
  ): Promise<HttpJsonResponse<T>> {
    const endpoint = safeEndpoint(request.url);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, request.timeoutMs);
    const cancel = (): void => controller.abort();
    request.signal.addEventListener('abort', cancel, { once: true });
    try {
      const response = await this.fetchImplementation(request.url, {
        method: 'GET',
        headers: { accept: 'application/json', ...request.headers },
        redirect: 'follow',
        signal: controller.signal,
      });
      validatePublicUrl(response.url || request.url);
      if (!response.ok) throw statusError(response.status, endpoint);
      const declaredLength = Number(response.headers.get('content-length'));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_RESPONSE_BYTES
      ) {
        throw new CollectionError(
          'HTTP_RESPONSE_INVALID',
          'HTTP response exceeded the size limit.',
          { endpoint, retryable: false },
        );
      }
      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
        throw new CollectionError(
          'HTTP_RESPONSE_INVALID',
          'HTTP response exceeded the size limit.',
          { endpoint, retryable: false },
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch (cause: unknown) {
        throw new CollectionError(
          'HTTP_INVALID_JSON',
          'HTTP response was not valid JSON.',
          { endpoint, retryable: false },
          { cause },
        );
      }
      return {
        data: decoder.decode(parsed),
        status: response.status,
        attempts: 1,
      };
    } catch (cause: unknown) {
      if (cause instanceof CollectionError) throw cause;
      if (request.signal.aborted)
        throw new CollectionError(
          'COLLECTION_ABORTED',
          'Collection was cancelled.',
          { endpoint, retryable: false },
          { cause },
        );
      if (controller.signal.aborted)
        throw new CollectionError(
          'HTTP_TIMEOUT',
          'HTTP request timed out.',
          { endpoint, retryable: true },
          { cause },
        );
      throw new CollectionError(
        'HTTP_NETWORK_ERROR',
        'HTTP request failed.',
        { endpoint, retryable: true },
        { cause },
      );
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', cancel);
    }
  }
}

function safeEndpoint(value: string): string {
  const url = new URL(value);
  validatePublicUrl(url.toString());
  return `${url.origin}${url.pathname}`;
}

function validatePublicUrl(value: string): void {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new CollectionError(
      'HTTP_CLIENT_ERROR',
      'HTTP endpoint must use HTTPS.',
      { endpoint: `${url.origin}${url.pathname}`, retryable: false },
    );
  }
  if (url.username || url.password)
    throw new CollectionError(
      'HTTP_CLIENT_ERROR',
      'HTTP endpoint must not contain credentials.',
      { retryable: false },
    );
}

function statusError(status: number, endpoint: string): CollectionError {
  const code =
    status === 429
      ? 'HTTP_RATE_LIMITED'
      : status >= 500
        ? 'HTTP_SERVER_ERROR'
        : 'HTTP_CLIENT_ERROR';
  return new CollectionError(code, `HTTP request returned status ${status}.`, {
    endpoint,
    httpStatus: status,
    retryable: status === 408 || status === 429 || status >= 500,
  });
}
