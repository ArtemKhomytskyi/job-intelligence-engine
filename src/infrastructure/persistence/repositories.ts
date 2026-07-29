import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  CollectionRunCompletion,
  CollectionRunRepository,
  CollectionRunWrite,
  CollectionSourceResultWrite,
  JobRepository,
  JobSourceRepository,
  JobSourceWrite,
  JobUpsertRequest,
  JobUpsertResult,
  PersistedCollectionRun,
  PersistedJob,
  PersistedJobSource,
  PersistedRecommendation,
  PersistedScore,
  PersistedStatusHistory,
  RecommendationRepository,
  RecommendationWrite,
  ScoreRepository,
  ScoreWrite,
  StatusUpdate,
  StatusUpdateResult,
} from '../../application/index.js';
import { PersistenceError } from '../../application/index.js';
import { isJobStatus } from '../../domain/index.js';
import {
  mapJob,
  mapJobSource,
  optionalJson,
  parseTimestamp,
} from './mappers.js';
import { fromPrismaJson, toPrismaJson } from './prisma-json.js';

export type PrismaRepositoryClient = Prisma.TransactionClient | PrismaClient;

const MEANINGFUL_JOB_FIELDS = [
  'title',
  'company',
  'description',
  'canonicalUrl',
  'applicationUrl',
  'normalizedTitle',
  'normalizedCompany',
  'locations',
  'remotePolicy',
  'employmentType',
  'seniority',
  'salaryMinimum',
  'salaryMaximum',
  'salaryCurrency',
  'salaryPeriod',
  'requiredExperience',
  'requiredEducation',
  'requiredLanguages',
  'skills',
  'normalizedSkills',
  'publishedAt',
  'expiresAt',
  'metadata',
] as const;

export class PrismaJobSourceRepository implements JobSourceRepository {
  public constructor(private readonly client: PrismaRepositoryClient) {}

  public async upsert(input: JobSourceWrite): Promise<PersistedJobSource> {
    const settings =
      input.settings === undefined
        ? Prisma.JsonNull
        : toPrismaJson(input.settings);
    const record = await this.client.jobSource.upsert({
      where: { configSourceId: input.configSourceId },
      create: {
        configSourceId: input.configSourceId,
        type: input.type,
        displayName: input.displayName,
        enabled: input.enabled,
        settings,
      },
      update: {
        type: input.type,
        displayName: input.displayName,
        enabled: input.enabled,
        settings,
      },
    });
    return mapJobSource(record);
  }

  public async findByConfigSourceId(
    configSourceId: string,
  ): Promise<PersistedJobSource | undefined> {
    const record = await this.client.jobSource.findUnique({
      where: { configSourceId },
    });
    return record === null ? undefined : mapJobSource(record);
  }
}

export class PrismaJobRepository implements JobRepository {
  public constructor(private readonly client: PrismaRepositoryClient) {}

  public async findById(id: string): Promise<PersistedJob | undefined> {
    const record = await this.client.job.findUnique({ where: { id } });
    return record === null ? undefined : mapJob(record);
  }

  public async upsert(input: JobUpsertRequest): Promise<JobUpsertResult> {
    const { posting, fingerprint } = input;
    const source = await this.client.jobSource.findUnique({
      where: { configSourceId: posting.sourceTrace.sourceId },
    });
    if (source === null) {
      throw new PersistenceError(
        'ENTITY_NOT_FOUND',
        `Configured source "${posting.sourceTrace.sourceId}" is not persisted.`,
      );
    }

    const externalReference = await this.client.jobSourceReference.findUnique({
      where: {
        sourceId_externalId: {
          sourceId: source.id,
          externalId: posting.sourceTrace.externalId,
        },
      },
    });
    const urlReference = await this.client.jobSourceReference.findUnique({
      where: {
        sourceId_sourceUrl: {
          sourceId: source.id,
          sourceUrl: posting.job.source.sourceUrl,
        },
      },
    });
    const canonicalMatch = await this.client.job.findUnique({
      where: { canonicalUrl: posting.canonicalUrl },
    });
    const fingerprintMatch = await this.client.jobFingerprint.findUnique({
      where: {
        fingerprint_algorithm_version: {
          fingerprint: fingerprint.value,
          algorithm: fingerprint.algorithm,
          version: fingerprint.version,
        },
      },
    });
    const candidateIds = new Set(
      [
        externalReference?.jobId,
        urlReference?.jobId,
        canonicalMatch?.id,
        fingerprintMatch?.jobId,
      ].filter((id): id is string => id !== undefined),
    );
    if (candidateIds.size > 1) {
      throw new PersistenceError(
        'JOB_IDENTITY_CONFLICT',
        'Exact job identity signals point to different persisted jobs.',
      );
    }

    const collectedAt = parseTimestamp(posting.job.collectedAt, 'collectedAt');
    const existingId = candidateIds.values().next().value;
    if (existingId === undefined) {
      const record = await this.client.job.create({
        data: {
          ...buildJobCreateData(posting, collectedAt),
          fingerprints: {
            create: {
              fingerprint: fingerprint.value,
              algorithm: fingerprint.algorithm,
              version: fingerprint.version,
              kind: fingerprint.kind,
            },
          },
          sourceReferences: {
            create: buildReferenceData(source.id, posting, collectedAt),
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'NEW',
              changedAt: collectedAt,
            },
          },
        },
      });
      return { outcome: 'CREATED', job: mapJob(record) };
    }

    const existing = await this.client.job.findUniqueOrThrow({
      where: { id: existingId },
    });
    const reference = externalReference ?? urlReference;
    let linked = false;
    let referenceId = reference?.id;
    if (reference === null) {
      const createdReference = await this.client.jobSourceReference.create({
        data: buildReferenceData(source.id, posting, collectedAt, existing.id),
      });
      referenceId = createdReference.id;
      linked = true;
    } else {
      await this.client.jobSourceReference.update({
        where: { id: reference.id },
        data: {
          lastSeenAt: laterDate(reference.lastSeenAt, collectedAt),
          lastCollectedAt: laterDate(reference.lastCollectedAt, collectedAt),
        },
      });
    }

    const desired = buildMeaningfulJobData(posting);
    const changedFields = findChangedFields(existing, desired);
    if (changedFields.length === 0) {
      const record = await this.client.job.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: laterDate(existing.lastSeenAt, collectedAt),
          lastCollectedAt: laterDate(existing.lastCollectedAt, collectedAt),
        },
      });
      await this.ensureFingerprint(existing.id, input);
      return {
        outcome: linked ? 'LINKED_TO_EXISTING' : 'UNCHANGED',
        job: mapJob(record),
      };
    }

    const latestRevision = await this.client.jobRevision.aggregate({
      where: { jobId: existing.id },
      _max: { revisionNumber: true },
    });
    const revisionNumber = (latestRevision._max.revisionNumber ?? 0) + 1;
    const record = await this.client.job.update({
      where: { id: existing.id },
      data: {
        ...desired,
        lastSeenAt: laterDate(existing.lastSeenAt, collectedAt),
        lastCollectedAt: laterDate(existing.lastCollectedAt, collectedAt),
        revisions: {
          create: {
            revisionNumber,
            changedAt: collectedAt,
            changedFields: toPrismaJson(changedFields),
            snapshot: toPrismaJson(
              buildRevisionSnapshot(existing, desired, changedFields),
            ),
            ...(referenceId === undefined
              ? {}
              : { sourceReferenceId: referenceId }),
            changeType: 'MEANINGFUL_FIELDS_CHANGED',
          },
        },
      },
    });
    await this.ensureFingerprint(existing.id, input);
    return { outcome: 'UPDATED', job: mapJob(record), revisionNumber };
  }

  public async updateStatus(input: StatusUpdate): Promise<StatusUpdateResult> {
    const existing = await this.client.job.findUnique({
      where: { id: input.jobId },
    });
    if (existing === null) {
      throw new PersistenceError('ENTITY_NOT_FOUND', 'The job was not found.');
    }
    if (existing.currentStatus === input.targetStatus) {
      return { changed: false, job: mapJob(existing) };
    }
    const changedAt = parseTimestamp(input.changedAt, 'changedAt');
    const record = await this.client.job.update({
      where: { id: input.jobId },
      data: {
        currentStatus: input.targetStatus,
        statusHistory: {
          create: {
            fromStatus: existing.currentStatus,
            toStatus: input.targetStatus,
            changedAt,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
            ...(input.metadata === undefined
              ? {}
              : { metadata: toPrismaJson(input.metadata) }),
          },
        },
      },
    });
    return { changed: true, job: mapJob(record) };
  }

  public async listStatusHistory(
    jobId: string,
  ): Promise<readonly PersistedStatusHistory[]> {
    const records = await this.client.jobStatusHistory.findMany({
      where: { jobId },
      orderBy: [{ changedAt: 'asc' }, { createdAt: 'asc' }],
    });
    return records.map((record) => {
      if (
        !isJobStatus(record.toStatus) ||
        (record.fromStatus !== null && !isJobStatus(record.fromStatus))
      ) {
        throw new PersistenceError(
          'DATA_MAPPING_FAILED',
          'Status history contains an unknown status.',
        );
      }
      return {
        id: record.id,
        jobId: record.jobId,
        ...(record.fromStatus === null
          ? {}
          : { fromStatus: record.fromStatus }),
        toStatus: record.toStatus,
        changedAt: record.changedAt.toISOString(),
        ...(record.reason === null ? {} : { reason: record.reason }),
      };
    });
  }

  private async ensureFingerprint(
    jobId: string,
    input: JobUpsertRequest,
  ): Promise<void> {
    await this.client.jobFingerprint.upsert({
      where: {
        fingerprint_algorithm_version: {
          fingerprint: input.fingerprint.value,
          algorithm: input.fingerprint.algorithm,
          version: input.fingerprint.version,
        },
      },
      create: {
        jobId,
        fingerprint: input.fingerprint.value,
        algorithm: input.fingerprint.algorithm,
        version: input.fingerprint.version,
        kind: input.fingerprint.kind,
      },
      update: {},
    });
  }
}

export class PrismaScoreRepository implements ScoreRepository {
  public constructor(private readonly client: PrismaRepositoryClient) {}

  public async save(input: ScoreWrite): Promise<PersistedScore> {
    await requireJob(this.client, input.jobId);
    const record = await this.client.jobScore.create({
      data: {
        jobId: input.jobId,
        searchTrackId: input.searchTrackId,
        totalScore: input.totalScore,
        confidence: input.confidence,
        positiveReasons: toPrismaJson(input.positiveReasons),
        concerns: toPrismaJson(input.concerns),
        missingData: toPrismaJson(input.missingData),
        scoringVersion: input.scoringVersion,
        calculatedAt: parseTimestamp(input.calculatedAt, 'calculatedAt'),
        components: {
          create: input.components.map((component) => ({
            key: component.key,
            rawScore: component.rawScore,
            weight: component.weight,
            contribution: component.contribution,
            confidence: component.confidence,
            reasons: toPrismaJson(component.reasons),
          })),
        },
      },
      include: { components: { orderBy: { key: 'asc' } } },
    });
    return mapScore(record);
  }

  public async findLatest(
    jobId: string,
    searchTrackId: string,
  ): Promise<PersistedScore | undefined> {
    const record = await this.client.jobScore.findFirst({
      where: { jobId, searchTrackId },
      orderBy: [{ calculatedAt: 'desc' }, { createdAt: 'desc' }],
      include: { components: { orderBy: { key: 'asc' } } },
    });
    return record === null ? undefined : mapScore(record);
  }
}

type ScoreWithComponents = Prisma.JobScoreGetPayload<{
  include: { components: true };
}>;

function mapScore(record: ScoreWithComponents): PersistedScore {
  return {
    id: record.id,
    jobId: record.jobId,
    searchTrackId: record.searchTrackId,
    totalScore: record.totalScore.toNumber(),
    confidence: record.confidence.toNumber(),
    positiveReasons: jsonStringArray(record.positiveReasons, 'positiveReasons'),
    concerns: jsonStringArray(record.concerns, 'concerns'),
    missingData: jsonStringArray(record.missingData, 'missingData'),
    scoringVersion: record.scoringVersion,
    calculatedAt: record.calculatedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    components: record.components.map((component) => ({
      key: component.key,
      rawScore: component.rawScore.toNumber(),
      weight: component.weight.toNumber(),
      contribution: component.contribution.toNumber(),
      confidence: component.confidence.toNumber(),
      reasons: jsonStringArray(component.reasons, 'component.reasons'),
    })),
  };
}

export class PrismaRecommendationRepository implements RecommendationRepository {
  public constructor(private readonly client: PrismaRepositoryClient) {}

  public async save(
    input: RecommendationWrite,
  ): Promise<PersistedRecommendation> {
    const score = await this.client.jobScore.findUnique({
      where: { id: input.scoreId },
    });
    if (score === null || score.jobId !== input.jobId) {
      throw new PersistenceError(
        'DATABASE_CONSTRAINT_VIOLATION',
        'The recommendation score must belong to the recommended job.',
      );
    }
    const record = await this.client.recommendation.create({
      data: {
        ...input,
        generatedAt: parseTimestamp(input.generatedAt, 'generatedAt'),
      },
    });
    return mapRecommendation(record);
  }

  public async findBatch(
    recommendationBatch: string,
  ): Promise<readonly PersistedRecommendation[]> {
    const records = await this.client.recommendation.findMany({
      where: { recommendationBatch },
      orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
    });
    return records.map(mapRecommendation);
  }
}

function mapRecommendation(
  record: Prisma.RecommendationGetPayload<object>,
): PersistedRecommendation {
  return {
    id: record.id,
    jobId: record.jobId,
    scoreId: record.scoreId,
    searchTrackId: record.searchTrackId,
    rank: record.rank,
    recommendationBatch: record.recommendationBatch,
    explanation: record.explanation,
    generatedAt: record.generatedAt.toISOString(),
    active: record.active,
    createdAt: record.createdAt.toISOString(),
  };
}

export class PrismaCollectionRunRepository implements CollectionRunRepository {
  public constructor(private readonly client: PrismaRepositoryClient) {}

  public async create(
    input: CollectionRunWrite,
  ): Promise<PersistedCollectionRun> {
    return mapCollectionRun(
      await this.client.collectionRun.create({
        data: {
          startedAt: parseTimestamp(input.startedAt, 'startedAt'),
          initiatedBy: input.initiatedBy,
        },
      }),
    );
  }

  public async recordSourceResult(
    input: CollectionSourceResultWrite,
  ): Promise<void> {
    const source = await this.client.jobSource.findUnique({
      where: { configSourceId: input.configSourceId },
    });
    if (source === null) {
      throw new PersistenceError(
        'ENTITY_NOT_FOUND',
        'The collection source was not found.',
      );
    }
    await this.client.collectionRunSourceResult.upsert({
      where: {
        collectionRunId_sourceId: {
          collectionRunId: input.collectionRunId,
          sourceId: source.id,
        },
      },
      create: buildSourceResultData(input, source.id),
      update: buildSourceResultData(input, source.id),
    });
  }

  public async complete(
    input: CollectionRunCompletion,
  ): Promise<PersistedCollectionRun> {
    return mapCollectionRun(
      await this.client.collectionRun.update({
        where: { id: input.runId },
        data: {
          status: input.status,
          completedAt: parseTimestamp(input.completedAt, 'completedAt'),
          discoveredCount: input.discoveredCount,
          insertedCount: input.insertedCount,
          updatedCount: input.updatedCount,
          duplicateCount: input.duplicateCount,
          failedCount: input.failedCount,
          ...(input.errorSummary === undefined
            ? {}
            : { errorSummary: toPrismaJson(input.errorSummary) }),
        },
      }),
    );
  }

  public async findById(
    id: string,
  ): Promise<PersistedCollectionRun | undefined> {
    const record = await this.client.collectionRun.findUnique({
      where: { id },
    });
    return record === null ? undefined : mapCollectionRun(record);
  }
}

function buildSourceResultData(
  input: CollectionSourceResultWrite,
  sourceId: string,
) {
  return {
    collectionRunId: input.collectionRunId,
    sourceId,
    status: input.status,
    discoveredCount: input.discoveredCount,
    insertedCount: input.insertedCount,
    updatedCount: input.updatedCount,
    duplicateCount: input.duplicateCount,
    invalidCount: input.invalidCount,
    startedAt: parseTimestamp(input.startedAt, 'startedAt'),
    ...(input.completedAt === undefined
      ? {}
      : { completedAt: parseTimestamp(input.completedAt, 'completedAt') }),
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    ...(input.errorMessage === undefined
      ? {}
      : { errorMessage: input.errorMessage }),
    ...(input.metadata === undefined
      ? {}
      : { metadata: toPrismaJson(input.metadata) }),
  };
}

function mapCollectionRun(
  record: Prisma.CollectionRunGetPayload<object>,
): PersistedCollectionRun {
  const errorSummary = optionalJson(record.errorSummary);
  return {
    id: record.id,
    startedAt: record.startedAt.toISOString(),
    ...(record.completedAt === null
      ? {}
      : { completedAt: record.completedAt.toISOString() }),
    status: record.status,
    initiatedBy: record.initiatedBy,
    discoveredCount: record.discoveredCount,
    insertedCount: record.insertedCount,
    updatedCount: record.updatedCount,
    duplicateCount: record.duplicateCount,
    failedCount: record.failedCount,
    ...(errorSummary === undefined ? {} : { errorSummary }),
  };
}

async function requireJob(
  client: PrismaRepositoryClient,
  jobId: string,
): Promise<void> {
  const job = await client.job.findUnique({
    where: { id: jobId },
    select: { id: true },
  });
  if (job === null) {
    throw new PersistenceError(
      'ENTITY_NOT_FOUND',
      'The score job was not found.',
    );
  }
}

function buildJobCreateData(
  posting: JobUpsertRequest['posting'],
  collectedAt: Date,
) {
  return {
    ...buildMeaningfulJobData(posting),
    firstSeenAt: collectedAt,
    lastSeenAt: collectedAt,
    lastCollectedAt: collectedAt,
  };
}

function buildMeaningfulJobData(posting: JobUpsertRequest['posting']) {
  const job = posting.job;
  return {
    title: job.title,
    company: job.company,
    ...(job.description === undefined ? {} : { description: job.description }),
    canonicalUrl: posting.canonicalUrl,
    ...(job.applicationUrl === undefined
      ? {}
      : { applicationUrl: job.applicationUrl }),
    normalizedTitle: posting.normalizedTitle,
    normalizedCompany: posting.normalizedCompany,
    locations: toPrismaJson(job.locations),
    ...(job.remotePolicy === undefined
      ? {}
      : { remotePolicy: job.remotePolicy }),
    ...(job.employmentType === undefined
      ? {}
      : { employmentType: job.employmentType }),
    ...(job.seniority === undefined ? {} : { seniority: job.seniority }),
    ...(job.salary?.minimum === undefined
      ? {}
      : { salaryMinimum: job.salary.minimum }),
    ...(job.salary?.maximum === undefined
      ? {}
      : { salaryMaximum: job.salary.maximum }),
    ...(job.salary === undefined
      ? {}
      : {
          salaryCurrency: job.salary.currency,
          salaryPeriod: job.salary.period,
        }),
    ...(job.requiredExperience === undefined
      ? {}
      : { requiredExperience: toPrismaJson(job.requiredExperience) }),
    ...(job.requiredEducation === undefined
      ? {}
      : { requiredEducation: job.requiredEducation }),
    requiredLanguages: toPrismaJson(job.requiredLanguages),
    skills: toPrismaJson(job.skills),
    normalizedSkills: toPrismaJson(posting.normalizedSkills),
    ...(job.publishedAt === undefined
      ? {}
      : { publishedAt: parseTimestamp(job.publishedAt, 'publishedAt') }),
    ...(job.expiresAt === undefined
      ? {}
      : { expiresAt: parseTimestamp(job.expiresAt, 'expiresAt') }),
    ...(job.metadata === undefined
      ? {}
      : { metadata: toPrismaJson(job.metadata) }),
  };
}

function buildReferenceData(
  sourceId: string,
  posting: JobUpsertRequest['posting'],
  collectedAt: Date,
  jobId?: string,
) {
  return {
    ...(jobId === undefined ? {} : { jobId }),
    sourceId,
    externalId: posting.sourceTrace.externalId,
    sourceUrl: posting.job.source.sourceUrl,
    firstSeenAt: collectedAt,
    lastSeenAt: collectedAt,
    lastCollectedAt: collectedAt,
  };
}

function findChangedFields(
  existing: Prisma.JobGetPayload<object>,
  desired: ReturnType<typeof buildMeaningfulJobData>,
): string[] {
  return MEANINGFUL_JOB_FIELDS.filter((field) => {
    if (!(field in desired)) {
      return false;
    }
    return stableValue(existing[field]) !== stableValue(desired[field]);
  });
}

function buildRevisionSnapshot(
  existing: Prisma.JobGetPayload<object>,
  desired: ReturnType<typeof buildMeaningfulJobData>,
  changedFields: readonly string[],
) {
  return Object.fromEntries(
    changedFields.map((field) => [
      field,
      {
        before: jsonSafe(existing[field as keyof typeof existing]),
        after: jsonSafe(desired[field as keyof typeof desired]),
      },
    ]),
  );
}

function stableValue(value: unknown): string {
  return JSON.stringify(jsonSafe(value));
}

function jsonSafe(
  value: unknown,
):
  | string
  | number
  | boolean
  | null
  | readonly unknown[]
  | Record<string, unknown> {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, jsonSafe(item)]),
    );
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  throw new TypeError('Value cannot be represented in a revision snapshot.');
}

function laterDate(current: Date, incoming: Date): Date {
  return current.getTime() >= incoming.getTime() ? current : incoming;
}

function jsonStringArray(value: unknown, field: string): readonly string[] {
  const json = fromPrismaJson(value);
  if (!Array.isArray(json) || !json.every((item) => typeof item === 'string')) {
    throw new PersistenceError(
      'DATA_MAPPING_FAILED',
      `${field} must contain only strings.`,
    );
  }
  return json;
}
