import type {
  Prisma,
  PrismaClient,
  RecommendationEvaluation,
} from '@prisma/client';

import {
  type LatestPipelineState,
  type RecommendationBatchView,
  type RecommendationDetails,
  type RecommendationReportRepository,
  type StatusHistoryView,
  type UpdateApplicationStatusInput,
  type UpdateApplicationStatusResult,
} from '../../application/index.js';
import {
  isJobStatus,
  normalizePublicUrlValue,
  type EnrichedNormalizedJob,
  type JobStatus,
} from '../../domain/index.js';
import { fromPrismaJson } from './prisma-json.js';
import { PrismaJobRepository, mapRecommendationScore } from './repositories.js';

const MAX_REPORT_RECOMMENDATIONS = 1_000;

type ReportBatchRecord = Prisma.RecommendationBatchGetPayload<{
  include: {
    recommendations: {
      include: {
        job: {
          select: {
            title: true;
            company: true;
            applicationUrl: true;
            canonicalApplicationUrl: true;
            locations: true;
            remotePolicy: true;
            salaryMinimum: true;
            salaryMaximum: true;
            salaryCurrency: true;
            salaryPeriod: true;
            publishedAt: true;
            currentStatus: true;
            updatedAt: true;
            statusHistory: true;
          };
        };
        score: { include: { components: true } };
      };
    };
  };
}>;

type ReportDetailsRecord = Prisma.RecommendationGetPayload<{
  include: {
    batch: true;
    job: {
      include: {
        sourceReferences: true;
        statusHistory: true;
      };
    };
    score: {
      include: {
        components: true;
        processingDecision: true;
      };
    };
  };
}>;

type ReportEvaluationRecord = RecommendationEvaluation;

export class PrismaRecommendationReportRepository implements RecommendationReportRepository {
  public constructor(private readonly client: PrismaClient) {}

  public async getRecommendationBatch(
    batchId?: string,
  ): Promise<RecommendationBatchView | undefined> {
    const record = await this.client.recommendationBatch.findFirst({
      ...(batchId === undefined ? {} : { where: { id: batchId } }),
      orderBy: [{ evaluationTime: 'desc' }, { id: 'desc' }],
      include: {
        recommendations: {
          take: MAX_REPORT_RECOMMENDATIONS,
          orderBy: [{ rank: 'asc' }, { id: 'asc' }],
          include: {
            job: {
              select: {
                title: true,
                company: true,
                applicationUrl: true,
                canonicalApplicationUrl: true,
                locations: true,
                remotePolicy: true,
                salaryMinimum: true,
                salaryMaximum: true,
                salaryCurrency: true,
                salaryPeriod: true,
                publishedAt: true,
                currentStatus: true,
                updatedAt: true,
                statusHistory: {
                  take: 1,
                  orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
                },
              },
            },
            score: { include: { components: { orderBy: { key: 'asc' } } } },
          },
        },
      },
    });
    return record === null ? undefined : mapBatch(record);
  }

  public async getRecommendationDetails(
    recommendationId: string,
  ): Promise<RecommendationDetails | undefined> {
    const record = await this.client.recommendation.findUnique({
      where: { id: recommendationId },
      include: {
        batch: true,
        job: {
          include: {
            sourceReferences: {
              take: 20,
              orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
            },
            statusHistory: {
              orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
            },
          },
        },
        score: {
          include: {
            components: { orderBy: { key: 'asc' } },
            processingDecision: true,
          },
        },
      },
    });
    if (record === null) return undefined;
    const evaluation =
      record.batch === null
        ? null
        : await this.client.recommendationEvaluation.findUnique({
            where: {
              batchId_jobId: {
                batchId: record.batch.id,
                jobId: record.jobId,
              },
            },
          });
    return mapDetails(record, evaluation);
  }

  public async updateApplicationStatus(
    input: UpdateApplicationStatusInput,
  ): Promise<UpdateApplicationStatusResult | undefined> {
    return this.client.$transaction(async (transaction) => {
      const recommendation = await transaction.recommendation.findUnique({
        where: { id: input.recommendationId },
        select: { jobId: true },
      });
      if (recommendation === null) return undefined;
      const result = await new PrismaJobRepository(transaction).updateStatus({
        jobId: recommendation.jobId,
        targetStatus: input.targetStatus,
        changedAt: input.changedAt,
        reason: input.reason,
      });
      return {
        changed: result.changed,
        jobId: result.job.id,
        currentStatus: result.job.currentStatus,
      };
    });
  }

  public async getLatestPipelineState(): Promise<LatestPipelineState> {
    const [collection, processing, recommendations] = await Promise.all([
      this.client.collectionRun.findFirst({
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        include: { sourceResults: { select: { status: true } } },
      }),
      this.client.jobProcessingRun.findFirst({
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      }),
      this.client.recommendationBatch.findFirst({
        orderBy: [{ evaluationTime: 'desc' }, { id: 'desc' }],
        include: {
          evaluations: {
            orderBy: [{ totalScore: 'desc' }, { jobId: 'asc' }],
            include: { job: { select: { title: true, company: true } } },
          },
          _count: { select: { evaluations: true } },
        },
      }),
    ]);
    return {
      ...(collection === null
        ? {}
        : {
            collection: {
              runId: collection.id,
              status: collection.status,
              startedAt: collection.startedAt.toISOString(),
              ...(collection.completedAt === null
                ? {}
                : { completedAt: collection.completedAt.toISOString() }),
              sourcesAttempted: collection.sourceResults.length,
              sourcesSucceeded: collection.sourceResults.filter((result) =>
                ['COMPLETED', 'PARTIALLY_FAILED'].includes(result.status),
              ).length,
              sourcesFailed: collection.sourceResults.filter(
                (result) => result.status === 'FAILED',
              ).length,
              jobsCollected: collection.discoveredCount,
              jobsCreated: collection.insertedCount,
              jobsUpdated: collection.updatedCount,
            },
          }),
      ...(processing === null
        ? {}
        : {
            processing: {
              runId: processing.id,
              status: processing.status,
              startedAt: processing.startedAt.toISOString(),
              ...(processing.completedAt === null
                ? {}
                : { completedAt: processing.completedAt.toISOString() }),
              considered: processing.consideredCount,
              normalized: processing.normalizedCount,
              duplicates: processing.duplicateCount,
              possibleDuplicates: processing.possibleDuplicateCount,
              rejected: processing.rejectedCount,
              eligible: processing.eligibleCount,
              errors: processing.errorCount,
            },
          }),
      ...(recommendations === null
        ? {}
        : {
            recommendations: {
              batchId: recommendations.id,
              evaluationTime: recommendations.evaluationTime.toISOString(),
              selected: recommendations.selectedCount,
              requested: recommendations.requestedLimit,
              evaluated: recommendations._count.evaluations,
              outcomeCounts: recommendations.evaluations.reduce<
                Record<string, number>
              >((counts, evaluation) => {
                counts[evaluation.outcome] =
                  (counts[evaluation.outcome] ?? 0) + 1;
                return counts;
              }, {}),
              diagnostics: recommendations.evaluations
                .slice(0, 100)
                .map((evaluation) => ({
                  jobId: evaluation.jobId,
                  title: evaluation.job.title,
                  company: evaluation.job.company,
                  outcome: evaluation.outcome,
                  ...(evaluation.exclusionReason === null
                    ? {}
                    : { exclusionReason: evaluation.exclusionReason }),
                  threshold: Number(evaluation.threshold),
                  ...(evaluation.selectedTrackId === null
                    ? {}
                    : { selectedTrackId: evaluation.selectedTrackId }),
                  ...(evaluation.totalScore === null
                    ? {}
                    : { finalScore: Number(evaluation.totalScore) }),
                  ...(evaluation.candidateFitScore === null
                    ? {}
                    : {
                        candidateFitScore: Number(evaluation.candidateFitScore),
                      }),
                  ...(evaluation.opportunityScore === null
                    ? {}
                    : {
                        opportunityScore: Number(evaluation.opportunityScore),
                      }),
                })),
            },
          }),
    };
  }
}

function mapBatch(record: ReportBatchRecord): RecommendationBatchView {
  return {
    id: record.id,
    evaluationTime: record.evaluationTime.toISOString(),
    requestedLimit: record.requestedLimit,
    selectedCount: record.selectedCount,
    createdAt: record.createdAt.toISOString(),
    items: record.recommendations.map((recommendation) => {
      const score = mapRecommendationScore(recommendation.score);
      const latestStatus = recommendation.job.statusHistory[0]?.changedAt;
      return {
        recommendationId: recommendation.id,
        jobId: recommendation.jobId,
        rank: recommendation.rank,
        title: recommendation.job.title,
        company: recommendation.job.company,
        selectedTrackId: recommendation.searchTrackId,
        finalScore: score.totalScore,
        opportunityScore: score.opportunityScore,
        ...locationFields(recommendation.job.locations),
        ...(recommendation.job.remotePolicy === null
          ? {}
          : { remotePolicy: recommendation.job.remotePolicy }),
        ...salaryFields(recommendation.job),
        ...(recommendation.job.publishedAt === null
          ? {}
          : { publishedAt: recommendation.job.publishedAt.toISOString() }),
        ...safeUrlField(
          recommendation.job.canonicalApplicationUrl ??
            recommendation.job.applicationUrl,
          'applicationUrl',
        ),
        currentStatus: requireStatus(recommendation.job.currentStatus),
        statusUpdatedAt: (
          latestStatus ?? recommendation.job.updatedAt
        ).toISOString(),
        positives: score.positiveReasons.slice(0, 3),
        concerns: score.concerns.slice(0, 3),
        missingDataCount: score.missingData.length,
        generatedAt: recommendation.generatedAt.toISOString(),
      };
    }),
  };
}

function mapDetails(
  record: ReportDetailsRecord,
  evaluation: ReportEvaluationRecord | null,
): RecommendationDetails {
  const normalized = parseNormalizedPayload(record.job.normalizedPayload);
  const score = mapRecommendationScore(record.score);
  const remotePolicy =
    normalized?.location.remotePolicy ?? record.job.remotePolicy ?? undefined;
  const employmentType =
    normalized?.employmentType ?? record.job.employmentType ?? undefined;
  return {
    recommendationId: record.id,
    batchId: record.batchId ?? record.recommendationBatch,
    jobId: record.jobId,
    rank: record.rank,
    originalTitle: normalized?.originalTitle ?? record.job.title,
    normalizedTitle: normalized?.normalizedTitle ?? record.job.normalizedTitle,
    company: normalized?.normalizedCompany ?? record.job.company,
    ...(normalized?.location.originalText === undefined
      ? locationFields(record.job.locations)
      : { location: normalized.location.originalText }),
    ...(remotePolicy === undefined ? {} : { remotePolicy }),
    ...(employmentType === undefined ? {} : { employmentType }),
    ...salaryFields(record.job),
    experienceRequirements:
      normalized?.experienceRequirements.map(formatRequirement) ?? [],
    educationRequirements:
      normalized?.educationRequirements.map(formatRequirement) ?? [],
    languages:
      normalized?.languageRequirements.map(
        (item) =>
          `${item.name} (${item.proficiency}, ${item.requirement.toLowerCase()})`,
      ) ?? [],
    skills:
      normalized?.skillRequirements.map(
        (item) => `${item.canonicalName} (${item.requirement.toLowerCase()})`,
      ) ?? [],
    ...safeUrlField(
      record.job.canonicalApplicationUrl ?? record.job.applicationUrl,
      'applicationUrl',
    ),
    ...safeUrlField(
      normalized?.sourceUrl ?? record.job.sourceReferences[0]?.sourceUrl,
      'sourceUrl',
    ),
    ...(record.job.description === null
      ? {}
      : { description: record.job.description }),
    selectedTrackId: record.searchTrackId,
    finalScore: score.totalScore,
    ...(evaluation?.candidateFitScore === null || evaluation === null
      ? {}
      : { candidateFitScore: Number(evaluation.candidateFitScore) }),
    opportunityScore: score.opportunityScore,
    ...(evaluation === null
      ? {}
      : {
          threshold: Number(evaluation.threshold),
          evaluationOutcome: evaluation.outcome,
          alternativeTrackEvaluations: formatTrackEvaluations(
            evaluation.trackEvaluations,
          ),
        }),
    completeness: score.completeness,
    components: score.components.map((component) => ({
      key: component.key,
      score: component.rawScore,
      weight: component.weight,
      contribution: component.contribution,
      confidence: component.confidence,
      reasons: component.reasons,
    })),
    positives: score.positiveReasons,
    concerns: score.concerns,
    missingData: score.missingData,
    currentStatus: requireStatus(record.job.currentStatus),
    statusHistory: record.job.statusHistory.map(mapStatusHistory),
    ...(record.score.processingDecision?.processedAt === undefined
      ? {}
      : {
          processedAt:
            record.score.processingDecision.processedAt.toISOString(),
        }),
    generatedAt: record.generatedAt.toISOString(),
    ...(record.job.normalizedAt === null
      ? {}
      : { normalizedAt: record.job.normalizedAt.toISOString() }),
  };
}

function formatTrackEvaluations(value: unknown): readonly string[] {
  const parsed: unknown = fromPrismaJson(value);
  if (!isUnknownArray(parsed)) return [];
  return parsed.flatMap((item): readonly string[] => {
    if (!isUnknownRecord(item)) return [];
    const trackId = item['trackId'];
    const finalScore = item['finalScore'];
    const valid = item['validMatch'];
    if (
      typeof trackId !== 'string' ||
      typeof finalScore !== 'number' ||
      typeof valid !== 'boolean'
    )
      return [];
    return [
      `${trackId}: ${finalScore.toFixed(2)} (${valid ? 'valid' : 'no match'})`,
    ];
  });
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isUnknownRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mapStatusHistory(
  record: ReportDetailsRecord['job']['statusHistory'][number],
): StatusHistoryView {
  return {
    id: record.id,
    ...(record.fromStatus === null
      ? {}
      : { fromStatus: requireStatus(record.fromStatus) }),
    toStatus: requireStatus(record.toStatus),
    changedAt: record.changedAt.toISOString(),
    ...(record.reason === null ? {} : { reason: record.reason }),
  };
}

function requireStatus(value: string): JobStatus {
  if (!isJobStatus(value)) throw new Error('Stored job status is invalid.');
  return value;
}

function safeUrlField<Key extends 'applicationUrl' | 'sourceUrl'>(
  value: string | null | undefined,
  key: Key,
): Partial<Record<Key, string>> {
  if (value === null || value === undefined) return {};
  const normalized = normalizePublicUrlValue(value);
  return normalized.status === 'SUCCESS'
    ? ({ [key]: normalized.value } as Record<Key, string>)
    : {};
}

function locationFields(value: unknown): { readonly location?: string } {
  const json = fromPrismaJson(value);
  if (!Array.isArray(json)) return {};
  const locations = json.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (!isJsonObject(item)) return [];
    const candidate = [item['city'], item['region'], item['country']]
      .filter((part): part is string => typeof part === 'string')
      .join(', ');
    return candidate.length === 0 ? [] : [candidate];
  });
  return locations.length === 0 ? {} : { location: locations.join(' · ') };
}

function salaryFields(record: {
  readonly salaryMinimum: { toNumber(): number } | null;
  readonly salaryMaximum: { toNumber(): number } | null;
  readonly salaryCurrency: string | null;
  readonly salaryPeriod: string | null;
}): { readonly salarySummary?: string } {
  const minimum = record.salaryMinimum?.toNumber();
  const maximum = record.salaryMaximum?.toNumber();
  if (minimum === undefined && maximum === undefined) return {};
  const amount =
    minimum !== undefined && maximum !== undefined
      ? `${minimum.toLocaleString('en-US')}–${maximum.toLocaleString('en-US')}`
      : `${(minimum ?? maximum)?.toLocaleString('en-US')}`;
  return {
    salarySummary: [record.salaryCurrency, amount, record.salaryPeriod]
      .filter((part): part is string => part !== null)
      .join(' '),
  };
}

function parseNormalizedPayload(
  value: unknown,
): EnrichedNormalizedJob | undefined {
  if (value === null) return undefined;
  const json = fromPrismaJson(value);
  if (
    !isJsonObject(json) ||
    typeof json['id'] !== 'string' ||
    !Array.isArray(json['experienceRequirements']) ||
    !Array.isArray(json['educationRequirements']) ||
    !Array.isArray(json['languageRequirements']) ||
    !Array.isArray(json['skillRequirements'])
  )
    return undefined;
  return json as unknown as EnrichedNormalizedJob;
}

function isJsonObject(
  value: unknown,
): value is Readonly<
  Record<string, import('../../domain/index.js').JsonValue>
> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatRequirement(value: object): string {
  return Object.entries(value)
    .filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item))
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(', ');
}
