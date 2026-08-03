import {
  CollectionError,
  type HttpClient,
  type HttpJsonResponse,
  type HttpRequest,
  type HttpTextResponse,
  type JsonDecoder,
} from '../../application/index.js';
import {
  NodeConnectionBoundTransport,
  type ConnectionBoundTransport,
  type ConnectionBoundTransportResponse,
} from './node-connection-bound-transport.js';
import {
  PublicUrlSafetyValidator,
  type ConnectionBoundUrlValidator,
} from './public-url-safety-validator.js';

const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

export class NodeFetchHttpClient implements HttpClient {
  public constructor(
    private readonly urlValidator: ConnectionBoundUrlValidator = new PublicUrlSafetyValidator(),
    private readonly transport: ConnectionBoundTransport = new NodeConnectionBoundTransport(),
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
    let currentTarget = await this.urlValidator.resolveForConnection(
      request.url,
      allowLoopback,
    );
    if (request.signal.aborted) throw cancelled(currentTarget.url);

    const endpoint = safeEndpoint(currentTarget.url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
    const caller = { cancelled: false };
    const cancel = (): void => {
      caller.cancelled = true;
      controller.abort();
    };
    request.signal.addEventListener('abort', cancel, { once: true });
    const visited = new Set<string>();
    let redirectCount = 0;
    let activeResponse: ConnectionBoundTransportResponse | undefined;
    try {
      for (;;) {
        if (visited.has(currentTarget.url))
          throw new CollectionError(
            'REDIRECT_LOOP',
            'HTTP redirect loop detected.',
            {
              endpoint: safeEndpoint(currentTarget.url),
              retryable: false,
            },
          );
        visited.add(currentTarget.url);
        activeResponse = await this.transport.request({
          target: currentTarget,
          headers: requestHeaders(request.headers),
          signal: controller.signal,
        });
        if (isRedirect(activeResponse.status)) {
          const location = activeResponse.headers['location'];
          activeResponse.cancel();
          activeResponse = undefined;
          if (location === undefined)
            throw new CollectionError(
              'HTTP_RESPONSE_INVALID',
              'Redirect response omitted its target.',
              { endpoint: safeEndpoint(currentTarget.url), retryable: false },
            );
          if (
            redirectCount >= (request.maximumRedirects ?? DEFAULT_MAX_REDIRECTS)
          )
            throw new CollectionError(
              'REDIRECT_LIMIT_EXCEEDED',
              'HTTP redirect limit was exceeded.',
              { endpoint: safeEndpoint(currentTarget.url), retryable: false },
            );
          currentTarget = await this.urlValidator.resolveForConnection(
            new URL(location, currentTarget.url).toString(),
            allowLoopback,
          );
          redirectCount += 1;
          continue;
        }

        const finalUrl = currentTarget.url;
        if (activeResponse.status < 200 || activeResponse.status >= 300) {
          const status = activeResponse.status;
          activeResponse.cancel();
          activeResponse = undefined;
          throw statusError(status, safeEndpoint(finalUrl));
        }
        const maximumBytes =
          request.maximumResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
        const declaredLength = Number(activeResponse.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
          activeResponse.cancel();
          activeResponse = undefined;
          throw tooLarge(finalUrl);
        }
        const encoding = activeResponse.headers['content-encoding'];
        if (
          encoding !== undefined &&
          encoding.trim().length > 0 &&
          encoding.toLocaleLowerCase('en-US') !== 'identity'
        ) {
          activeResponse.cancel();
          activeResponse = undefined;
          throw new CollectionError(
            'HTTP_CONTENT_ENCODING_UNSUPPORTED',
            'Encoded HTTP responses are not accepted by the bounded transport.',
            { endpoint: safeEndpoint(finalUrl), retryable: false },
          );
        }
        const status = activeResponse.status;
        let data: string;
        try {
          data = await readBoundedText(activeResponse, maximumBytes, finalUrl);
        } catch (cause: unknown) {
          activeResponse.cancel();
          activeResponse = undefined;
          throw cause;
        }
        activeResponse = undefined;
        return {
          data,
          status,
          attempts: 1,
          finalUrl,
          redirectCount,
        };
      }
    } catch (cause: unknown) {
      if (cause instanceof CollectionError) throw cause;
      if (caller.cancelled) throw cancelled(currentTarget.url, cause);
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

function requestHeaders(
  provided: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  const headers = Object.fromEntries(
    Object.entries(provided ?? {}).filter(
      ([name]) =>
        !['host', 'connection', 'content-length', 'transfer-encoding'].includes(
          name.toLocaleLowerCase('en-US'),
        ),
    ),
  );
  return {
    accept: 'text/html,application/xhtml+xml,application/json',
    ...headers,
    'accept-encoding': 'identity',
  };
}

async function readBoundedText(
  response: ConnectionBoundTransportResponse,
  maximumBytes: number,
  finalUrl: string,
): Promise<string> {
  const bytes = new Uint8Array(maximumBytes);
  let totalBytes = 0;
  for await (const chunk of response.body) {
    if (totalBytes + chunk.byteLength > maximumBytes) {
      response.cancel();
      throw tooLarge(finalUrl);
    }
    bytes.set(chunk, totalBytes);
    totalBytes += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes.subarray(0, totalBytes));
}

function cancelled(url: string, cause?: unknown): CollectionError {
  return new CollectionError(
    'COLLECTION_ABORTED',
    'Collection was cancelled.',
    { endpoint: safeEndpoint(url), retryable: false },
    cause === undefined ? undefined : { cause },
  );
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
