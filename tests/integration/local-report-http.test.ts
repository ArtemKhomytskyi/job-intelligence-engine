import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ActivePipelineRunError,
  PipelineStageError,
  RecommendationNotFoundError,
  type RecommendationDetails,
  type RecommendationReport,
  type RecommendationReportQuery,
  type RunFullPipelineInput,
  type RunFullPipelineResult,
  type UserApplicationStatus,
} from '../../src/application/index.js';
import type { SourceReadinessReport } from '../../src/domain/index.js';
import { NodeLocalServer } from '../../src/infrastructure/index.js';
import {
  createLocalReportHandler,
  type LocalReportRuntime,
} from '../../src/interfaces/web/local-report-handler.js';

const logger = { debug() {}, info() {}, warn() {}, error() {} };
let server: NodeLocalServer;
let baseUrl: string;
let runtime: FakeRuntime;
let sourceReadiness: {
  sources: SourceReadinessReport['sources'];
  hasRealEnabledSource: boolean;
};

beforeEach(async () => {
  runtime = new FakeRuntime();
  sourceReadiness = { sources: [], hasRealEnabledSource: true };
  server = new NodeLocalServer(
    createLocalReportHandler({
      runtime,
      logger,
      pipelineSignal: new AbortController().signal,
      collectionConcurrency: 2,
      processingLimit: 100,
      sourceReadiness,
    }),
  );
  baseUrl = (await server.start('127.0.0.1', 0)).url;
});

afterEach(async () => {
  await server.close();
});

describe('local report HTTP interface', () => {
  it('redirects home and renders the recommendation list with security headers', async () => {
    const home = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    expect(home.status).toBe(302);
    expect(home.headers.get('location')).toBe('/recommendations');

    const response = await fetch(`${baseUrl}/recommendations`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(html).toContain('Synthetic Engineer');
    expect(html).toContain('data');
    expect(html).toContain('Score 88.00');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('passes validated track and sort filters and rejects invalid filters', async () => {
    const filtered = await fetch(
      `${baseUrl}/recommendations?track=data&sort=score-desc`,
    );
    expect(filtered.status).toBe(200);
    expect(runtime.lastQuery).toMatchObject({
      trackId: 'data',
      sort: 'score-desc',
    });

    const invalid = await fetch(`${baseUrl}/recommendations?status=NOPE`);
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).toContain('Unknown job status');
  });

  it('renders details, complete score breakdown, and escaped source text', async () => {
    const response = await fetch(`${baseUrl}/recommendations/rec-1`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('Score breakdown');
    expect(html).toContain('Title Relevance');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain('https://apply.example.test/role');
  });

  it('does not render an unsafe apply URL from an invalid adapter', async () => {
    runtime.detailsValue = {
      ...details(),
      applicationUrl: 'javascript:alert(1)',
    };
    runtime.reportValue = {
      ...report(),
      batch: {
        ...report().batch!,
        items: [
          {
            ...report().batch!.items[0]!,
            applicationUrl: 'javascript:alert(1)',
          },
        ],
      },
      items: [{ ...report().items[0]!, applicationUrl: 'javascript:alert(1)' }],
    };
    const listHtml = await (await fetch(`${baseUrl}/recommendations`)).text();
    const detailHtml = await (
      await fetch(`${baseUrl}/recommendations/rec-1`)
    ).text();
    expect(listHtml).not.toContain('javascript:');
    expect(detailHtml).not.toContain('javascript:');
    expect(detailHtml).toContain('Apply URL unavailable');
  });

  it('persists status via same-origin POST and uses redirect-after-POST', async () => {
    const response = await fetch(`${baseUrl}/recommendations/rec-1/status`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Origin: baseUrl,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ status: 'APPLIED' }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('notice=status-updated');
    expect(runtime.statusUpdates).toEqual([['rec-1', 'APPLIED']]);
  });

  it('rejects invalid and cross-origin status mutations', async () => {
    const invalid = await fetch(`${baseUrl}/recommendations/rec-1/status`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Origin: baseUrl,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'status=INVALID',
    });
    expect(invalid.status).toBe(400);

    const crossOrigin = await fetch(`${baseUrl}/recommendations/rec-1/status`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Origin: 'https://malicious.example',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'status=VIEWED',
    });
    expect(crossOrigin.status).toBe(400);
    expect(runtime.statusUpdates).toEqual([]);
  });

  it('rejects mutations with no browser origin evidence', async () => {
    const response = await fetch(`${baseUrl}/recommendations/rec-1/status`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'status=VIEWED',
    });
    expect(response.status).toBe(400);
    expect(runtime.statusUpdates).toEqual([]);
  });

  it('runs the shared pipeline action and maps active conflicts', async () => {
    const success = await fetch(`${baseUrl}/actions/run`, {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: baseUrl },
    });
    expect(success.status).toBe(303);
    expect(runtime.pipelineInputs).toHaveLength(1);
    expect(runtime.pipelineInputs[0]).toMatchObject({ initiatedBy: 'web' });

    runtime.pipelineConflict = true;
    const conflict = await fetch(`${baseUrl}/actions/run`, {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: baseUrl },
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).toContain('already running');
  });

  it('renders first-run setup and controls the run action without a 500', async () => {
    sourceReadiness.hasRealEnabledSource = false;
    sourceReadiness.sources = [
      {
        id: 'synthetic-generic',
        type: 'generic-page',
        enabled: true,
        classification: 'REAL',
        configurationReady: false,
        blockerCodes: ['BROWSER_FALLBACK_EXTERNAL_UNSAFE'],
        reasons: [
          'external browser fallback is disabled by the source network policy',
        ],
      },
    ];

    const recommendations = await fetch(`${baseUrl}/recommendations`);
    const recommendationHtml = await recommendations.text();
    expect(recommendations.status).toBe(200);
    expect(recommendationHtml).toContain('Job sources are not ready.');
    expect(recommendationHtml).toContain(
      'external browser fallback is disabled by the source network policy',
    );
    expect(recommendationHtml).toContain('Set up job sources');
    expect(recommendationHtml).not.toContain('>Run pipeline<');

    const runs = await fetch(`${baseUrl}/runs/latest`);
    expect(await runs.text()).toContain('Job sources are not ready.');

    const blocked = await fetch(`${baseUrl}/actions/run`, {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: baseUrl },
    });
    expect(blocked.status).toBe(303);
    expect(blocked.headers.get('location')).toBe(
      '/setup?notice=sources-required',
    );
    expect(runtime.pipelineInputs).toEqual([]);

    const setup = await fetch(`${baseUrl}${blocked.headers.get('location')!}`);
    const setupHtml = await setup.text();
    expect(setup.status).toBe(200);
    expect(setupHtml).toContain('Configure real job sources');
    expect(setupHtml).toContain('config/sources.yaml');
    expect(setupHtml).toContain('npm run cli -- sources:check');
    expect(setupHtml).toContain('allowBrowserFallback: false');
    expect(setupHtml).toContain(
      'external browser fallback is disabled by the source network policy',
    );
    expect(setupHtml).not.toContain('Unexpected error');
  });

  it('redirects a collection-stage failure to a safe persisted-state page', async () => {
    runtime.reportValue = failedCollectionReport();
    runtime.pipelineFailure = new PipelineStageError(
      'collection',
      'DATABASE_INTERNAL_SENTINEL C:\\private\\source-credentials.env',
    );

    const response = await fetch(`${baseUrl}/actions/run`, {
      method: 'POST',
      redirect: 'manual',
      headers: { Origin: baseUrl },
    });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      '/runs/latest?failure=collection',
    );

    const failurePage = await fetch(
      `${baseUrl}${response.headers.get('location')!}`,
    );
    const html = await failurePage.text();
    expect(failurePage.status).toBe(200);
    expect(html).toContain('Pipeline run failed');
    expect(html).toContain(
      'Collection did not produce a successful source result',
    );
    expect(html).toContain('Sources attempted');
    expect(html).toContain('<strong>3</strong>');
    expect(html).toContain('Processing');
    expect(html).toContain('Not run');
    expect(html).toContain('View latest pipeline state');
    expect(html).toContain('Back to recommendations');
    expect(html).not.toContain('DATABASE_INTERNAL_SENTINEL');
    expect(html).not.toContain('source-credentials.env');

    const persistedPage = await fetch(`${baseUrl}/runs/latest`);
    const persistedHtml = await persistedPage.text();
    expect(persistedHtml).toContain('FAILED');
    expect(persistedHtml).toContain('0 succeeded / 3 failed');
    expect(persistedHtml).toContain('4 collected');
  });

  it('keeps failed persisted state stable across duplicate manual submissions', async () => {
    runtime.reportValue = failedCollectionReport();
    runtime.pipelineFailure = new PipelineStageError(
      'collection',
      'Collection failed.',
    );
    const persistedState = structuredClone(runtime.reportValue.latestState);

    const submissions = await Promise.all(
      [1, 2].map(() =>
        fetch(`${baseUrl}/actions/run`, {
          method: 'POST',
          redirect: 'manual',
          headers: { Origin: baseUrl },
        }),
      ),
    );

    expect(submissions.map(({ status }) => status)).toEqual([303, 303]);
    expect(runtime.pipelineInputs).toHaveLength(2);
    expect(runtime.reportValue.latestState).toEqual(persistedState);
    expect(await (await fetch(`${baseUrl}/runs/latest`)).text()).toContain(
      'FAILED',
    );
  });

  it('keeps unexpected pipeline exceptions on the generic 500 page', async () => {
    runtime.pipelineFailure = new Error(
      'DATABASE_INTERNAL_SENTINEL C:\\private\\unexpected-path',
    );
    const response = await fetch(`${baseUrl}/actions/run`, {
      method: 'POST',
      headers: { Origin: baseUrl },
    });
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain('Unexpected error');
    expect(html).not.toContain('Pipeline run failed');
    expect(html).not.toContain('DATABASE_INTERNAL_SENTINEL');
    expect(html).not.toContain('unexpected-path');
  });

  it('supports empty state, latest runs, health, static assets and 404 pages', async () => {
    const populated = report();
    runtime.reportValue = {
      query: populated.query,
      items: [],
      availableTrackIds: [],
      availableCompanies: [],
      ...(populated.latestState === undefined
        ? {}
        : { latestState: populated.latestState }),
    };
    expect(await (await fetch(`${baseUrl}/recommendations`)).text()).toContain(
      'No recommendation batch yet',
    );
    expect(await (await fetch(`${baseUrl}/runs/latest`)).text()).toContain(
      'Latest pipeline state',
    );
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
    expect(
      (await fetch(`${baseUrl}/assets/app.css`)).headers.get('content-type'),
    ).toContain('text/css');
    expect((await fetch(`${baseUrl}/assets/app.js`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/missing`)).status).toBe(404);
    expect(
      (
        await fetch(`${baseUrl}/recommendations`, {
          method: 'DELETE',
          redirect: 'manual',
        })
      ).status,
    ).toBe(405);
    expect(
      (await fetch(`${baseUrl}/recommendations?sort=rank&sort=company`)).status,
    ).toBe(400);
  });

  it('maps health database failures without exposing internals', async () => {
    runtime.healthFailure = true;
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });

  it('maps missing recommendations and report database failures to safe pages', async () => {
    runtime.detailsMissing = true;
    const missing = await fetch(`${baseUrl}/recommendations/missing`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain('Recommendation not found');

    runtime.reportFailure = true;
    const failed = await fetch(`${baseUrl}/recommendations`);
    const body = await failed.text();
    expect(failed.status).toBe(500);
    expect(body).toContain('Unexpected error');
    expect(body).not.toContain('DATABASE_INTERNAL_SENTINEL');
  });
});

class FakeRuntime implements LocalReportRuntime {
  public reportValue = report();
  public detailsValue = details();
  public lastQuery: RecommendationReportQuery | undefined;
  public readonly statusUpdates: [string, UserApplicationStatus][] = [];
  public readonly pipelineInputs: RunFullPipelineInput[] = [];
  public pipelineConflict = false;
  public pipelineFailure: Error | undefined;
  public healthFailure = false;
  public detailsMissing = false;
  public reportFailure = false;

  public readonly getReport = {
    execute: (query: RecommendationReportQuery) => {
      if (this.reportFailure)
        return Promise.reject(new Error('DATABASE_INTERNAL_SENTINEL'));
      this.lastQuery = query;
      return Promise.resolve({ ...this.reportValue, query });
    },
  };
  public readonly getDetails = {
    execute: () =>
      this.detailsMissing
        ? Promise.reject(new RecommendationNotFoundError())
        : Promise.resolve(this.detailsValue),
  };
  public readonly updateStatus = {
    execute: (recommendationId: string, status: UserApplicationStatus) => {
      this.statusUpdates.push([recommendationId, status]);
      return Promise.resolve({
        changed: true,
        jobId: 'job-1',
        currentStatus: status,
      });
    },
  };
  public readonly pipeline = {
    execute: (input: RunFullPipelineInput): Promise<RunFullPipelineResult> => {
      if (this.pipelineConflict)
        return Promise.reject(new ActivePipelineRunError());
      this.pipelineInputs.push(input);
      if (this.pipelineFailure !== undefined)
        return Promise.reject(this.pipelineFailure);
      return Promise.resolve(pipelineResult());
    },
  };
  public readonly health = {
    check: () =>
      this.healthFailure
        ? Promise.reject(new Error('DATABASE_INTERNAL_SENTINEL'))
        : Promise.resolve(),
  };
}

function report(): RecommendationReport {
  const item = {
    recommendationId: 'rec-1',
    jobId: 'job-1',
    rank: 1,
    title: 'Synthetic Engineer',
    company: 'Synthetic Labs',
    selectedTrackId: 'data',
    finalScore: 88,
    opportunityScore: 81,
    location: 'London, GB',
    remotePolicy: 'hybrid',
    applicationUrl: 'https://apply.example.test/role',
    currentStatus: 'NEW' as const,
    statusUpdatedAt: '2026-08-02T10:00:00.000Z',
    positives: [reason('TITLE_MATCH', 'Strong title match', 'POSITIVE')],
    concerns: [reason('SALARY_MISSING', 'Salary unavailable', 'NEGATIVE')],
    missingDataCount: 1,
    generatedAt: '2026-08-02T10:00:00.000Z',
  };
  return {
    query: { sort: 'rank' },
    batch: {
      id: '11111111-1111-4111-8111-111111111111',
      evaluationTime: '2026-08-02T10:00:00.000Z',
      requestedLimit: 20,
      selectedCount: 1,
      createdAt: '2026-08-02T10:00:00.000Z',
      items: [item],
    },
    items: [item],
    availableTrackIds: ['data'],
    availableCompanies: ['Synthetic Labs'],
    latestState: {
      recommendations: {
        batchId: '11111111-1111-4111-8111-111111111111',
        evaluationTime: '2026-08-02T10:00:00.000Z',
        selected: 1,
        requested: 20,
      },
    },
  };
}

function failedCollectionReport(): RecommendationReport {
  return {
    ...report(),
    latestState: {
      collection: {
        runId: 'failed-collection-run',
        status: 'FAILED',
        startedAt: '2026-08-02T12:00:00.000Z',
        completedAt: '2026-08-02T12:00:03.000Z',
        sourcesAttempted: 3,
        sourcesSucceeded: 0,
        sourcesFailed: 3,
        jobsCollected: 4,
        jobsCreated: 2,
        jobsUpdated: 1,
      },
      processing: {
        runId: 'older-processing-run',
        status: 'COMPLETED',
        startedAt: '2026-08-01T12:00:00.000Z',
        completedAt: '2026-08-01T12:00:02.000Z',
        considered: 8,
        normalized: 8,
        duplicates: 0,
        possibleDuplicates: 0,
        rejected: 1,
        eligible: 7,
        errors: 0,
      },
      recommendations: {
        batchId: 'older-batch',
        evaluationTime: '2026-08-01T12:00:03.000Z',
        selected: 5,
        requested: 5,
      },
    },
  };
}

function details(): RecommendationDetails {
  return {
    recommendationId: 'rec-1',
    batchId: '11111111-1111-4111-8111-111111111111',
    jobId: 'job-1',
    rank: 1,
    originalTitle: 'Synthetic Engineer',
    normalizedTitle: 'synthetic engineer',
    company: 'Synthetic Labs',
    location: 'London, GB',
    remotePolicy: 'hybrid',
    employmentType: 'full-time',
    experienceRequirements: ['minimumYears: 2'],
    educationRequirements: ['level: bachelors'],
    languages: ['English'],
    skills: ['TypeScript'],
    applicationUrl: 'https://apply.example.test/role',
    sourceUrl: 'https://jobs.example.test/role',
    description: '<script>alert("x")</script> Build reliable systems.',
    selectedTrackId: 'data',
    finalScore: 88,
    opportunityScore: 81,
    completeness: 0.9,
    components: [
      {
        key: 'titleRelevance',
        score: 95,
        weight: 18,
        contribution: 17.1,
        confidence: 1,
        reasons: [reason('TITLE_MATCH', 'Strong title match', 'POSITIVE')],
      },
    ],
    positives: [reason('TITLE_MATCH', 'Strong title match', 'POSITIVE')],
    concerns: [],
    missingData: ['salary'],
    currentStatus: 'VIEWED',
    statusHistory: [
      {
        id: 'history-1',
        fromStatus: 'NEW',
        toStatus: 'VIEWED',
        changedAt: '2026-08-02T11:00:00.000Z',
      },
    ],
    generatedAt: '2026-08-02T10:00:00.000Z',
  };
}

function reason(
  code: string,
  message: string,
  impact: 'POSITIVE' | 'NEGATIVE',
) {
  return { code, message, impact } as const;
}

function pipelineResult(): RunFullPipelineResult {
  return {
    startedAt: '2026-08-02T10:00:00.000Z',
    completedAt: '2026-08-02T10:01:00.000Z',
    collection: {
      runId: 'collection',
      startedAt: '2026-08-02T10:00:00.000Z',
      completedAt: '2026-08-02T10:00:20.000Z',
      status: 'COMPLETED',
      attemptedSourceCount: 1,
      succeededSourceCount: 1,
      failedSourceCount: 0,
      rawJobsFound: 1,
      createdJobs: 1,
      updatedJobs: 0,
      unchangedJobs: 0,
      linkedJobs: 0,
      invalidJobs: 0,
      persistenceFailures: 0,
      durationMs: 20_000,
      sourceSummaries: [],
    },
    processing: {
      runId: 'processing',
      startedAt: '2026-08-02T10:00:20.000Z',
      completedAt: '2026-08-02T10:00:40.000Z',
      status: 'COMPLETED',
      consideredCount: 1,
      normalizedCount: 1,
      normalizationFailedCount: 0,
      duplicateCount: 0,
      possibleDuplicateCount: 0,
      rejectedCount: 0,
      eligibleCount: 1,
      errorCount: 0,
      skippedCount: 0,
    },
    recommendations: {
      id: 'batch',
      inputHash: 'hash',
      evaluationTime: '2026-08-02T10:00:00.000Z',
      requestedLimit: 20,
      selectedCount: 1,
      configurationFingerprint: 'config',
      scoringVersion: 'v1',
      selectorVersion: 'v1',
      createdAt: '2026-08-02T10:01:00.000Z',
      items: [],
      reused: false,
    },
  };
}
