import { describe, expect, it } from 'vitest';

import {
  formatConfigurationErrors,
  formatConfigurationSummary,
  formatHelp,
} from '../../src/interfaces/index.js';

describe('CLI output', () => {
  const summary = {
    candidateDisplayName: 'Artem',
    enabledTrackCount: 5,
    enabledSourceCount: 3,
    dailyRecommendationLimit: 20,
  };

  it('formats the documented text summary', () => {
    expect(formatConfigurationSummary(summary, false)).toBe(
      [
        'Configuration valid',
        'Candidate: Artem',
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
  });
});
