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
    'Usage: npm run cli -- <command> [options]',
    '',
    'Commands:',
    '  validate-config  Validate local or example YAML configuration',
    '  sources:check    Inspect source readiness without network requests',
    '  collect          Collect jobs from enabled Greenhouse, Lever, and generic sources',
    '  process          Normalize, deduplicate, and hard-filter collected jobs',
    '  recommend        Score eligible jobs and create a recommendation batch',
    '  run              Execute collection, processing, and recommendations',
    '  serve            Start the local browser report',
    '  db:check         Verify the configured database is reachable',
    '  db:migrate       Apply committed migrations',
    '  db:status        Verify committed migrations are current',
    '',
    'Options:',
    '  --config-dir <path>  Read configuration from this directory (default: config)',
    '  --examples           Validate tracked *.example.yaml files',
    '  --json               Emit machine-readable JSON',
    '  --source <id>        Collect one source (repeatable)',
    '  --type <type>        Collect greenhouse, lever, generic-page, or generic-job-list sources',
    '  --concurrency <n>    Concurrent sources, 1-8 (default: 3)',
    '  --limit <n>          Process: 1-10000 (default 1000); recommend: 1-1000 (default 20)',
    '  --processing-limit <n>  Full pipeline processing bound (default: 1000)',
    '  --host <host>        Serve host; V1 accepts only 127.0.0.1',
    '  --port <port>        Serve port, 1-65535 (default: 3000)',
    '  --verbose            Emit diagnostic logs to stderr',
    '  --help               Show this help',
  ].join('\n');
}
