export const COLLECTION_ERROR_CODES = [
  'COLLECTOR_NOT_FOUND',
  'SOURCE_CONFIGURATION_INVALID',
  'HTTP_NETWORK_ERROR',
  'HTTP_TIMEOUT',
  'HTTP_RATE_LIMITED',
  'HTTP_CLIENT_ERROR',
  'HTTP_SERVER_ERROR',
  'HTTP_INVALID_JSON',
  'HTTP_RESPONSE_INVALID',
  'URL_UNSAFE',
  'DNS_RESOLUTION_FAILED',
  'REDIRECT_LIMIT_EXCEEDED',
  'REDIRECT_LOOP',
  'HTML_RESPONSE_TOO_LARGE',
  'HTTP_CONTENT_ENCODING_UNSUPPORTED',
  'EXTRACTION_FAILED',
  'BLOCK_PAGE_DETECTED',
  'BROWSER_UNAVAILABLE',
  'BROWSER_TIMEOUT',
  'BROWSER_RENDER_FAILED',
  'BROWSER_FALLBACK_NOT_PERMITTED',
  'SOURCE_RESPONSE_INVALID',
  'SOURCE_UNAVAILABLE',
  'COLLECTION_ABORTED',
  'JOB_NORMALIZATION_FAILED',
  'JOB_VALIDATION_FAILED',
  'JOB_PERSISTENCE_FAILED',
  'COLLECTION_RUN_PERSISTENCE_FAILED',
  'UNEXPECTED_COLLECTOR_FAILURE',
] as const;

export type CollectionErrorCode = (typeof COLLECTION_ERROR_CODES)[number];

export interface CollectionErrorContext {
  readonly sourceId?: string;
  readonly sourceType?: string;
  readonly retryable?: boolean;
  readonly httpStatus?: number;
  readonly attempts?: number;
  readonly endpoint?: string;
}

export class CollectionError extends Error {
  public constructor(
    public readonly code: CollectionErrorCode,
    message: string,
    public readonly context: CollectionErrorContext = {},
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = 'CollectionError';
  }
}

export function asCollectionError(
  error: unknown,
  context: CollectionErrorContext = {},
): CollectionError {
  if (error instanceof CollectionError) return error;
  return new CollectionError(
    'UNEXPECTED_COLLECTOR_FAILURE',
    'The collector failed unexpectedly.',
    context,
    { cause: error },
  );
}
