import { isJobStatus } from '../../domain/index.js';
import {
  REPORT_SORTS,
  type RecommendationListItem,
  type RecommendationReportQuery,
  type ReportSort,
} from './models.js';

const TRACK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ReportQueryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ReportQueryError';
  }
}

export interface RawRecommendationReportQuery {
  readonly track?: string;
  readonly status?: string;
  readonly company?: string;
  readonly minimumScore?: string;
  readonly batch?: string;
  readonly sort?: string;
}

export function parseRecommendationReportQuery(
  input: RawRecommendationReportQuery,
): RecommendationReportQuery {
  const trackId = optionalTrimmed(input.track);
  if (trackId !== undefined && !TRACK_ID_PATTERN.test(trackId))
    throw new ReportQueryError('Track must be a stable lowercase track ID.');
  const status = optionalTrimmed(input.status);
  if (status !== undefined && !isJobStatus(status))
    throw new ReportQueryError(`Unknown job status "${status}".`);
  const company = optionalTrimmed(input.company);
  if (company !== undefined && company.length > 200)
    throw new ReportQueryError(
      'Company filter must not exceed 200 characters.',
    );
  const minimumScore = parseMinimumScore(input.minimumScore);
  const batchId = optionalTrimmed(input.batch);
  if (batchId !== undefined && !UUID_PATTERN.test(batchId))
    throw new ReportQueryError('Recommendation batch must be a valid UUID.');
  const sort = (optionalTrimmed(input.sort) ?? 'rank') as ReportSort;
  if (!REPORT_SORTS.some((candidate) => candidate === sort))
    throw new ReportQueryError(`Unknown report sort "${sort}".`);
  return {
    sort,
    ...(trackId === undefined ? {} : { trackId }),
    ...(status === undefined ? {} : { status }),
    ...(company === undefined ? {} : { company }),
    ...(minimumScore === undefined ? {} : { minimumScore }),
    ...(batchId === undefined ? {} : { batchId }),
  };
}

export function filterAndSortRecommendations(
  items: readonly RecommendationListItem[],
  query: RecommendationReportQuery,
): readonly RecommendationListItem[] {
  const company = query.company?.toLocaleLowerCase('en-US');
  return items
    .filter(
      (item) =>
        (query.trackId === undefined ||
          item.selectedTrackId === query.trackId) &&
        (query.status === undefined || item.currentStatus === query.status) &&
        (company === undefined ||
          item.company.toLocaleLowerCase('en-US').includes(company)) &&
        (query.minimumScore === undefined ||
          item.finalScore >= query.minimumScore),
    )
    .sort(comparator(query.sort));
}

function comparator(
  sort: ReportSort,
): (left: RecommendationListItem, right: RecommendationListItem) => number {
  return (left, right) => {
    let result = 0;
    switch (sort) {
      case 'rank':
        result = left.rank - right.rank;
        break;
      case 'score-desc':
        result = right.finalScore - left.finalScore;
        break;
      case 'opportunity-desc':
        result = right.opportunityScore - left.opportunityScore;
        break;
      case 'freshness-desc':
        result = compareOptionalDateDescending(
          left.publishedAt,
          right.publishedAt,
        );
        break;
      case 'company':
        result = compareText(left.company, right.company);
        break;
      case 'title':
        result = compareText(left.title, right.title);
        break;
      case 'status-updated-desc':
        result = right.statusUpdatedAt.localeCompare(left.statusUpdatedAt);
        break;
    }
    return result === 0
      ? compareText(left.recommendationId, right.recommendationId)
      : result;
  };
}

function compareOptionalDateDescending(
  left: string | undefined,
  right: string | undefined,
): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  return right.localeCompare(left);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en-US', { sensitivity: 'base' });
}

function optionalTrimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseMinimumScore(value: string | undefined): number | undefined {
  const trimmed = optionalTrimmed(value);
  if (trimmed === undefined) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)
    throw new ReportQueryError(
      'Minimum score must be a number from 0 through 100.',
    );
  return parsed;
}
