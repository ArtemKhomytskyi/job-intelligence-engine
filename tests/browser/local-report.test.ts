import { chromium, type Browser } from 'playwright';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  RecommendationDetails,
  RecommendationReport,
  RecommendationReportQuery,
  UserApplicationStatus,
} from '../../src/application/index.js';
import { PipelineStageError } from '../../src/application/index.js';
import { NodeLocalServer } from '../../src/infrastructure/index.js';
import {
  createLocalReportHandler,
  type LocalReportRuntime,
} from '../../src/interfaces/web/local-report-handler.js';

const logger = { debug() {}, info() {}, warn() {}, error() {} };
let server: NodeLocalServer;
let browser: Browser | undefined;
let runtime: BrowserRuntime;
let baseUrl: string;
let sourceReadiness: { sources: never[]; hasRealEnabledSource: boolean };

beforeEach(async () => {
  runtime = new BrowserRuntime();
  sourceReadiness = { sources: [], hasRealEnabledSource: true };
  server = new NodeLocalServer(
    createLocalReportHandler({
      runtime,
      logger,
      pipelineSignal: new AbortController().signal,
      collectionConcurrency: 1,
      processingLimit: 100,
      sourceReadiness,
    }),
  );
  baseUrl = (await server.start('127.0.0.1', 0)).url;
  browser = await chromium.launch({ headless: true });
});

afterEach(async () => {
  await browser?.close();
  await server.close();
});

describe('local recommendation report browser flow', () => {
  it('filters, sorts, inspects explainability, and persists explicit status', async () => {
    if (browser === undefined) throw new Error('Browser did not start.');
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(5_000);
    let mutationOrigin: string | undefined;
    page.on('request', (request) => {
      if (request.url().endsWith('/status'))
        mutationOrigin = request.headers()['origin'];
    });
    await page.goto(`${baseUrl}/recommendations`);
    await expect(page.locator('h1').textContent()).resolves.toContain(
      'recommendation',
    );
    await page.selectOption('select[name="track"]', 'data');
    await page.selectOption('select[name="sort"]', 'score-desc');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await page.waitForURL(/track=data.*sort=score-desc/u);
    expect(runtime.lastQuery).toMatchObject({
      trackId: 'data',
      sort: 'score-desc',
    });

    await page.getByRole('link', { name: 'Details' }).click();
    await page.getByRole('heading', { name: 'Score breakdown' }).waitFor();
    expect(await page.getByText('Title Relevance').count()).toBe(1);
    expect(await page.getByText('Strong title match').count()).toBeGreaterThan(
      0,
    );
    expect(await page.getByText('salary').count()).toBeGreaterThan(0);
    expect(runtime.status).toBe('VIEWED');

    const apply = page.getByRole('link', { name: 'Apply' });
    expect(await apply.getAttribute('href')).toBe(
      'https://apply.example.test/role',
    );
    expect(await apply.getAttribute('rel')).toBe('noopener noreferrer');

    await page.getByRole('button', { name: 'Mark applied' }).click();
    expect(mutationOrigin).toBe(baseUrl);
    expect(await page.locator('main').textContent()).not.toContain(
      'Invalid request',
    );
    expect(page.url()).toContain('notice=status-updated');
    await page.reload();
    expect(runtime.status).toBe('APPLIED');
    await expect(
      page.getByText('APPLIED', { exact: true }).first().textContent(),
    ).resolves.toBe('APPLIED');
  });

  it('shows a safe failed manual pipeline result and retained run state', async () => {
    if (browser === undefined) throw new Error('Browser did not start.');
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(5_000);

    await page.goto(`${baseUrl}/recommendations`);
    await page.getByRole('button', { name: 'Run pipeline' }).click();
    await page.waitForURL(/\/runs\/latest\?failure=collection$/u);

    await page.getByRole('heading', { name: 'Pipeline run failed' }).waitFor();
    await expect(
      page.getByText('Collection', { exact: true }).last().textContent(),
    ).resolves.toBe('Collection');
    expect(await page.locator('main').textContent()).toContain(
      'Collection did not produce a successful source result',
    );
    expect(await page.locator('main').textContent()).toContain('Not run');
    expect(await page.locator('main').textContent()).not.toContain(
      'BROWSER_INTERNAL_SENTINEL',
    );

    await page
      .getByRole('link', { name: 'View latest pipeline state' })
      .click();
    await page.waitForURL(/\/runs\/latest$/u);
    expect(await page.locator('main').textContent()).toContain('FAILED');
  });

  it('guides first-run setup without launching the pipeline', async () => {
    if (browser === undefined) throw new Error('Browser did not start.');
    sourceReadiness.hasRealEnabledSource = false;
    const page = await browser.newPage();

    await page.goto(`${baseUrl}/recommendations`);
    await page
      .getByRole('heading', { name: 'Job sources are not ready' })
      .waitFor();
    expect(
      await page.getByRole('button', { name: 'Run pipeline' }).count(),
    ).toBe(0);
    await page.getByRole('link', { name: 'Set up job sources' }).click();
    await page.waitForURL(/\/setup$/u);
    await page
      .getByRole('heading', { name: 'Configure real job sources' })
      .waitFor();
    expect(await page.locator('main').textContent()).toContain(
      'npm run cli -- sources:check',
    );
    expect(runtime.pipelineCalls).toBe(0);
  });
});

class BrowserRuntime implements LocalReportRuntime {
  public status: 'NEW' | 'VIEWED' | 'APPLIED' | 'SKIPPED' = 'NEW';
  public lastQuery: RecommendationReportQuery | undefined;
  public pipelineCalls = 0;
  public readonly pipeline = {
    execute: () => {
      this.pipelineCalls += 1;
      return Promise.reject(
        new PipelineStageError('collection', 'BROWSER_INTERNAL_SENTINEL'),
      );
    },
  };
  public readonly getReport = {
    execute: (query: RecommendationReportQuery) => {
      this.lastQuery = query;
      return Promise.resolve(this.report(query));
    },
  };
  public readonly getDetails = {
    execute: () => {
      if (this.status === 'NEW') this.status = 'VIEWED';
      return Promise.resolve(this.details());
    },
  };
  public readonly updateStatus = {
    execute: (
      _recommendationId: string,
      targetStatus: UserApplicationStatus,
    ) => {
      const changed = this.status !== targetStatus;
      this.status = targetStatus;
      return Promise.resolve({
        changed,
        jobId: 'job-1',
        currentStatus: targetStatus,
      });
    },
  };
  public readonly health = { check: () => Promise.resolve() };

  private report(query: RecommendationReportQuery): RecommendationReport {
    const item = {
      recommendationId: 'rec-1',
      jobId: 'job-1',
      rank: 1,
      title: 'Synthetic Engineer',
      company: 'Synthetic Labs',
      selectedTrackId: 'data',
      finalScore: 88,
      opportunityScore: 81,
      applicationUrl: 'https://apply.example.test/role',
      currentStatus: this.status,
      statusUpdatedAt: '2026-08-02T10:00:00.000Z',
      positives: [reason()],
      concerns: [],
      missingDataCount: 1,
      generatedAt: '2026-08-02T10:00:00.000Z',
    };
    return {
      query,
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
        collection: {
          runId: 'failed-browser-collection',
          status: 'FAILED',
          startedAt: '2026-08-02T12:00:00.000Z',
          completedAt: '2026-08-02T12:00:02.000Z',
          sourcesAttempted: 2,
          sourcesSucceeded: 0,
          sourcesFailed: 2,
          jobsCollected: 0,
          jobsCreated: 0,
          jobsUpdated: 0,
        },
      },
    };
  }

  private details(): RecommendationDetails {
    return {
      recommendationId: 'rec-1',
      batchId: '11111111-1111-4111-8111-111111111111',
      jobId: 'job-1',
      rank: 1,
      originalTitle: 'Synthetic Engineer',
      normalizedTitle: 'synthetic engineer',
      company: 'Synthetic Labs',
      experienceRequirements: [],
      educationRequirements: [],
      languages: [],
      skills: ['TypeScript'],
      applicationUrl: 'https://apply.example.test/role',
      description: 'Synthetic browser fixture.',
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
          reasons: [reason()],
        },
      ],
      positives: [reason()],
      concerns: [],
      missingData: ['salary'],
      currentStatus: this.status,
      statusHistory: [],
      generatedAt: '2026-08-02T10:00:00.000Z',
    };
  }
}

function reason() {
  return {
    code: 'TITLE_MATCH',
    message: 'Strong title match',
    impact: 'POSITIVE' as const,
  };
}
