import {
  CollectionError,
  type HttpClient,
  type HttpJsonResponse,
  type HttpRequest,
  type HttpTextResponse,
  type JsonDecoder,
  type UrlSafetyValidator,
} from '../../application/index.js';

const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

export class NodeFetchHttpClient implements HttpClient {
  public constructor(
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly urlValidator: UrlSafetyValidator = new BasicUrlSafetyValidator(),
  ) {}

  public async getJson<T>(
    request: HttpRequest,
    decoder: JsonDecoder<T>,
  ): Promise<HttpJsonResponse<T>> {
    let response: HttpTextResponse;
    try {
      response = await this.getText({
        ...request,
        headers: { accept: 'application/json', ...request.headers },
      });
    } catch (cause: unknown) {
      if (
        cause instanceof CollectionError &&
        cause.code === 'HTML_RESPONSE_TOO_LARGE'
      )
        throw new CollectionError(
          'HTTP_RESPONSE_INVALID',
          cause.message,
          cause.context,
          { cause },
        );
      throw cause;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.data);
    } catch (cause: unknown) {
      throw new CollectionError(
        'HTTP_INVALID_JSON',
        'HTTP response was not valid JSON.',
        { endpoint: safeEndpoint(response.finalUrl), retryable: false },
        { cause },
      );
    }
    return { ...response, data: decoder.decode(parsed) };
  }

  public async getText(request: HttpRequest): Promise<HttpTextResponse> {
    const allowLoopback = request.allowTestLoopback ?? false;
    let currentUrl = await this.urlValidator.validate(
      request.url,
      allowLoopback,
    );
    if (request.signal.aborted)
      throw new CollectionError(
        'COLLECTION_ABORTED',
        'Collection was cancelled.',
        { endpoint: safeEndpoint(currentUrl), retryable: false },
      );
    const endpoint = safeEndpoint(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
    const cancel = (): void => controller.abort();
    request.signal.addEventListener('abort', cancel, { once: true });
    const visited = new Set<string>();
    let redirectCount = 0;
    try {
      for (;;) {
        if (visited.has(currentUrl))
          throw new CollectionError(
            'REDIRECT_LOOP',
            'HTTP redirect loop detected.',
            {
              endpoint: safeEndpoint(currentUrl),
              retryable: false,
            },
          );
        visited.add(currentUrl);
        const response = await this.fetchImplementation(currentUrl, {
          method: 'GET',
          headers: {
            accept: 'text/html,application/xhtml+xml,application/json',
            ...request.headers,
          },
          redirect: 'manual',
          signal: controller.signal,
        });
        if (isRedirect(response.status)) {
          const location = response.headers.get('location');
          if (location === null)
            throw new CollectionError(
              'HTTP_RESPONSE_INVALID',
              'Redirect response omitted its target.',
              { endpoint: safeEndpoint(currentUrl), retryable: false },
            );
          if (
            redirectCount >= (request.maximumRedirects ?? DEFAULT_MAX_REDIRECTS)
          )
            throw new CollectionError(
              'REDIRECT_LIMIT_EXCEEDED',
              'HTTP redirect limit was exceeded.',
              { endpoint: safeEndpoint(currentUrl), retryable: false },
            );
          currentUrl = await this.urlValidator.validate(
            new URL(location, currentUrl).toString(),
            allowLoopback,
          );
          redirectCount += 1;
          continue;
        }
        const finalUrl = await this.urlValidator.validate(
          response.url.length === 0 ? currentUrl : response.url,
          allowLoopback,
        );
        if (!response.ok)
          throw statusError(response.status, safeEndpoint(finalUrl));
        const maximumBytes =
          request.maximumResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
        const declaredLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
          throw tooLarge(finalUrl);
        const data = await response.text();
        if (new TextEncoder().encode(data).byteLength > maximumBytes)
          throw tooLarge(finalUrl);
        return {
          data,
          status: response.status,
          attempts: 1,
          finalUrl,
          redirectCount,
        };
      }
    } catch (cause: unknown) {
      if (cause instanceof CollectionError) throw cause;
      if (isSignalAborted(request.signal))
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

function isSignalAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

class BasicUrlSafetyValidator implements UrlSafetyValidator {
  public validate(value: string, allowTestLoopback: boolean): Promise<string> {
    let url: URL;
    try {
      url = new URL(value);
    } catch (cause: unknown) {
      return Promise.reject(
        new CollectionError(
          'URL_UNSAFE',
          'URL is malformed.',
          { retryable: false },
          { cause },
        ),
      );
    }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.protocol !== 'https:' &&
      !(allowTestLoopback && url.protocol === 'http:' && loopback)
    )
      return Promise.reject(
        new CollectionError('URL_UNSAFE', 'URL must use public HTTPS.', {
          endpoint: safeEndpoint(url.toString()),
          retryable: false,
        }),
      );
    if (url.username || url.password)
      return Promise.reject(
        new CollectionError('URL_UNSAFE', 'URL must not contain credentials.', {
          retryable: false,
        }),
      );
    url.hash = '';
    return Promise.resolve(url.toString());
  }
}

function safeEndpoint(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function tooLarge(url: string): CollectionError {
  return new CollectionError(
    'HTML_RESPONSE_TOO_LARGE',
    'HTTP response exceeded the size limit.',
    { endpoint: safeEndpoint(url), retryable: false },
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
