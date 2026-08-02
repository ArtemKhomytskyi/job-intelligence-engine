import {
  SCORING_VERSION,
  SELECTOR_VERSION,
  selectBestTrack,
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
    const scored = candidates.flatMap((record) => {
      const source = sourceContext(record, input.sources);
      const tracks = relevantTracks(source.trackIds, input.search.tracks);
      if (tracks.length === 0) return [];
      const score = selectBestTrack({
        job: record.normalizedJob,
        candidate: input.candidate,
        tracks,
        search: input.search,
        scoring: input.scoring,
        source,
        evaluationTime,
      });
      return [
        {
          jobId: record.jobId,
          normalizedCompany: record.normalizedJob.companyComparisonKey,
          normalizedTitle: record.normalizedJob.titleComparisonKey,
          currentStatus: record.currentStatus,
          score,
          record,
        },
      ];
    });
    const selected = selectDiverseRecommendations({
      candidates: scored,
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
    });
  }
}

function relevantTracks(
  sourceTrackIds: readonly string[],
  tracks: readonly import('../../domain/index.js').SearchTrack[],
) {
  return tracks.filter(
    (track) =>
      track.enabled &&
      (sourceTrackIds.length === 0 || sourceTrackIds.includes(track.id)),
  );
}

function sourceContext(
  record: RecommendationCandidateRecord,
  sources: readonly import('../../domain/index.js').SourceConfig[],
) {
  const configured = sources.filter((source) =>
    record.sourceIds.includes(source.id),
  );
  if (configured.length === 0) return record.source;
  const unrestricted = configured.some(
    (source) => source.trackIds.length === 0,
  );
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
