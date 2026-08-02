import type { JobStatus } from './job-status.js';
import type { ScoreResult } from './score-result.js';

export const SELECTOR_VERSION = 'diversity-selector-v1';

export interface ScoredRecommendationCandidate {
  readonly jobId: string;
  readonly normalizedCompany: string;
  readonly normalizedTitle: string;
  readonly currentStatus: JobStatus;
  readonly score: ScoreResult;
}

export interface TrackQuota {
  readonly trackId: string;
  readonly count: number;
}

export interface DiversitySelectionInput {
  readonly candidates: readonly ScoredRecommendationCandidate[];
  readonly limit: number;
  readonly minimumScore: number;
  readonly maximumPerCompany: number;
  readonly maximumSameTitle: number;
  readonly unknownCompanyJobsShareCap: boolean;
  readonly quotas: readonly TrackQuota[];
}

export interface SelectedRecommendation extends ScoredRecommendationCandidate {
  readonly rank: number;
}

export function selectDiverseRecommendations(
  input: DiversitySelectionInput,
): readonly SelectedRecommendation[] {
  assertPositiveInteger(input.limit, 'limit');
  assertPositiveInteger(input.maximumPerCompany, 'maximumPerCompany');
  assertPositiveInteger(input.maximumSameTitle, 'maximumSameTitle');
  if (
    !Number.isFinite(input.minimumScore) ||
    input.minimumScore < 0 ||
    input.minimumScore > 100
  )
    throw new RangeError('minimumScore must be from 0 through 100.');
  const pool = input.candidates
    .filter(
      (item) =>
        item.currentStatus !== 'APPLIED' &&
        item.currentStatus !== 'SKIPPED' &&
        item.score.totalScore >= input.minimumScore,
    )
    .sort(candidateOrder);
  const selected: ScoredRecommendationCandidate[] = [];
  const selectedIds = new Set<string>();
  const companyCounts = new Map<string, number>();
  const titleCounts = new Map<string, number>();
  const add = (candidate: ScoredRecommendationCandidate): boolean => {
    if (selected.length >= input.limit || selectedIds.has(candidate.jobId))
      return false;
    const company = companyGroup(candidate, input.unknownCompanyJobsShareCap);
    const title = normalizedGroup(
      candidate.normalizedTitle,
      `unknown-title:${candidate.jobId}`,
    );
    if ((companyCounts.get(company) ?? 0) >= input.maximumPerCompany)
      return false;
    if ((titleCounts.get(title) ?? 0) >= input.maximumSameTitle) return false;
    selected.push(candidate);
    selectedIds.add(candidate.jobId);
    companyCounts.set(company, (companyCounts.get(company) ?? 0) + 1);
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
    return true;
  };
  for (const quota of [...input.quotas].sort((left, right) =>
    compareText(left.trackId, right.trackId),
  )) {
    if (!Number.isInteger(quota.count) || quota.count < 0)
      throw new RangeError('Track quota counts must be non-negative integers.');
    let filled = 0;
    for (const candidate of pool) {
      if (candidate.score.selectedTrackId !== quota.trackId) continue;
      if (add(candidate)) filled += 1;
      if (filled >= quota.count || selected.length >= input.limit) break;
    }
  }
  for (const candidate of pool) {
    add(candidate);
    if (selected.length >= input.limit) break;
  }
  return selected.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
  }));
}

function candidateOrder(
  left: ScoredRecommendationCandidate,
  right: ScoredRecommendationCandidate,
): number {
  return (
    right.score.totalScore - left.score.totalScore ||
    right.score.opportunityScore - left.score.opportunityScore ||
    componentScore(right.score, 'freshness') -
      componentScore(left.score, 'freshness') ||
    right.score.completeness - left.score.completeness ||
    compareText(left.jobId, right.jobId)
  );
}

function componentScore(score: ScoreResult, key: string): number {
  return (
    score.components.find((component) => component.key === key)?.rawScore ?? 0
  );
}

function companyGroup(
  candidate: ScoredRecommendationCandidate,
  unknownsShareCap: boolean,
): string {
  return normalizedGroup(
    candidate.normalizedCompany,
    unknownsShareCap ? 'unknown-company' : `unknown-company:${candidate.jobId}`,
  );
}

function normalizedGroup(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized.length === 0 ? fallback : normalized;
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1)
    throw new RangeError(`${field} must be a positive integer.`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
