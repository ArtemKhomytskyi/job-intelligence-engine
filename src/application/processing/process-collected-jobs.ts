import {
  evaluateHardFilters,
  FILTER_RULES_VERSION,
  NORMALIZATION_VERSION,
  PROCESSING_FINGERPRINT_VERSION,
  normalizeJobForProcessing,
  type DuplicateDecision,
  type DuplicateEvidence,
  type EnrichedNormalizedJob,
} from '../../domain/index.js';
import type { Clock, Logger } from '../collection/ports.js';
import {
  createProcessingConfigFingerprint,
  createProcessingJobFingerprint,
} from './fingerprints.js';
import type {
  ProcessCollectedJobsInput,
  ProcessingDecisionKey,
  ProcessingRunSummary,
  ProcessingStatus,
} from './models.js';
import type { ProcessingHasher, ProcessingRepository } from './ports.js';

export const MAX_POSSIBLE_DUPLICATE_CANDIDATES = 20;

export class ProcessCollectedJobs {
  public constructor(
    private readonly repository: ProcessingRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly hasher: ProcessingHasher,
  ) {}

  public async execute(
    input: ProcessCollectedJobsInput,
  ): Promise<ProcessingRunSummary> {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 10_000
    )
      throw new RangeError(
        'Processing limit must be an integer from 1 through 10000.',
      );
    const startedAt = this.clock.now().toISOString();
    const configFingerprint = createProcessingConfigFingerprint(
      input.candidate,
      input.hardFilters,
      this.hasher,
    );
    const run = await this.repository.createRun({
      startedAt,
      initiatedBy: input.initiatedBy,
      normalizationVersion: NORMALIZATION_VERSION,
      fingerprintVersion: PROCESSING_FINGERPRINT_VERSION,
      filterRulesVersion: FILTER_RULES_VERSION,
      configFingerprint,
    });
    this.logger.info('job_processing_run_started', {
      runId: run.id,
      limit: input.limit,
    });
    const counts = {
      consideredCount: 0,
      normalizedCount: 0,
      normalizationFailedCount: 0,
      duplicateCount: 0,
      possibleDuplicateCount: 0,
      rejectedCount: 0,
      eligibleCount: 0,
      errorCount: 0,
      skippedCount: 0,
    };
    try {
      const jobs = await this.repository.listProcessableJobs(input.limit);
      counts.consideredCount = jobs.length;
      const existingKeys = new Set(
        (
          await this.repository.listExistingDecisionKeys({
            jobIds: jobs.map((job) => job.id),
            normalizationVersion: NORMALIZATION_VERSION,
            fingerprintVersion: PROCESSING_FINGERPRINT_VERSION,
            filterRulesVersion: FILTER_RULES_VERSION,
            configFingerprint,
          })
        ).map(decisionKey),
      );
      const hasPendingDecision = jobs.some(
        (job) =>
          !existingKeys.has(
            decisionKey({
              jobId: job.id,
              inputRevisionNumber: job.inputRevisionNumber,
              normalizationVersion: NORMALIZATION_VERSION,
              fingerprintVersion: PROCESSING_FINGERPRINT_VERSION,
              filterRulesVersion: FILTER_RULES_VERSION,
              configFingerprint,
            }),
          ),
      );
      let cancelled = input.signal.aborted;
      const normalized =
        hasPendingDecision && !cancelled
          ? jobs.map((job) => ({
              input: job,
              result: normalizeJobForProcessing(
                job,
                input.hardFilters,
                startedAt,
              ),
            }))
          : [];
      if (!hasPendingDecision && !cancelled) counts.skippedCount = jobs.length;
      const successful = normalized.flatMap((item) =>
        item.result.status === 'SUCCESS' ? [item.result.job] : [],
      );
      const duplicates = classifyDuplicates(successful, this.hasher);
      for (const item of normalized) {
        if (input.signal.aborted) {
          cancelled = true;
          break;
        }
        const key: ProcessingDecisionKey = {
          jobId: item.input.id,
          inputRevisionNumber: item.input.inputRevisionNumber,
          normalizationVersion: NORMALIZATION_VERSION,
          fingerprintVersion: PROCESSING_FINGERPRINT_VERSION,
          filterRulesVersion: FILTER_RULES_VERSION,
          configFingerprint,
        };
        if (existingKeys.has(decisionKey(key))) {
          counts.skippedCount += 1;
          continue;
        }
        try {
          if (item.result.status === 'FAILED') {
            const outcome = await this.repository.saveDecision({
              ...key,
              runId: run.id,
              processingStatus: 'NORMALIZATION_FAILED',
              processedAt: this.clock.now().toISOString(),
              normalizationIssues: item.result.issues,
            });
            if (outcome === 'ALREADY_EXISTS') {
              counts.skippedCount += 1;
              continue;
            }
            counts.normalizationFailedCount += 1;
            this.logger.warn('job_normalization_failed', {
              runId: run.id,
              jobId: item.input.id,
            });
            continue;
          }
          const duplicate = duplicates.get(item.input.id) ?? {
            decision: 'UNIQUE',
            evidence: [],
          };
          const processingFingerprint = createProcessingJobFingerprint(
            item.result.job,
            this.hasher,
          );
          const filterResult =
            duplicate.decision === 'DUPLICATE'
              ? undefined
              : evaluateHardFilters({
                  job: item.result.job,
                  candidate: input.candidate,
                  configuration: input.hardFilters,
                  processingTime: startedAt,
                });
          const status = processingStatus(duplicate, filterResult);
          const outcome = await this.repository.saveDecision({
            ...key,
            runId: run.id,
            processingStatus: status,
            processedAt: this.clock.now().toISOString(),
            normalizedJob: item.result.job,
            normalizationIssues: item.result.issues,
            processingFingerprint,
            duplicateDecision: duplicate,
            ...(filterResult === undefined
              ? {}
              : { hardFilterResult: filterResult }),
          });
          if (outcome === 'ALREADY_EXISTS') {
            counts.skippedCount += 1;
            continue;
          }
          counts.normalizedCount += 1;
          increment(counts, status);
          if (status === 'DUPLICATE' || status === 'POSSIBLE_DUPLICATE')
            this.logger.info(
              status === 'DUPLICATE'
                ? 'job_duplicate_detected'
                : 'job_possible_duplicate_detected',
              { runId: run.id, jobId: item.input.id },
            );
          if (status === 'REJECTED')
            this.logger.info('job_hard_filter_rejected', {
              runId: run.id,
              jobId: item.input.id,
              reasonCount: filterResult?.reasons.length ?? 0,
            });
        } catch (error: unknown) {
          this.logger.warn('job_processing_failed', {
            runId: run.id,
            jobId: item.input.id,
            errorCode: error instanceof Error ? error.name : 'PROCESSING_ERROR',
          });
          const outcome = await this.repository.saveDecision({
            ...key,
            runId: run.id,
            processingStatus: 'ERROR',
            processedAt: this.clock.now().toISOString(),
            normalizationIssues: item.result.issues,
            errorCode: error instanceof Error ? error.name : 'PROCESSING_ERROR',
            errorMessage: 'Job processing failed. See structured diagnostics.',
          });
          if (outcome === 'ALREADY_EXISTS') counts.skippedCount += 1;
          else counts.errorCount += 1;
        }
      }
      const completedAt = this.clock.now().toISOString();
      const status = cancelled
        ? 'CANCELLED'
        : counts.errorCount === 0
          ? 'COMPLETED'
          : counts.errorCount < counts.consideredCount
            ? 'PARTIALLY_FAILED'
            : 'FAILED';
      await this.repository.completeRun({
        runId: run.id,
        completedAt,
        status,
        consideredCount: counts.consideredCount,
        normalizedCount: counts.normalizedCount,
        normalizationFailedCount: counts.normalizationFailedCount,
        duplicateCount: counts.duplicateCount,
        possibleDuplicateCount: counts.possibleDuplicateCount,
        rejectedCount: counts.rejectedCount,
        eligibleCount: counts.eligibleCount,
        errorCount: counts.errorCount,
        skippedCount: counts.skippedCount,
      });
      this.logger.info('job_processing_run_completed', {
        runId: run.id,
        status,
        consideredCount: counts.consideredCount,
        errorCount: counts.errorCount,
      });
      return { runId: run.id, startedAt, completedAt, status, ...counts };
    } catch (error: unknown) {
      try {
        await this.repository.completeRun({
          runId: run.id,
          completedAt: this.clock.now().toISOString(),
          status: 'FAILED',
          ...counts,
        });
      } catch (completionError: unknown) {
        this.logger.error('job_processing_run_completion_failed', {
          runId: run.id,
          errorCode:
            completionError instanceof Error
              ? completionError.name
              : 'PROCESSING_ERROR',
        });
      }
      this.logger.error('job_processing_run_failed', {
        runId: run.id,
        errorCode: error instanceof Error ? error.name : 'PROCESSING_ERROR',
      });
      throw error;
    }
  }
}

function classifyDuplicates(
  jobs: readonly EnrichedNormalizedJob[],
  hasher: ProcessingHasher,
): ReadonlyMap<string, DuplicateDecision> {
  const decisions = new Map<string, DuplicateDecision>();
  const ordered = [...jobs].sort(primaryOrder);
  const sourceExternal = new Map<string, EnrichedNormalizedJob>();
  const canonicalUrls = new Map<string, EnrichedNormalizedJob>();
  const composites = new Map<string, EnrichedNormalizedJob[]>();
  const fingerprints = new Map<string, EnrichedNormalizedJob[]>();
  for (const job of ordered) {
    const sourceExternalKey =
      job.sourceId === undefined || job.externalId === undefined
        ? undefined
        : `${job.sourceId}\u0000${job.externalId}`;
    const identityMatch =
      sourceExternalKey === undefined
        ? undefined
        : sourceExternal.get(sourceExternalKey);
    if (identityMatch !== undefined) {
      decisions.set(job.id, {
        decision: 'DUPLICATE',
        primaryJobId: identityMatch.id,
        evidence: [evidence('SOURCE_EXTERNAL_ID', identityMatch, job)],
      });
      continue;
    }
    const urlMatch = canonicalUrls.get(job.canonicalApplicationUrl);
    if (urlMatch !== undefined) {
      decisions.set(job.id, {
        decision: 'DUPLICATE',
        primaryJobId: urlMatch.id,
        evidence: [evidence('CANONICAL_APPLICATION_URL', urlMatch, job)],
      });
      continue;
    }
    const compositeKey = [
      job.companyComparisonKey,
      job.titleComparisonKey,
      job.location.normalizedKey,
    ].join('\u0000');
    const compositeMatches = composites.get(compositeKey) ?? [];
    const fingerprint = createProcessingJobFingerprint(job, hasher);
    const fingerprintMatch = hasSubstantiveDescription(job)
      ? fingerprints.get(fingerprint)?.[0]
      : undefined;
    if (fingerprintMatch !== undefined) {
      decisions.set(job.id, {
        decision: 'DUPLICATE',
        primaryJobId: fingerprintMatch.id,
        evidence: [evidence('STABLE_FINGERPRINT', fingerprintMatch, job)],
      });
      continue;
    }
    const possibleMatches = boundedDistinctMatches(compositeMatches);
    decisions.set(
      job.id,
      possibleMatches.length === 0
        ? { decision: 'UNIQUE', evidence: [] }
        : {
            decision: 'POSSIBLE_DUPLICATE',
            candidateJobIds: possibleMatches.map((candidate) => candidate.id),
            evidence: possibleMatches.map((candidate) =>
              evidence('COMPANY_TITLE_LOCATION', candidate, job),
            ),
          },
    );
    if (sourceExternalKey !== undefined)
      sourceExternal.set(sourceExternalKey, job);
    canonicalUrls.set(job.canonicalApplicationUrl, job);
    appendBounded(composites, compositeKey, job);
    if (hasSubstantiveDescription(job))
      appendBounded(fingerprints, fingerprint, job);
  }
  return decisions;
}

function hasSubstantiveDescription(job: EnrichedNormalizedJob): boolean {
  return job.description !== undefined && job.description.trim().length > 0;
}

function appendBounded(
  index: Map<string, EnrichedNormalizedJob[]>,
  key: string,
  job: EnrichedNormalizedJob,
): void {
  const matches = index.get(key) ?? [];
  if (matches.length < MAX_POSSIBLE_DUPLICATE_CANDIDATES) matches.push(job);
  if (!index.has(key)) index.set(key, matches);
}

function boundedDistinctMatches(
  matches: readonly EnrichedNormalizedJob[],
): readonly EnrichedNormalizedJob[] {
  const distinct = new Map<string, EnrichedNormalizedJob>();
  for (const match of matches) {
    if (!distinct.has(match.id)) distinct.set(match.id, match);
    if (distinct.size === MAX_POSSIBLE_DUPLICATE_CANDIDATES) break;
  }
  return [...distinct.values()];
}

function evidence(
  layer: DuplicateEvidence['layer'],
  matched: EnrichedNormalizedJob,
  job: EnrichedNormalizedJob,
): DuplicateEvidence {
  return {
    layer,
    matchedJobId: matched.id,
    details: evidenceDetails(layer),
    comparedValues: {
      canonicalApplicationUrl: job.canonicalApplicationUrl,
      company: job.companyComparisonKey,
      title: job.titleComparisonKey,
      location: job.location.normalizedKey,
    },
  };
}

function evidenceDetails(layer: DuplicateEvidence['layer']): string {
  if (layer === 'SOURCE_EXTERNAL_ID')
    return 'Source and external identifier match exactly.';
  if (layer === 'CANONICAL_APPLICATION_URL')
    return 'Canonical application URLs match exactly.';
  if (layer === 'STABLE_FINGERPRINT')
    return 'Versioned normalized-job fingerprints match exactly.';
  return 'Normalized company, title, and location keys match; retained for review.';
}

function primaryOrder(
  left: EnrichedNormalizedJob,
  right: EnrichedNormalizedJob,
): number {
  const byFirstSeen = left.firstSeenAt.localeCompare(right.firstSeenAt);
  return byFirstSeen === 0 ? left.id.localeCompare(right.id) : byFirstSeen;
}

function processingStatus(
  duplicate: DuplicateDecision,
  filter: ReturnType<typeof evaluateHardFilters> | undefined,
): ProcessingStatus {
  if (duplicate.decision === 'DUPLICATE') return 'DUPLICATE';
  if (filter?.decision === 'REJECTED') return 'REJECTED';
  return duplicate.decision === 'POSSIBLE_DUPLICATE'
    ? 'POSSIBLE_DUPLICATE'
    : 'ELIGIBLE';
}

function increment(
  counts: {
    duplicateCount: number;
    possibleDuplicateCount: number;
    rejectedCount: number;
    eligibleCount: number;
  },
  status: ProcessingStatus,
): void {
  if (status === 'DUPLICATE') counts.duplicateCount += 1;
  else if (status === 'POSSIBLE_DUPLICATE') counts.possibleDuplicateCount += 1;
  else if (status === 'REJECTED') counts.rejectedCount += 1;
  else if (status === 'ELIGIBLE') counts.eligibleCount += 1;
}

function decisionKey(input: ProcessingDecisionKey): string {
  return [
    input.jobId,
    input.inputRevisionNumber,
    input.normalizationVersion,
    input.fingerprintVersion,
    input.filterRulesVersion,
    input.configFingerprint,
  ].join('\u0000');
}
