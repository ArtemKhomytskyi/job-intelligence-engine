import type {
  Clock,
  HttpClient,
  HttpJsonResponse,
  HttpRequest,
  HttpTextResponse,
  JsonDecoder,
  Sleeper,
} from '../../application/index.js';

export class RateLimitedHttpClient implements HttpClient {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly nextAllowedAt = new Map<string, number>();
  public constructor(
    private readonly delegate: HttpClient,
    private readonly clock: Clock,
    private readonly sleeper: Sleeper,
  ) {}

  public getJson<T>(
    request: HttpRequest,
    decoder: JsonDecoder<T>,
  ): Promise<HttpJsonResponse<T>> {
    return this.schedule(request, () =>
      this.delegate.getJson(request, decoder),
    );
  }

  public getText(request: HttpRequest): Promise<HttpTextResponse> {
    return this.schedule(request, () => this.delegate.getText(request));
  }

  private schedule<T>(
    request: HttpRequest,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.tails.get(request.rateLimitKey) ?? Promise.resolve();
    const execution = previous
      .catch(() => undefined)
      .then(async () => {
        const waitMs = Math.max(
          0,
          (this.nextAllowedAt.get(request.rateLimitKey) ?? 0) -
            this.clock.now().getTime(),
        );
        if (waitMs > 0) await this.sleeper.sleep(waitMs, request.signal);
        this.nextAllowedAt.set(
          request.rateLimitKey,
          this.clock.now().getTime() + request.minimumIntervalMs,
        );
        return operation();
      });
    this.tails.set(
      request.rateLimitKey,
      execution.then(
        () => undefined,
        () => undefined,
      ),
    );
    return execution;
  }
}
