import type { SourceConfig } from './source-config.js';

export type SourceClassification = 'PLACEHOLDER' | 'REAL';

export interface SourceReadiness {
  readonly id: string;
  readonly type: SourceConfig['type'];
  readonly enabled: boolean;
  readonly classification: SourceClassification;
  readonly configurationReady: boolean;
  readonly reasons: readonly string[];
}

export interface SourceReadinessReport {
  readonly sources: readonly SourceReadiness[];
  readonly hasRealEnabledSource: boolean;
}

export function inspectSourceReadiness(
  sources: readonly SourceConfig[],
): SourceReadinessReport {
  const inspected = sources.map(inspectSource);
  return {
    sources: inspected,
    hasRealEnabledSource: inspected.some(
      (source) =>
        source.enabled &&
        source.classification === 'REAL' &&
        source.configurationReady,
    ),
  };
}

function inspectSource(source: SourceConfig): SourceReadiness {
  const reasons = new Set<string>();
  if (isPlaceholderText(source.id)) reasons.add('placeholder source ID');

  switch (source.type) {
    case 'greenhouse':
      if (isPlaceholderText(source.settings.boardToken))
        reasons.add('placeholder Greenhouse board token');
      inspectOptionalUrl(source.settings.boardUrl, reasons);
      break;
    case 'lever':
      if (isPlaceholderText(source.settings.companySlug))
        reasons.add('placeholder Lever company slug');
      inspectOptionalUrl(source.settings.jobsUrl, reasons);
      break;
    case 'generic-jsonld':
    case 'generic-page':
    case 'generic-job-list':
      inspectUrl(source.settings.url, reasons);
      break;
  }

  const reasonList = [...reasons];
  return {
    id: source.id,
    type: source.type,
    enabled: source.enabled,
    classification: reasonList.length === 0 ? 'REAL' : 'PLACEHOLDER',
    configurationReady: reasonList.length === 0,
    reasons: reasonList,
  };
}

function inspectOptionalUrl(
  value: string | undefined,
  reasons: Set<string>,
): void {
  if (value !== undefined) inspectUrl(value, reasons);
}

function inspectUrl(value: string, reasons: Set<string>): void {
  try {
    const hostname = new URL(value).hostname.toLocaleLowerCase('en-US');
    if (
      ['example.com', 'example.org', 'example.net'].some(
        (reserved) =>
          hostname === reserved || hostname.endsWith(`.${reserved}`),
      ) ||
      hostname === 'example' ||
      hostname.endsWith('.example') ||
      hostname.includes('replace-with-real')
    )
      reasons.add('placeholder source URL');
  } catch {
    // URL shape is owned by schema validation; readiness stays deterministic.
  }
}

function isPlaceholderText(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase('en-US');
  return (
    normalized.startsWith('example') ||
    normalized.startsWith('replace-with-real')
  );
}
