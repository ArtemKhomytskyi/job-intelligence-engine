import type { SourceConfig } from './source-config.js';

export type SourceClassification = 'PLACEHOLDER' | 'REAL';

export type SourceReadinessBlockerCode =
  | 'PLACEHOLDER_SOURCE_NOT_ALLOWED'
  | 'SOURCE_TYPE_UNSUPPORTED'
  | 'BROWSER_FALLBACK_EXTERNAL_UNSAFE';

export interface SourceReadiness {
  readonly id: string;
  readonly type: SourceConfig['type'];
  readonly enabled: boolean;
  readonly classification: SourceClassification;
  readonly configurationReady: boolean;
  readonly blockerCodes: readonly SourceReadinessBlockerCode[];
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
  const placeholderReasons = new Set<string>();
  if (isPlaceholderText(source.id))
    placeholderReasons.add('placeholder source ID');

  switch (source.type) {
    case 'greenhouse':
      if (isPlaceholderText(source.settings.boardToken))
        placeholderReasons.add('placeholder Greenhouse board token');
      inspectOptionalUrl(source.settings.boardUrl, placeholderReasons);
      break;
    case 'lever':
      if (isPlaceholderText(source.settings.companySlug))
        placeholderReasons.add('placeholder Lever company slug');
      inspectOptionalUrl(source.settings.jobsUrl, placeholderReasons);
      break;
    case 'generic-jsonld':
      inspectUrl(source.settings.url, placeholderReasons);
      break;
    case 'generic-page':
    case 'generic-job-list':
      inspectUrl(source.settings.url, placeholderReasons);
      break;
    case 'ashby':
    case 'smartrecruiters':
    case 'workable':
    case 'bamboohr':
    case 'recruitee':
    case 'teamtailor':
    case 'personio':
    case 'jobvite':
      if (isPlaceholderText(source.settings.identifier))
        placeholderReasons.add('placeholder ATS identifier');
      inspectOptionalUrl(source.settings.url, placeholderReasons);
      break;
  }

  const readinessReasons = new Set(placeholderReasons);
  const blockerCodes = new Set<SourceReadinessBlockerCode>();
  if (placeholderReasons.size > 0)
    blockerCodes.add('PLACEHOLDER_SOURCE_NOT_ALLOWED');
  if (source.type === 'generic-jsonld')
    blockerCodes.add('SOURCE_TYPE_UNSUPPORTED');
  if (source.type === 'generic-jsonld')
    readinessReasons.add('source type is not supported by collection');
  if (
    (source.type === 'generic-page' || source.type === 'generic-job-list') &&
    source.settings.allowBrowserFallback === true
  ) {
    blockerCodes.add('BROWSER_FALLBACK_EXTERNAL_UNSAFE');
    readinessReasons.add(
      'external browser fallback is disabled by the source network policy',
    );
  }
  const reasonList = [...readinessReasons];
  return {
    id: source.id,
    type: source.type,
    enabled: source.enabled,
    classification: placeholderReasons.size === 0 ? 'REAL' : 'PLACEHOLDER',
    configurationReady: reasonList.length === 0,
    blockerCodes: [...blockerCodes],
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
