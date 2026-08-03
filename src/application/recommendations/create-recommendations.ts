import {
  SCORING_VERSION,
  SELECTOR_VERSION,
  evaluateTracks,
  selectDiverseRecommendations,
} from '../../domain/index.js';
import type { Clock } from '../collection/ports.js';
import type { ProcessingHasher } from '../processing/ports.js';
import type {
  CreateRecommendationsInput,
  PersistedRecommendationBatch,
  RecommendationCandidateRecord,
} from './models.js';
import { MAX_SCORING_CANDIDATES } from './models.js';
import type { RecommendationBatchRepository } from './ports.js';

export class CreateRecommendations {
  public constructor(
    private readonly repository: RecommendationBatchRepository,
    private readonly clock: Clock,
    private readonly hasher: ProcessingHasher,
  ) {}

  public async execute(
    input: CreateRecommendationsInput,
  ): Promise<PersistedRecommendationBatch> {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 1_000
    )
      throw new RangeError(
        'Recommendation limit must be an integer from 1 through 1000.',
      );
    const evaluationTime = this.clock.now().toISOString();
    const candidates = input.signal.aborted
      ? []
      : await this.repository.listEligibleCandidates(MAX_SCORING_CANDIDATES);
    const evaluated = candidates.map((record) => {
      const source = sourceContext(record, input.sources);
      const tracks = relevantTracks(
        source.trackIds,
        source.trackPolicy ?? 'strict',
        input.search.tracks,
      );
      if (tracks.length === 0)
        return {
          kind: 'unscored' as const,
          record,
          source,
          trackEvaluations: [],
          exclusionReason: 'NO_PERMITTED_TRACKS',
        };
      const result = evaluateTracks({
        job: record.normalizedJob,
        candidate: input.candidate,
        tracks,
        search: input.search,
        scoring: input.scoring,
        source,
        evaluationTime,
      });
      return result.score === undefined
        ? {
            kind: 'unscored' as const,
            record,
            source,
            trackEvaluations: result.evaluations,
            exclusionReason: result.exclusionReason,
          }
        : {
            kind: 'scored' as const,
            jobId: record.jobId,
            normalizedCompany: record.normalizedJob.companyComparisonKey,
            normalizedTitle: record.normalizedJob.titleComparisonKey,
            currentStatus: record.currentStatus,
            score: result.score,
            record,
            source,
            trackEvaluations: result.evaluations,
          };
    });
    const scored = evaluated.filter((item) => item.kind === 'scored');
    const selectorCandidates = scored.filter((item) => {
      const track = input.search.tracks.find(
        (candidate) => candidate.id === item.score.selectedTrackId,
      );
      const threshold = Math.max(
        input.search.preferences.minimumAcceptableScore,
        track?.minimumScore ?? 0,
      );
      return item.score.totalScore >= threshold;
    });
    const selected = selectDiverseRecommendations({
      candidates: selectorCandidates,
      limit: input.limit,
      minimumScore: input.search.preferences.minimumAcceptableScore,
      maximumPerCompany:
        input.search.preferences.maximumRecommendationsPerCompany,
      maximumSameTitle: input.scoring.settings.selector.maximumSameTitle,
      unknownCompanyJobsShareCap:
        input.scoring.settings.selector.unknownCompanyJobsShareCap,
      quotas: input.search.tracks
        .filter(
          (track) => track.enabled && track.recommendationQuota !== undefined,
        )
        .map((track) => ({
          trackId: track.id,
          count: track.recommendationQuota ?? 0,
        })),
    });
    const configurationFingerprint = this.hasher.sha256(
      stableSerialize({
        candidate: input.candidate,
        search: input.search,
        scoring: input.scoring,
        sources: input.sources,
      }),
    );
    const scoredByJobId = new Map(
      scored.map((candidate) => [candidate.jobId, candidate]),
    );
    const inputHash = this.hasher.sha256(
      stableSerialize({
        evaluationTime,
        requestedLimit: input.limit,
        configurationFingerprint,
        candidates: candidates
          .map((item) => ({
            jobId: item.jobId,
            processingDecisionId: item.processingDecisionId,
            inputRevisionNumber: item.inputRevisionNumber,
            currentStatus: item.currentStatus,
          }))
          .sort((left, right) => compareText(left.jobId, right.jobId)),
      }),
    );
    return this.repository.saveBatch({
      inputHash,
      evaluationTime,
      requestedLimit: input.limit,
      configurationFingerprint,
      scoringVersion: SCORING_VERSION,
      selectorVersion: SELECTOR_VERSION,
      items: selected.map((item) => {
        const source = scoredByJobId.get(item.jobId);
        if (source === undefined)
          throw new Error('Selected recommendation lost its source record.');
        return {
          jobId: item.jobId,
          processingDecisionId: source.record.processingDecisionId,
          inputRevisionNumber: source.record.inputRevisionNumber,
          rank: item.rank,
          score: item.score,
        };
      }),
      evaluations: evaluated.map((item) => {
        const selectedItem = selected.find(
          (candidate) => candidate.jobId === item.record.jobId,
        );
        if (item.kind === 'unscored')
          return {
            jobId: item.record.jobId,
            processingDecisionId: item.record.processingDecisionId,
            inputRevisionNumber: item.record.inputRevisionNumber,
            outcome: 'NO_VALID_TRACK_MATCH' as const,
            exclusionReason: item.exclusionReason ?? 'NO_VALID_TRACK_MATCH',
            threshold: input.search.preferences.minimumAcceptableScore,
            trackEvaluations: item.trackEvaluations,
          };
        const track = input.search.tracks.find(
          (candidate) => candidate.id === item.score.selectedTrackId,
        );
        const threshold = Math.max(
          input.search.preferences.minimumAcceptableScore,
          track?.minimumScore ?? 0,
        );
        const outcome =
          selectedItem !== undefined
            ? ('SELECTED' as const)
            : item.score.totalScore < threshold
              ? ('BELOW_MINIMUM_SCORE' as const)
              : ('SELECTOR_EXCLUDED' as const);
        return {
          jobId: item.record.jobId,
          processingDecisionId: item.record.processingDecisionId,
          inputRevisionNumber: item.record.inputRevisionNumber,
          outcome,
          ...(outcome === 'SELECTED'
            ? {}
            : {
                exclusionReason:
                  outcome === 'BELOW_MINIMUM_SCORE'
                    ? `SCORE_BELOW_${threshold}`
                    : 'DIVERSITY_OR_CAP',
              }),
          threshold,
          score: item.score,
          trackEvaluations: item.trackEvaluations,
        };
      }),
    });
  }
}

function relevantTracks(
  sourceTrackIds: readonly string[],
  policy: import('../../domain/index.js').SourceTrackPolicy,
  tracks: readonly import('../../domain/index.js').SearchTrack[],
) {
  const enabled = tracks.filter((track) => track.enabled);
  if (policy !== 'strict' || sourceTrackIds.length === 0) return enabled;
  return enabled.filter((track) => sourceTrackIds.includes(track.id));
}

function sourceContext(
  record: RecommendationCandidateRecord,
  sources: readonly import('./models.js').RecommendationSourceContext[],
) {
  const configured = sources.filter((source) =>
    record.sourceIds.includes(source.id),
  );
  if (configured.length === 0) return record.source;
  const unrestricted = configured.some(
    (source) =>
      source.trackPolicy === 'unrestricted' || source.trackIds.length === 0,
  );
  const trackPolicy = unrestricted
    ? ('unrestricted' as const)
    : configured.some((source) => source.trackPolicy === 'preferred')
      ? ('preferred' as const)
      : ('strict' as const);
  return {
    ...record.source,
    tags: [...new Set(configured.flatMap((source) => source.tags))].sort(
      compareText,
    ),
    trackIds: unrestricted
      ? []
      : [...new Set(configured.flatMap((source) => source.trackIds))].sort(
          compareText,
        ),
    trackPolicy,
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFKC'));
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  throw new TypeError('Recommendation fingerprint input is not serializable.');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
