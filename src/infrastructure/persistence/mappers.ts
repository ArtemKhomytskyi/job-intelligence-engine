import type { Job, JobSource } from '@prisma/client';

import { isJobStatus, type JsonValue } from '../../domain/index.js';
import {
  PersistenceError,
  type PersistedJob,
  type PersistedJobSource,
} from '../../application/index.js';
import { fromPrismaJson } from './prisma-json.js';

export function mapJob(record: Job): PersistedJob {
  if (!isJobStatus(record.currentStatus)) {
    throw mappingError('Job contains an unknown lifecycle status.');
  }
  return {
    id: record.id,
    title: record.title,
    company: record.company,
    canonicalUrl: record.canonicalUrl,
    normalizedTitle: record.normalizedTitle,
    normalizedCompany: record.normalizedCompany,
    currentStatus: record.currentStatus,
    firstSeenAt: record.firstSeenAt.toISOString(),
    lastSeenAt: record.lastSeenAt.toISOString(),
    lastCollectedAt: record.lastCollectedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function mapJobSource(record: JobSource): PersistedJobSource {
  const settings = optionalJson(record.settings);
  return {
    id: record.id,
    configSourceId: record.configSourceId,
    type: record.type,
    displayName: record.displayName,
    enabled: record.enabled,
    ...(settings === undefined ? {} : { settings }),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function optionalJson(value: unknown): JsonValue | undefined {
  return value === null ? undefined : fromPrismaJson(value);
}

export function mappingError(
  message: string,
  cause?: unknown,
): PersistenceError {
  return new PersistenceError(
    'DATA_MAPPING_FAILED',
    message,
    cause === undefined ? undefined : { cause },
  );
}

export function parseTimestamp(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw mappingError(`${field} must be a valid ISO-8601 timestamp.`);
  }
  return parsed;
}
