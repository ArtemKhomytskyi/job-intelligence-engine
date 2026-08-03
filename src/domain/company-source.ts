import type { AtsProvider, SourceType } from './categories.js';
import type { SourceTrackPolicy } from './source-config.js';

export interface CompanyConfig {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly careersUrl?: string;
  readonly websiteUrl?: string;
  readonly tags: readonly string[];
  readonly trackIds: readonly string[];
  readonly trackPolicy: SourceTrackPolicy;
  readonly sourceOverride?: CompanySourceOverride;
}

export interface CompanySourceOverride {
  readonly type: SourceType;
  readonly identifier?: string;
  readonly url?: string;
}

export type DiscoveredProvider =
  AtsProvider | 'generic-page' | 'generic-job-list';

export type DiscoveryMethod =
  | 'SOURCE_OVERRIDE'
  | 'URL_PATTERN'
  | 'HTML_FINGERPRINT'
  | 'REDIRECT_URL'
  | 'UNKNOWN';

export interface DiscoveryEvidence {
  readonly method: Exclude<DiscoveryMethod, 'UNKNOWN'>;
  readonly provider: DiscoveredProvider;
  readonly signal: string;
  readonly confidence: number;
}

export interface ProviderDiscoveryResult {
  readonly status: 'DISCOVERED' | 'UNKNOWN_PROVIDER';
  readonly companyId: string;
  readonly companyName: string;
  readonly careersUrl?: string;
  readonly provider?: DiscoveredProvider;
  readonly confidence: number;
  readonly method: DiscoveryMethod;
  readonly evidence: readonly DiscoveryEvidence[];
  readonly diagnostics: readonly string[];
}
