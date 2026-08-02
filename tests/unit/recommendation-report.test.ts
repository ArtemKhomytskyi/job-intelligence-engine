import { describe, expect, it } from 'vitest';

import {
  GetRecommendationDetails,
  GetRecommendationReport,
  RecommendationNotFoundError,
  UpdateJobApplicationStatus,
  filterAndSortRecommendations,
  parseRecommendationReportQuery,
  type RecommendationBatchView,
  type RecommendationDetails,
  type RecommendationReportRepository,
  type UpdateApplicationStatusInput,
} from '../../src/application/index.js';

describe('recommendation report use cases', () => {
  it('validates bookmarkable filters and rejects unknown values', () => {
    expect(
      parseRecommendationReportQuery({
        track: 'data-science',
        status: 'NEW',
        company: ' Labs ',
        minimumScore: '72.5',
        sort: 'score-desc',
      }),
    ).toEqual({
      trackId: 'data-science',
      status: 'NEW',
      company: 'Labs',
      minimumScore: 72.5,
      sort: 'score-desc',
    });
    expect(() =>
      parseRecommendationReportQuery({ track: 'Bad Track' }),
    ).toThrow('stable lowercase track ID');
    expect(() => parseRecommendationReportQuery({ status: 'UNKNOWN' })).toThrow(
      'Unknown job status',
    );
    expect(() =>
      parseRecommendationReportQuery({ minimumScore: '101' }),
    ).toThrow('0 through 100');
    expect(() => parseRecommendationReportQuery({ sort: 'random' })).toThrow(
      'Unknown report sort',
    );
    expect(() =>
      parseRecommendationReportQuery({ company: 'x'.repeat(201) }),
    ).toThrow('200 characters');
    expect(() =>
      parseRecommendationReportQuery({ batch: 'not-a-uuid' }),
    ).toThrow('valid UUID');
    expect(parseRecommendationReportQuery({})).toEqual({ sort: 'rank' });
  });

  it.each([
    ['rank', ['rec-b', 'rec-a']],
    ['score-desc', ['rec-a', 'rec-b']],
    ['opportunity-desc', ['rec-b', 'rec-a']],
    ['freshness-desc', ['rec-a', 'rec-b']],
    ['company', ['rec-a', 'rec-b']],
    ['title', ['rec-a', 'rec-b']],
    ['status-updated-desc', ['rec-a', 'rec-b']],
  ] as const)(
    'sorts %s with a stable identifier tie-break',
    (sort, expected) => {
      const result = filterAndSortRecommendations(batch().items, { sort });
      expect(result.map((item) => item.recommendationId)).toEqual(expected);
    },
  );

  it('uses recommendation ID as the final stable tie-break', () => {
    const item = batch().items[0]!;
    const result = filterAndSortRecommendations(
      [
        { ...item, recommendationId: 'rec-z' },
        { ...item, recommendationId: 'rec-c' },
      ],
      { sort: 'score-desc' },
    );
    expect(result.map((entry) => entry.recommendationId)).toEqual([
      'rec-c',
      'rec-z',
    ]);
  });

  it('filters by track, status, company and minimum score', async () => {
    const repository = new MemoryReportRepository();
    const report = await new GetRecommendationReport(repository).execute({
      sort: 'rank',
      trackId: 'data',
      status: 'VIEWED',
      company: 'beta',
      minimumScore: 60,
    });
    expect(report.items.map((item) => item.recommendationId)).toEqual([
      'rec-b',
    ]);
    expect(report.availableTrackIds).toEqual(['data', 'platform']);
    expect(report.availableCompanies).toEqual(['Alpha Labs', 'Beta Labs']);
  });

  it('returns a validation error for a well-formed track absent from the batch', async () => {
    await expect(
      new GetRecommendationReport(new MemoryReportRepository()).execute({
        sort: 'rank',
        trackId: 'unknown-track',
      }),
    ).rejects.toThrow('Unknown track');
  });

  it('automatically marks NEW details VIEWED once and preserves APPLIED/SKIPPED', async () => {
    const repository = new MemoryReportRepository();
    const updater = new UpdateJobApplicationStatus(
      repository,
      { now: () => new Date('2026-08-02T12:00:00.000Z') },
      { debug() {}, info() {}, warn() {}, error() {} },
    );
    const details = new GetRecommendationDetails(repository, updater);
    await expect(details.execute('rec-new')).resolves.toMatchObject({
      currentStatus: 'VIEWED',
    });
    await details.execute('rec-new');
    expect(
      repository.updates.filter((item) => item.recommendationId === 'rec-new'),
    ).toHaveLength(1);
    await expect(details.execute('rec-applied')).resolves.toMatchObject({
      currentStatus: 'APPLIED',
    });
    await expect(details.execute('rec-skipped')).resolves.toMatchObject({
      currentStatus: 'SKIPPED',
    });
    expect(repository.updates).toHaveLength(1);
  });

  it('persists explicit status idempotently and reports missing recommendations', async () => {
    const repository = new MemoryReportRepository();
    const updater = new UpdateJobApplicationStatus(
      repository,
      { now: () => new Date('2026-08-02T12:00:00.000Z') },
      { debug() {}, info() {}, warn() {}, error() {} },
    );
    await expect(updater.execute('rec-b', 'APPLIED')).resolves.toMatchObject({
      changed: true,
    });
    await expect(updater.execute('rec-b', 'APPLIED')).resolves.toMatchObject({
      changed: false,
    });
    await expect(updater.execute('missing', 'VIEWED')).rejects.toBeInstanceOf(
      RecommendationNotFoundError,
    );
  });
});

class MemoryReportRepository implements RecommendationReportRepository {
  public readonly updates: UpdateApplicationStatusInput[] = [];
  private readonly statuses = new Map([
    ['rec-new', 'NEW' as const],
    ['rec-applied', 'APPLIED' as const],
    ['rec-skipped', 'SKIPPED' as const],
    ['rec-b', 'VIEWED' as const],
  ]);

  public getRecommendationBatch() {
    return Promise.resolve(batch());
  }
  public getRecommendationDetails(recommendationId: string) {
    const status = this.statuses.get(recommendationId);
    return Promise.resolve(
      status === undefined ? undefined : details(recommendationId, status),
    );
  }
  public updateApplicationStatus(input: UpdateApplicationStatusInput) {
    const current = this.statuses.get(input.recommendationId);
    if (current === undefined) return Promise.resolve(undefined);
    const changed = current !== input.targetStatus;
    if (changed) {
      this.statuses.set(input.recommendationId, input.targetStatus);
      this.updates.push(input);
    }
    return Promise.resolve({
      changed,
      jobId: `job-${input.recommendationId}`,
      currentStatus: input.targetStatus,
    });
  }
  public getLatestPipelineState() {
    return Promise.resolve({});
  }
}

function batch(): RecommendationBatchView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    evaluationTime: '2026-08-02T10:00:00.000Z',
    requestedLimit: 2,
    selectedCount: 2,
    createdAt: '2026-08-02T10:00:00.000Z',
    items: [
      {
        recommendationId: 'rec-a',
        jobId: 'job-a',
        rank: 2,
        title: 'Analytics Engineer',
        company: 'Alpha Labs',
        selectedTrackId: 'platform',
        finalScore: 90,
        opportunityScore: 70,
        publishedAt: '2026-08-02T09:00:00.000Z',
        currentStatus: 'NEW',
        statusUpdatedAt: '2026-08-02T11:00:00.000Z',
        positives: [],
        concerns: [],
        missingDataCount: 0,
        generatedAt: '2026-08-02T10:00:00.000Z',
      },
      {
        recommendationId: 'rec-b',
        jobId: 'job-b',
        rank: 1,
        title: 'Data Engineer',
        company: 'Beta Labs',
        selectedTrackId: 'data',
        finalScore: 80,
        opportunityScore: 95,
        publishedAt: '2026-08-01T09:00:00.000Z',
        currentStatus: 'VIEWED',
        statusUpdatedAt: '2026-08-02T10:00:00.000Z',
        positives: [],
        concerns: [],
        missingDataCount: 1,
        generatedAt: '2026-08-02T10:00:00.000Z',
      },
    ],
  };
}

function details(
  recommendationId: string,
  currentStatus: 'NEW' | 'VIEWED' | 'APPLIED' | 'SKIPPED',
): RecommendationDetails {
  return {
    recommendationId,
    batchId: 'batch',
    jobId: `job-${recommendationId}`,
    rank: 1,
    originalTitle: 'Data Engineer',
    normalizedTitle: 'data engineer',
    company: 'Synthetic Labs',
    experienceRequirements: [],
    educationRequirements: [],
    languages: [],
    skills: [],
    selectedTrackId: 'data',
    finalScore: 80,
    opportunityScore: 85,
    completeness: 0.8,
    components: [],
    positives: [],
    concerns: [],
    missingData: [],
    currentStatus,
    statusHistory: [],
    generatedAt: '2026-08-02T10:00:00.000Z',
  };
}
