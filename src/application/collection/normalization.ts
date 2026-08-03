import type {
  EmploymentType,
  JsonValue,
  NormalizedJobPosting,
  RemotePolicy,
} from '../../domain/index.js';
import { normalizePublicUrlValue } from '../../domain/index.js';
import { CollectionError } from './errors.js';
import type { CollectableSource, CollectedJobCandidate } from './models.js';

const ENTITY_REPLACEMENTS: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

export function normalizeWhitespace(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function htmlToPlainText(value: string): string | undefined {
  const withoutExecutable = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<\s*br\s*\/?\s*>/giu, '\n')
    .replace(/<li\b[^>]*>/giu, '\n- ')
    .replace(/<\/(?:div|li|p|section|h[1-6])\s*>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (_match, entity: string) =>
      decodeEntity(entity),
    );
  const normalized = withoutExecutable
    .split(/\r?\n/u)
    .map(normalizeWhitespace)
    .filter((line) => line.length > 0)
    .join('\n');
  return normalized.length === 0 ? undefined : normalized;
}

export function normalizePublicUrl(value: string): string {
  const result = normalizePublicUrlValue(value);
  if (result.status === 'SUCCESS') return result.value;
  if (result.code === 'HTTPS_REQUIRED')
    throw normalizationError('Job URL must use HTTPS.');
  if (result.code === 'CREDENTIALS_NOT_ALLOWED')
    throw normalizationError('Job URL must not contain credentials.');
  throw normalizationError('Job URL is invalid.');
}

export function normalizeCollectedJob(
  source: CollectableSource,
  candidate: CollectedJobCandidate,
  collectedAt: string,
): NormalizedJobPosting {
  const externalId = required(candidate.externalId, 'external ID');
  const title = required(candidate.title, 'title');
  const company = required(candidate.company, 'company');
  const sourceUrl = normalizePublicUrl(candidate.sourceUrl);
  const applicationUrl =
    candidate.applicationUrl === undefined
      ? sourceUrl
      : normalizePublicUrl(candidate.applicationUrl);
  const description =
    candidate.description === undefined
      ? undefined
      : htmlToPlainText(candidate.description);
  const locationText = optional(candidate.locationText);
  const department = optional(candidate.department);
  const employmentType = mapEmploymentType(candidate.rawEmploymentType);
  const remotePolicy = mapRemotePolicy(candidate.rawWorkplaceType);
  const metadata: Record<string, JsonValue> = {
    collector: source.type,
    ...(locationText === undefined ? {} : { locationText }),
    ...(department === undefined ? {} : { department }),
    ...(candidate.rawEmploymentType === undefined
      ? {}
      : {
          sourceEmploymentType: normalizeWhitespace(
            candidate.rawEmploymentType,
          ),
        }),
    ...(candidate.rawWorkplaceType === undefined
      ? {}
      : {
          sourceWorkplaceType: normalizeWhitespace(candidate.rawWorkplaceType),
        }),
    ...(candidate.metadata ?? {}),
  };

  return {
    job: {
      id: `${source.id}:${externalId}`,
      source: { sourceId: source.id, externalId, sourceUrl },
      title,
      company,
      ...(description === undefined ? {} : { description }),
      locations: [],
      ...(remotePolicy === undefined ? {} : { remotePolicy }),
      ...(employmentType === undefined ? {} : { employmentType }),
      applicationUrl,
      requiredLanguages: [],
      skills: [],
      ...(candidate.publishedAt === undefined
        ? {}
        : { publishedAt: normalizeTimestamp(candidate.publishedAt) }),
      ...(candidate.expiresAt === undefined
        ? {}
        : { expiresAt: normalizeTimestamp(candidate.expiresAt) }),
      collectedAt: normalizeTimestamp(collectedAt),
      metadata,
    },
    canonicalUrl: sourceUrl,
    normalizedTitle: title.toLocaleLowerCase('en-US'),
    normalizedCompany: company.toLocaleLowerCase('en-US'),
    normalizedSkills: [],
    sourceTrace: { sourceId: source.id, externalId },
  };
}

function required(value: string, field: string): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length === 0) {
    throw normalizationError(`Job ${field} is required.`);
  }
  return normalized;
}

function optional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizeWhitespace(value);
  return normalized.length === 0 ? undefined : normalized;
}

function normalizeTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw normalizationError('Job timestamp is invalid.');
  }
  return timestamp.toISOString();
}

function mapEmploymentType(
  value: string | undefined,
): EmploymentType | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizeWhitespace(value).toLocaleLowerCase('en-US');
  const mappings: Readonly<Record<string, EmploymentType>> = {
    contract: 'contract',
    contractor: 'contract',
    'full-time': 'full-time',
    'full time': 'full-time',
    full_time: 'full-time',
    fulltime: 'full-time',
    internship: 'internship',
    intern: 'internship',
    'part-time': 'part-time',
    'part time': 'part-time',
    part_time: 'part-time',
    temporary: 'temporary',
  };
  return mappings[normalized];
}

function mapRemotePolicy(value: string | undefined): RemotePolicy | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizeWhitespace(value).toLocaleLowerCase('en-US');
  const mappings: Readonly<Record<string, RemotePolicy>> = {
    hybrid: 'hybrid',
    'on-site': 'onsite',
    onsite: 'onsite',
    remote: 'remote',
    telecommute: 'remote',
    'remote-first': 'remote',
  };
  return mappings[normalized];
}

function decodeEntity(entity: string): string {
  const normalized = entity.toLocaleLowerCase('en-US');
  if (normalized.startsWith('#x')) {
    return decodeCodePoint(Number.parseInt(normalized.slice(2), 16));
  }
  if (normalized.startsWith('#')) {
    return decodeCodePoint(Number.parseInt(normalized.slice(1), 10));
  }
  return ENTITY_REPLACEMENTS[normalized] ?? ' ';
}

function decodeCodePoint(value: number): string {
  try {
    return Number.isFinite(value) ? String.fromCodePoint(value) : ' ';
  } catch {
    return ' ';
  }
}

function normalizationError(message: string, cause?: unknown): CollectionError {
  return new CollectionError(
    'JOB_NORMALIZATION_FAILED',
    message,
    { retryable: false },
    cause === undefined ? undefined : { cause },
  );
}
