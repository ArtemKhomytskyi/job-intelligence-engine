import { Prisma } from '@prisma/client';

import { PersistenceError } from '../../application/index.js';

export function mapPrismaError(cause: unknown): PersistenceError {
  if (cause instanceof PersistenceError) {
    return cause;
  }
  if (cause instanceof Prisma.PrismaClientInitializationError) {
    return new PersistenceError(
      'DATABASE_UNAVAILABLE',
      'The database is unavailable. Check the local PostgreSQL service and configuration.',
      { cause },
    );
  }
  if (cause instanceof Prisma.PrismaClientKnownRequestError) {
    if (cause.code === 'P2002') {
      return new PersistenceError(
        'DATABASE_CONSTRAINT_VIOLATION',
        'The requested write conflicts with an existing persisted identity.',
        { cause },
      );
    }
    if (cause.code === 'P2021' || cause.code === 'P2022') {
      return new PersistenceError(
        'MIGRATION_REQUIRED',
        'The database schema is not current. Apply pending migrations.',
        { cause },
      );
    }
    if (cause.code === 'P2025') {
      return new PersistenceError(
        'ENTITY_NOT_FOUND',
        'The requested persisted entity was not found.',
        { cause },
      );
    }
  }
  return new PersistenceError(
    'DATABASE_QUERY_FAILED',
    'The database operation failed.',
    { cause },
  );
}
