import {
  CollectionError,
  type HttpClient,
  type HttpJsonResponse,
  type HttpRequest,
  type HttpTextResponse,
  type JsonDecoder,
  type Logger,
  type Sleeper,
} from '../../application/index.js';

export class RetryingHttpClient implements HttpClient {
  public constructor(
    private readonly delegate: HttpClient,
    private readonly sleeper: Sleeper,
    private readonly logger: Logger,
    private readonly maxAttempts = 3,
    private readonly baseDelayMs = 100,
  ) {}

  public async getJson<T>(
    request: HttpRequest,
    decoder: JsonDecoder<T>,
  ): Promise<HttpJsonResponse<T>> {
    return this.retry(request, () => this.delegate.getJson(request, decoder));
  }

  public getText(request: HttpRequest): Promise<HttpTextResponse> {
    return this.retry(request, () => this.delegate.getText(request));
  }

  private async retry<T extends { readonly attempts: number }>(
    request: HttpRequest,
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: CollectionError | undefined;
    let attempts = 0;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      attempts = attempt;
      try {
        const response = await operation();
        return { ...response, attempts: attempt };
      } catch (cause: unknown) {
        const error =
          cause instanceof CollectionError
            ? cause
            : new CollectionError(
                'HTTP_NETWORK_ERROR',
                'HTTP request failed.',
                { retryable: true },
                { cause },
              );
        lastError = error;
        if (!error.context.retryable || attempt === this.maxAttempts) break;
        const delayMs = Math.min(this.baseDelayMs * 2 ** (attempt - 1), 2_000);
        this.logger.warn('Retrying HTTP request.', {
          attempt,
          delayMs,
          endpoint: error.context.endpoint,
        });
        await this.sleeper.sleep(delayMs, request.signal);
      }
    }
    throw new CollectionError(
      lastError?.code ?? 'HTTP_NETWORK_ERROR',
      lastError?.message ?? 'HTTP request failed.',
      { ...lastError?.context, attempts },
      { cause: lastError },
    );
  }
}
