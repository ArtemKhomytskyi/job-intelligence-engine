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
  PersistedProcessingRun,
  ProcessingDecisionLookup,
  ProcessingDecisionKey,
  ProcessingDecisionWrite,
  ProcessingRepository,
  ProcessingRunCompletion,
  ProcessingRunWrite,
  ProcessingSaveOutcome,
  RecommendationRepository,
  RecommendationBatchRepository,
  RecommendationBatchWrite,
  RecommendationCandidateRecord,
  PersistedRecommendationBatch,
  RecommendationWrite,
  ScoreRepository,
  ScoreWrite,
  StatusUpdate,
  StatusUpdateResult,
} from '../../application/index.js';
import { PersistenceError } from '../../application/index.js';
import {
  EMPLOYMENT_TYPES,
  isJobStatus,
  REMOTE_POLICIES,
  type EmploymentType,
  type JobLocation,
  type JsonValue,
  type RemotePolicy,
  type EnrichedNormalizedJob,
  type ScoreReason,
} from '../../domain/index.js';
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

export class PrismaProcessingRepository implements ProcessingRepository {
  public constructor(private readonly client: PrismaRepositoryClient) {}

  public async listProcessableJobs(
    limit: number,
  ): Promise<readonly import('../../domain/index.js').ProcessableJob[]> {
    const records = await this.client.job.findMany({
      take: limit,
      orderBy: [{ lastCollectedAt: 'asc' }, { id: 'asc' }],
      include: {
        sourceReferences: {
          orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
          take: 1,
          include: { source: { select: { configSourceId: true } } },
        },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
          select: { revisionNumber: true },
        },
      },
    });
    return records.map((record) => {
      const reference = record.sourceReferences[0];
      const metadata = optionalJson(record.metadata);
      return {
        id: record.id,
        ...(reference === undefined
          ? {}
          : {
              sourceId: reference.source.configSourceId,
              ...(reference.externalId === null
                ? {}
                : { externalId: reference.externalId }),
            }),
        sourceUrl: reference?.sourceUrl ?? record.canonicalUrl,
        canonicalUrl: record.canonicalUrl,
        ...(record.applicationUrl === null
          ? {}
          : { applicationUrl: record.applicationUrl }),
        title: record.title,
        company: record.company,
        ...(record.description === null
          ? {}
          : { description: record.description }),
        locations: processingLocations(record.locations),
        ...(record.remotePolicy === null ||
        record.remotePolicy === 'unspecified'
          ? {}
          : { remotePolicy: processingRemotePolicy(record.remotePolicy) }),
        ...(record.employmentType === null
          ? {}
          : {
              employmentType: processingEmploymentType(record.employmentType),
            }),
        ...(record.salaryMinimum === null
          ? {}
          : { salaryMinimum: record.salaryMinimum.toNumber() }),
        ...(record.salaryMaximum === null
          ? {}
          : { salaryMaximum: record.salaryMaximum.toNumber() }),
        ...(record.salaryCurrency === null
          ? {}
          : { salaryCurrency: record.salaryCurrency }),
        ...(record.salaryPeriod === null
          ? {}
          : { salaryPeriod: record.salaryPeriod }),
        ...(record.publishedAt === null
          ? {}
          : { publishedAt: record.publishedAt.toISOString() }),
        ...(record.expiresAt === null
          ? {}
          : { expiresAt: record.expiresAt.toISOString() }),
        firstSeenAt: record.firstSeenAt.toISOString(),
        lastCollectedAt: record.lastCollectedAt.toISOString(),
        ...(metadata === undefined || !isJsonObject(metadata)
          ? {}
          : { metadata }),
        inputRevisionNumber: record.revisions[0]?.revisionNumber ?? 0,
      };
    });
  }

  public async createRun(
    input: ProcessingRunWrite,
  ): Promise<PersistedProcessingRun> {
    const record = await this.client.jobProcessingRun.create({
      data: {
        startedAt: parseTimestamp(input.startedAt, 'startedAt'),
        status: 'RUNNING',
        initiatedBy: input.initiatedBy,
        normalizationVersion: input.normalizationVersion,
        fingerprintVersion: input.fingerprintVersion,
        filterRulesVersion: input.filterRulesVersion,
        configFingerprint: input.configFingerprint,
      },
    });
    return { ...input, id: record.id };
  }

  public async listExistingDecisionKeys(
    input: ProcessingDecisionLookup,
  ): Promise<readonly ProcessingDecisionKey[]> {
    if (input.jobIds.length === 0) return [];
    return this.client.jobProcessingDecision.findMany({
      where: {
        jobId: { in: [...input.jobIds] },
        normalizationVersion: input.normalizationVersion,
        fingerprintVersion: input.fingerprintVersion,
        filterRulesVersion: input.filterRulesVersion,
        configFingerprint: input.configFingerprint,
      },
      select: {
        jobId: true,
        inputRevisionNumber: true,
        normalizationVersion: true,
        fingerprintVersion: true,
        filterRulesVersion: true,
        configFingerprint: true,
      },
    });
  }

  public async saveDecision(
    input: ProcessingDecisionWrite,
  ): Promise<ProcessingSaveOutcome> {
    const duplicate = input.duplicateDecision;
    const filter = input.hardFilterResult;
    const data: Prisma.JobProcessingDecisionCreateManyInput = {
      jobId: input.jobId,
      runId: input.runId,
      primaryJobId:
        duplicate?.decision === 'DUPLICATE' ? duplicate.primaryJobId : null,
      processingStatus: input.processingStatus,
      inputRevisionNumber: input.inputRevisionNumber,
      normalizationVersion: input.normalizationVersion,
      fingerprintVersion: input.fingerprintVersion,
      filterRulesVersion: input.filterRulesVersion,
      configFingerprint: input.configFingerprint,
      processingFingerprint: input.processingFingerprint ?? null,
      duplicateDecision: duplicate?.decision ?? null,
      duplicateEvidence:
        duplicate === undefined
          ? Prisma.JsonNull
          : toPrismaJson(duplicate.evidence),
      hardFilterDecision: filter?.decision ?? null,
      hardFilterReasons:
        filter === undefined ? Prisma.JsonNull : toPrismaJson(filter.reasons),
      normalizationIssues: toPrismaJson(input.normalizationIssues),
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      processedAt: parseTimestamp(input.processedAt, 'processedAt'),
    };
    const created = await this.client.jobProcessingDecision.createMany({
      data,
      skipDuplicates: true,
    });
    if (created.count === 0) return 'ALREADY_EXISTS';
    if (input.normalizedJob !== undefined) {
      const job = input.normalizedJob;
      const requiredEducation = job.educationRequirements.find(
        (requirement) => requirement.requirement === 'REQUIRED',
      );
      await this.client.job.update({
        where: { id: input.jobId },
        data: {
          normalizedTitle: job.normalizedTitle,
          normalizedCompany: job.normalizedCompany,
          normalizedLocationKey: job.location.normalizedKey,
          canonicalApplicationUrl: job.canonicalApplicationUrl,
          normalizationVersion: job.normalizationVersion,
          normalizedAt: parseTimestamp(job.normalizedAt, 'normalizedAt'),
          normalizationIssues: toPrismaJson(input.normalizationIssues),
          normalizedPayload: toPrismaJson(job),
          remotePolicy:
            job.location.remotePolicy === 'unspecified'
              ? null
              : job.location.remotePolicy,
          employmentType: job.employmentType ?? null,
          seniority: job.seniority ?? null,
          requiredExperience:
            job.experienceRequirements.length === 0
              ? Prisma.DbNull
              : toPrismaJson(job.experienceRequirements),
          requiredEducation: requiredEducation?.level ?? null,
          requiredLanguages: toPrismaJson(job.languageRequirements),
          skills: toPrismaJson(job.skillRequirements),
          normalizedSkills: toPrismaJson(
            job.skillRequirements.map((skill) => skill.canonicalName),
          ),
        },
      });
    }
    return 'CREATED';
  }

  public async completeRun(input: ProcessingRunCompletion): Promise<void> {
    await this.client.jobProcessingRun.update({
      where: { id: input.runId },
      data: {
        completedAt: parseTimestamp(input.completedAt, 'completedAt'),
        status: input.status,
        consideredCount: input.consideredCount,
        normalizedCount: input.normalizedCount,
        normalizationFailedCount: input.normalizationFailedCount,
        duplicateCount: input.duplicateCount,
        possibleDuplicateCount: input.possibleDuplicateCount,
        rejectedCount: input.rejectedCount,
        eligibleCount: input.eligibleCount,
        errorCount: input.errorCount,
        skippedCount: input.skippedCount,
      },
    });
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

export class PrismaRecommendationBatchRepository implements RecommendationBatchRepository {
  public constructor(private readonly client: PrismaRepositoryClient) {}

  public async listEligibleCandidates(
    limit: number,
  ): Promise<readonly RecommendationCandidateRecord[]> {
    const records = await this.client.job.findMany({
      where: {
        currentStatus: { notIn: ['APPLIED', 'SKIPPED'] },
        normalizedPayload: { not: Prisma.DbNull },
        processingDecisions: { some: {} },
      },
      take: limit,
      orderBy: [{ lastCollectedAt: 'desc' }, { id: 'asc' }],
      include: {
        processingDecisions: {
          take: 1,
          orderBy: [{ processedAt: 'desc' }, { id: 'desc' }],
        },
        sourceReferences: {
          take: 20,
          orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
          include: {
            source: { select: { configSourceId: true, type: true } },
          },
        },
      },
    });
    return records.flatMap((record) => {
      const decision = record.processingDecisions[0];
      if (decision === undefined || decision.processingStatus !== 'ELIGIBLE')
        return [];
      return [
        {
          jobId: record.id,
          processingDecisionId: decision.id,
          inputRevisionNumber: decision.inputRevisionNumber,
          currentStatus: record.currentStatus,
          normalizedJob: parseNormalizedPayload(record.normalizedPayload),
          sourceIds: record.sourceReferences.map(
            (item) => item.source.configSourceId,
          ),
          source: {
            ...(record.sourceReferences[0]?.source.type === undefined
              ? {}
              : { type: record.sourceReferences[0].source.type }),
            tags: [],
            trackIds: [],
          },
        },
      ];
    });
  }

  public async saveBatch(
    input: RecommendationBatchWrite,
  ): Promise<PersistedRecommendationBatch> {
    const created = await this.client.recommendationBatch.createMany({
      data: {
        inputHash: input.inputHash,
        evaluationTime: parseTimestamp(input.evaluationTime, 'evaluationTime'),
        requestedLimit: input.requestedLimit,
        selectedCount: input.items.length,
        configurationFingerprint: input.configurationFingerprint,
        scoringVersion: input.scoringVersion,
        selectorVersion: input.selectorVersion,
      },
      skipDuplicates: true,
    });
    const batch = await this.client.recommendationBatch.findUniqueOrThrow({
      where: { inputHash: input.inputHash },
    });
    if (created.count === 0) return this.loadBatch(batch.id, true);
    if (input.evaluations.length > 0)
      await this.client.recommendationEvaluation.createMany({
        data: input.evaluations.map((evaluation) => ({
          batchId: batch.id,
          jobId: evaluation.jobId,
          processingDecisionId: evaluation.processingDecisionId,
          inputRevisionNumber: evaluation.inputRevisionNumber,
          outcome: evaluation.outcome,
          ...(evaluation.exclusionReason === undefined
            ? {}
            : { exclusionReason: evaluation.exclusionReason }),
          threshold: evaluation.threshold,
          ...(evaluation.score === undefined
            ? {}
            : {
                selectedTrackId: evaluation.score.selectedTrackId,
                totalScore: evaluation.score.totalScore,
                candidateFitScore: evaluation.score.candidateFitScore ?? 0,
                opportunityScore: evaluation.score.opportunityScore,
                completeness: evaluation.score.completeness,
                components: toPrismaJson(evaluation.score.components),
                positiveReasons: toPrismaJson(evaluation.score.positiveReasons),
                concerns: toPrismaJson(evaluation.score.concerns),
                missingData: toPrismaJson(evaluation.score.missingData),
              }),
          trackEvaluations: toPrismaJson(evaluation.trackEvaluations),
        })),
        skipDuplicates: true,
      });
    for (const item of input.items) {
      const scoreKey = `${input.inputHash}:${item.jobId}`;
      const score = await this.client.jobScore.create({
        data: {
          jobId: item.jobId,
          processingDecisionId: item.processingDecisionId,
          inputRevisionNumber: item.inputRevisionNumber,
          searchTrackId: item.score.selectedTrackId,
          totalScore: item.score.totalScore,
          opportunityScore: item.score.opportunityScore,
          confidence: item.score.completeness,
          positiveReasons: toPrismaJson(item.score.positiveReasons),
          concerns: toPrismaJson(item.score.concerns),
          missingData: toPrismaJson(item.score.missingData),
          scoringVersion: input.scoringVersion,
          scoreKey,
          calculatedAt: parseTimestamp(input.evaluationTime, 'evaluationTime'),
          components: {
            create: item.score.components.map((component) => ({
              key: component.key,
              rawScore: component.rawScore,
              weight: component.weight,
              contribution: component.contribution,
              confidence: component.confidence,
              reasons: toPrismaJson(component.reasons),
            })),
          },
        },
      });
      await this.client.recommendation.create({
        data: {
          jobId: item.jobId,
          scoreId: score.id,
          searchTrackId: item.score.selectedTrackId,
          rank: item.rank,
          recommendationBatch: batch.id,
          batchId: batch.id,
          explanation: JSON.stringify({
            positives: item.score.positiveReasons.slice(0, 3),
            concerns: item.score.concerns.slice(0, 3),
          }),
          generatedAt: parseTimestamp(input.evaluationTime, 'evaluationTime'),
          active: true,
        },
      });
    }
    return this.loadBatch(batch.id, false);
  }

  private async loadBatch(
    id: string,
    reused: boolean,
  ): Promise<PersistedRecommendationBatch> {
    const batch = await this.client.recommendationBatch.findUniqueOrThrow({
      where: { id },
      include: {
        _count: { select: { evaluations: true } },
        recommendations: {
          orderBy: [{ rank: 'asc' }, { id: 'asc' }],
          include: {
            job: { select: { title: true, company: true } },
            score: { include: { components: { orderBy: { key: 'asc' } } } },
          },
        },
      },
    });
    return {
      id: batch.id,
      inputHash: batch.inputHash,
      evaluationTime: batch.evaluationTime.toISOString(),
      requestedLimit: batch.requestedLimit,
      selectedCount: batch.selectedCount,
      evaluatedCount: batch._count.evaluations,
      configurationFingerprint: batch.configurationFingerprint,
      scoringVersion: batch.scoringVersion,
      selectorVersion: batch.selectorVersion,
      createdAt: batch.createdAt.toISOString(),
      reused,
      items: batch.recommendations.map((recommendation) => ({
        jobId: recommendation.jobId,
        processingDecisionId: recommendation.score.processingDecisionId ?? '',
        inputRevisionNumber: recommendation.score.inputRevisionNumber ?? 0,
        rank: recommendation.rank,
        scoreId: recommendation.scoreId,
        title: recommendation.job.title,
        company: recommendation.job.company,
        score: mapRecommendationScore(recommendation.score),
      })),
    };
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

type RecommendationScoreRecord = Prisma.JobScoreGetPayload<{
  include: { components: true };
}>;

export function mapRecommendationScore(record: RecommendationScoreRecord) {
  return {
    totalScore: record.totalScore.toNumber(),
    opportunityScore: record.opportunityScore.toNumber(),
    selectedTrackId: record.searchTrackId,
    components: record.components
      .map((component) => ({
        key: component.key as import('../../domain/index.js').ScoringComponentKey,
        rawScore: component.rawScore.toNumber(),
        weight: component.weight.toNumber(),
        contribution: component.contribution.toNumber(),
        confidence: component.confidence.toNumber(),
        reasons: jsonScoreReasons(component.reasons, 'component.reasons'),
      }))
      .sort((left, right) => left.key.localeCompare(right.key, 'en-US')),
    positiveReasons: jsonScoreReasons(
      record.positiveReasons,
      'positiveReasons',
    ),
    concerns: jsonScoreReasons(record.concerns, 'concerns'),
    missingData: jsonStringArray(record.missingData, 'missingData'),
    completeness: record.confidence.toNumber(),
  };
}

function jsonScoreReasons(
  value: unknown,
  field: string,
): readonly ScoreReason[] {
  const json = fromPrismaJson(value);
  if (!Array.isArray(json))
    throw new PersistenceError(
      'DATA_MAPPING_FAILED',
      `${field} must be an array.`,
    );
  return json.map((item) => {
    if (
      !isJsonObject(item) ||
      typeof item['code'] !== 'string' ||
      typeof item['message'] !== 'string' ||
      !['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MISSING_DATA'].includes(
        typeof item['impact'] === 'string' ? item['impact'] : '',
      )
    )
      throw new PersistenceError(
        'DATA_MAPPING_FAILED',
        `${field} contains an invalid score reason.`,
      );
    const details = scoreReasonDetails(item['details']);
    return {
      code: item['code'],
      message: item['message'],
      impact: item['impact'] as ScoreReason['impact'],
      ...(details === undefined ? {} : { details }),
    };
  });
}

function scoreReasonDetails(
  value: unknown,
): ScoreReason['details'] | undefined {
  if (!isJsonObject(value)) return undefined;
  const details: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item !== null &&
      typeof item !== 'string' &&
      typeof item !== 'number' &&
      typeof item !== 'boolean'
    )
      throw new PersistenceError(
        'DATA_MAPPING_FAILED',
        'Score reason details must contain scalar JSON values.',
      );
    details[key] = item;
  }
  return details;
}

function parseNormalizedPayload(value: unknown): EnrichedNormalizedJob {
  const json = fromPrismaJson(value);
  if (
    !isJsonObject(json) ||
    typeof json['id'] !== 'string' ||
    typeof json['inputRevisionNumber'] !== 'number' ||
    typeof json['normalizedTitle'] !== 'string' ||
    typeof json['titleComparisonKey'] !== 'string' ||
    typeof json['normalizedCompany'] !== 'string' ||
    typeof json['companyComparisonKey'] !== 'string' ||
    !isJsonObject(json['location']) ||
    !Array.isArray(json['experienceRequirements']) ||
    !Array.isArray(json['educationRequirements']) ||
    !Array.isArray(json['languageRequirements']) ||
    !Array.isArray(json['skillRequirements']) ||
    !Array.isArray(json['workAuthorizationRequirements'])
  )
    throw new PersistenceError(
      'DATA_MAPPING_FAILED',
      'Normalized job payload is malformed.',
    );
  return json as unknown as EnrichedNormalizedJob;
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
    failedCount: input.failedCount,
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

function processingLocations(value: unknown): readonly JobLocation[] {
  const json = fromPrismaJson(value);
  if (!Array.isArray(json))
    throw new PersistenceError(
      'DATA_MAPPING_FAILED',
      'Job locations must be an array.',
    );
  return json.map((item: JsonValue) => {
    if (!isJsonObject(item) || typeof item['country'] !== 'string')
      throw new PersistenceError(
        'DATA_MAPPING_FAILED',
        'Job location must contain a country string.',
      );
    return {
      country: item['country'],
      ...(typeof item['city'] === 'string' ? { city: item['city'] } : {}),
      ...(typeof item['region'] === 'string' ? { region: item['region'] } : {}),
    };
  });
}

function processingRemotePolicy(value: string): RemotePolicy {
  if ((REMOTE_POLICIES as readonly string[]).includes(value))
    return value as RemotePolicy;
  throw new PersistenceError(
    'DATA_MAPPING_FAILED',
    'Job contains an unknown remote policy.',
  );
}

function processingEmploymentType(value: string): EmploymentType {
  if ((EMPLOYMENT_TYPES as readonly string[]).includes(value))
    return value as EmploymentType;
  throw new PersistenceError(
    'DATA_MAPPING_FAILED',
    'Job contains an unknown employment type.',
  );
}

function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
