export const PERSISTENCE_ERROR_CODES = [
  'DATABASE_UNAVAILABLE',
  'DATABASE_QUERY_FAILED',
  'DATABASE_CONSTRAINT_VIOLATION',
  'ENTITY_NOT_FOUND',
  'DUPLICATE_SOURCE_REFERENCE',
  'JOB_IDENTITY_CONFLICT',
  'INVALID_STATUS_TRANSITION',
  'TRANSACTION_FAILED',
  'DATA_MAPPING_FAILED',
  'MIGRATION_REQUIRED',
] as const;

export type PersistenceErrorCode = (typeof PERSISTENCE_ERROR_CODES)[number];

export class PersistenceError extends Error {
  public constructor(
    public readonly code: PersistenceErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PersistenceError';
  }
}
