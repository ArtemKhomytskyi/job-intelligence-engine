import { describe, expect, it } from 'vitest';

import {
  formatConfigurationErrors,
  formatConfigurationSummary,
  formatHelp,
  formatProcessingSummary,
  formatRecommendationBatch,
} from '../../src/interfaces/index.js';

describe('CLI output', () => {
  const summary = {
    candidateDisplayName: 'Example Candidate',
    enabledTrackCount: 5,
    enabledSourceCount: 3,
    dailyRecommendationLimit: 20,
  };

  it('formats the documented text summary', () => {
    expect(formatConfigurationSummary(summary, false)).toBe(
      [
        'Configuration valid',
        'Candidate: Example Candidate',
        'Enabled tracks: 5',
        'Enabled sources: 3',
        'Daily recommendation limit: 20',
      ].join('\n'),
    );
  });

  it('formats machine-readable success and errors', () => {
    expect(JSON.parse(formatConfigurationSummary(summary, true))).toMatchObject(
      {
        valid: true,
        enabledTracks: 5,
      },
    );
    const rendered = formatConfigurationErrors(
      [
        {
          code: 'CONFIG_SCHEMA_INVALID',
          section: 'profile',
          fieldPath: 'candidate.id',
          message: 'Invalid ID.',
        },
      ],
      true,
    );
    expect(JSON.parse(rendered)).toMatchObject({ valid: false });
  });

  it('formats concise human-readable errors and help', () => {
    expect(
      formatConfigurationErrors(
        [
          {
            code: 'CONFIG_FILE_NOT_FOUND',
            section: 'profile',
            filePath: 'config/profile.yaml',
            message: 'Missing.',
          },
        ],
        false,
      ),
    ).toContain('[CONFIG_FILE_NOT_FOUND] profile');
    expect(formatHelp()).toContain('validate-config');
    expect(formatHelp()).toContain('process');
    expect(formatHelp()).toContain('Greenhouse, Lever, and generic sources');
  });

  it('formats processing summaries as text and JSON', () => {
    const processing = {
      runId: 'run-a',
      startedAt: '2026-07-29T12:00:00.000Z',
      completedAt: '2026-07-29T12:00:01.000Z',
      status: 'COMPLETED' as const,
      consideredCount: 5,
      normalizedCount: 5,
      normalizationFailedCount: 0,
      duplicateCount: 1,
      possibleDuplicateCount: 1,
      rejectedCount: 1,
      eligibleCount: 2,
      errorCount: 0,
      skippedCount: 0,
    };
    expect(formatProcessingSummary(processing, false)).toContain(
      'Deduplication: 1 duplicates, 1 possible duplicates',
    );
    expect(JSON.parse(formatProcessingSummary(processing, true))).toMatchObject(
      {
        runId: 'run-a',
        eligibleCount: 2,
      },
    );
  });

  it('formats ordered recommendation batches and empty results', () => {
    const batch = {
      id: 'batch-a',
      inputHash: 'hash-a',
      evaluationTime: '2026-07-30T12:00:00.000Z',
      requestedLimit: 20,
      selectedCount: 1,
      configurationFingerprint: 'config-a',
      scoringVersion: 'v1',
      selectorVersion: 'selector-v1',
      createdAt: '2026-07-30T12:00:00.000Z',
      reused: false,
      items: [
        {
          jobId: 'job-a',
          processingDecisionId: 'decision-a',
          inputRevisionNumber: 1,
          rank: 1,
          scoreId: 'score-a',
          title: 'Data Engineer',
          company: 'Synthetic Labs',
          score: {
            totalScore: 88.5,
            opportunityScore: 90,
            selectedTrackId: 'data',
            components: [],
            positiveReasons: [
              {
                code: 'TITLE_EXACT_MATCH',
                message: 'Matched.',
                impact: 'POSITIVE' as const,
              },
            ],
            concerns: [],
            missingData: ['salary'],
            completeness: 0.8,
          },
        },
      ],
    };
    expect(formatRecommendationBatch(batch, false)).toContain(
      '1. Data Engineer',
    );
    expect(formatRecommendationBatch(batch, false)).toContain('score 88.50');
    expect(JSON.parse(formatRecommendationBatch(batch, true))).toMatchObject({
      id: 'batch-a',
      selectedCount: 1,
    });
    expect(
      formatRecommendationBatch(
        { ...batch, selectedCount: 0, items: [] },
        false,
      ),
    ).toContain('No eligible recommendations');
  });
});
