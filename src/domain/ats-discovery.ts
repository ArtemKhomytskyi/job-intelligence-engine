import type { AtsProvider } from './categories.js';
import type {
  CompanyConfig,
  DiscoveryEvidence,
  ProviderDiscoveryResult,
} from './company-source.js';

interface DiscoveryRule {
  readonly provider: AtsProvider;
  readonly urlPatterns: readonly RegExp[];
  readonly htmlPatterns: readonly RegExp[];
}

const RULES: readonly DiscoveryRule[] = [
  rule(
    'greenhouse',
    [/(?:boards|job-boards)\.greenhouse\.io|greenhouse\.io\//iu],
    [/boards-api\.greenhouse\.io|greenhouse\.io\/embed/iu],
  ),
  rule(
    'lever',
    [/(?:jobs|api)(?:\.eu)?\.lever\.co\//iu],
    [/api(?:\.eu)?\.lever\.co\/v0\/postings|lever-jobs/iu],
  ),
  rule(
    'ashby',
    [/(?:jobs|api)\.ashbyhq\.com\//iu],
    [/api\.ashbyhq\.com\/posting-api|ashby-job-posting/iu],
  ),
  rule(
    'smartrecruiters',
    [/jobs\.smartrecruiters\.com\/|api\.smartrecruiters\.com\/v1\/companies/iu],
    [/api\.smartrecruiters\.com|smartrecruiters/iu],
  ),
  rule(
    'workable',
    [/(?:apply\.)?workable\.com\//iu],
    [/workable\.com|workable-jobs/iu],
  ),
  rule(
    'bamboohr',
    [/\.bamboohr\.com\/careers/iu],
    [/bamboohr\.com\/careers|bamboohr/iu],
  ),
  rule(
    'recruitee',
    [/\.recruitee\.com(?:\/|$)/iu],
    [/recruitee\.com\/api\/offers|recruitee-careers/iu],
  ),
  rule(
    'teamtailor',
    [/\.teamtailor\.com\//iu],
    [/teamtailor\.com|teamtailor-cdn/iu],
  ),
  rule(
    'personio',
    [/\.jobs\.personio\.(?:de|com)(?:\/|$)/iu],
    [/jobs\.personio\.(?:de|com)|personio/iu],
  ),
  rule('jobvite', [/jobs\.jobvite\.com\//iu], [/jobs\.jobvite\.com|jobvite/iu]),
];

export interface DiscoveryInput {
  readonly company: CompanyConfig;
  readonly requestedUrl?: string;
  readonly finalUrl?: string;
  readonly html?: string;
}

export function discoverAtsProvider(
  input: DiscoveryInput,
): ProviderDiscoveryResult {
  const careersUrl =
    input.finalUrl ??
    input.requestedUrl ??
    input.company.careersUrl ??
    input.company.sourceOverride?.url;
  const base = {
    companyId: input.company.id,
    companyName: input.company.name,
    ...(careersUrl === undefined ? {} : { careersUrl }),
  };
  const override = input.company.sourceOverride;
  if (override !== undefined && isSupportedProvider(override.type))
    return {
      ...base,
      status: 'DISCOVERED',
      provider: override.type,
      confidence: 100,
      method: 'SOURCE_OVERRIDE',
      evidence: [
        {
          method: 'SOURCE_OVERRIDE',
          provider: override.type,
          signal: 'Configured source override.',
          confidence: 100,
        },
      ],
      diagnostics: [],
    };

  const evidence = collectEvidence(input);
  const ranked = [...new Set(evidence.map((item) => item.provider))]
    .map((provider) => ({
      provider,
      evidence: evidence.filter((item) => item.provider === provider),
      confidence: Math.max(
        ...evidence
          .filter((item) => item.provider === provider)
          .map((item) => item.confidence),
      ),
    }))
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.provider.localeCompare(right.provider, 'en-US'),
    );
  const best = ranked[0];
  const tied = best !== undefined && ranked[1]?.confidence === best.confidence;
  if (best === undefined || tied)
    return {
      ...base,
      status: 'UNKNOWN_PROVIDER',
      confidence: 0,
      method: 'UNKNOWN',
      evidence,
      diagnostics: [
        best === undefined
          ? 'No supported ATS fingerprint matched.'
          : 'Discovery evidence was ambiguous between supported providers.',
      ],
    };
  const strongest = [...best.evidence].sort(
    (left, right) =>
      right.confidence - left.confidence ||
      left.signal.localeCompare(right.signal, 'en-US'),
  )[0];
  return {
    ...base,
    status: 'DISCOVERED',
    provider: best.provider,
    confidence: best.confidence,
    method: strongest?.method ?? 'URL_PATTERN',
    evidence,
    diagnostics: [],
  };
}

function collectEvidence(input: DiscoveryInput): readonly DiscoveryEvidence[] {
  const urlCandidates = [
    [input.finalUrl, 'REDIRECT_URL' as const, 98],
    [
      input.requestedUrl ?? input.company.careersUrl,
      'URL_PATTERN' as const,
      96,
    ],
  ] as const;
  const evidence: DiscoveryEvidence[] = [];
  for (const rule of RULES) {
    for (const [value, method, confidence] of urlCandidates) {
      if (value === undefined) continue;
      if (rule.urlPatterns.some((pattern) => pattern.test(value)))
        evidence.push({
          method,
          provider: rule.provider,
          signal: safeSignal(value),
          confidence,
        });
    }
    const html = input.html;
    if (
      html !== undefined &&
      rule.htmlPatterns.some((pattern) => pattern.test(html))
    )
      evidence.push({
        method: 'HTML_FINGERPRINT',
        provider: rule.provider,
        signal: `HTML fingerprint for ${rule.provider}.`,
        confidence: 85,
      });
  }
  return uniqueEvidence(evidence);
}

function rule(
  provider: AtsProvider,
  urlPatterns: readonly RegExp[],
  htmlPatterns: readonly RegExp[],
): DiscoveryRule {
  return { provider, urlPatterns, htmlPatterns };
}

function isAtsProvider(value: string): value is AtsProvider {
  return RULES.some((item) => item.provider === value);
}

function isSupportedProvider(
  value: string,
): value is AtsProvider | 'generic-page' | 'generic-job-list' {
  return (
    value === 'generic-page' ||
    value === 'generic-job-list' ||
    isAtsProvider(value)
  );
}

function safeSignal(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`.slice(0, 300);
  } catch {
    return 'Invalid URL signal omitted.';
  }
}

function uniqueEvidence(
  values: readonly DiscoveryEvidence[],
): readonly DiscoveryEvidence[] {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = `${item.method}|${item.provider}|${item.signal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
