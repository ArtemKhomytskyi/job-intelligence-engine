import {
  CollectionError,
  type HttpClient,
  type HttpJsonResponse,
  type HttpRequest,
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
    let lastError: CollectionError | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.delegate.getJson(request, decoder);
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
      { ...lastError?.context, attempts: this.maxAttempts },
      { cause: lastError },
    );
  }
}
