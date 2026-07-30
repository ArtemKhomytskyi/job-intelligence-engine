import type {
  CollectionRunCompletion,
  CollectionSourceResultWrite,
  JobSourceWrite,
  JobUpsertResult,
  PersistedCollectionRun,
} from '../persistence/models.js';
import type { NormalizedJobPosting } from '../../domain/index.js';
import type {
  CollectableSource,
  CollectionContext,
  CollectorResult,
} from './models.js';

export interface JobCollector {
  readonly sourceType: CollectableSource['type'];
  collect(
    source: CollectableSource,
    context: CollectionContext,
  ): Promise<CollectorResult>;
}

export interface JsonDecoder<T> {
  decode(input: unknown): T;
}

export interface HttpRequest {
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  readonly rateLimitKey: string;
  readonly minimumIntervalMs: number;
  readonly maximumResponseBytes?: number;
  readonly maximumRedirects?: number;
  readonly allowTestLoopback?: boolean;
}

export interface HttpJsonResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly attempts: number;
  readonly finalUrl?: string;
  readonly redirectCount?: number;
}

export interface HttpTextResponse {
  readonly data: string;
  readonly status: number;
  readonly attempts: number;
  readonly finalUrl: string;
  readonly redirectCount: number;
}

export interface HttpClient {
  getJson<T>(
    request: HttpRequest,
    decoder: JsonDecoder<T>,
  ): Promise<HttpJsonResponse<T>>;
  getText(request: HttpRequest): Promise<HttpTextResponse>;
}

export interface UrlSafetyValidator {
  validate(url: string, allowTestLoopback: boolean): Promise<string>;
}

export interface Sleeper {
  sleep(delayMs: number, signal: AbortSignal): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export type LogFields = Readonly<
  Record<string, boolean | number | string | null | undefined>
>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface CollectionPersistence {
  upsertSource(input: JobSourceWrite): Promise<void>;
  createRun(
    startedAt: string,
    initiatedBy: string,
  ): Promise<PersistedCollectionRun>;
  upsertJob(posting: NormalizedJobPosting): Promise<JobUpsertResult>;
  recordSourceResult(input: CollectionSourceResultWrite): Promise<void>;
  completeRun(input: CollectionRunCompletion): Promise<PersistedCollectionRun>;
}
