import type {
  ConfigurationIssue,
  ConfigurationSummary,
} from '../../application/index.js';

export function formatConfigurationSummary(
  summary: ConfigurationSummary,
  asJson: boolean,
): string {
  if (asJson) {
    return JSON.stringify(
      {
        valid: true,
        candidate: summary.candidateDisplayName,
        enabledTracks: summary.enabledTrackCount,
        enabledSources: summary.enabledSourceCount,
        dailyRecommendationLimit: summary.dailyRecommendationLimit,
      },
      undefined,
      2,
    );
  }

  return [
    'Configuration valid',
    `Candidate: ${summary.candidateDisplayName}`,
    `Enabled tracks: ${summary.enabledTrackCount}`,
    `Enabled sources: ${summary.enabledSourceCount}`,
    `Daily recommendation limit: ${summary.dailyRecommendationLimit}`,
  ].join('\n');
}

export function formatConfigurationErrors(
  issues: readonly ConfigurationIssue[],
  asJson: boolean,
): string {
  if (asJson) {
    return JSON.stringify({ valid: false, issues }, undefined, 2);
  }

  const heading = `Configuration invalid (${issues.length} ${issues.length === 1 ? 'issue' : 'issues'})`;
  const lines = issues.map((issue) => {
    const location = [
      issue.section,
      issue.fieldPath,
      issue.filePath === undefined ? undefined : `file: ${issue.filePath}`,
    ]
      .filter((value) => value !== undefined)
      .join(' · ');
    return `- [${issue.code}] ${location}: ${issue.message}`;
  });
  return [heading, ...lines].join('\n');
}

export function formatHelp(): string {
  return [
    'Usage: npm run cli -- validate-config [options]',
    '',
    'Options:',
    '  --config-dir <path>  Read configuration from this directory (default: config)',
    '  --examples           Validate tracked *.example.yaml files',
    '  --json               Emit machine-readable JSON',
    '  --help               Show this help',
  ].join('\n');
}
