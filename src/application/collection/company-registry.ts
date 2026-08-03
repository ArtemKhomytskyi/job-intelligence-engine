import type { ProviderDiscoveryResult } from '../../domain/index.js';
import type {
  CollectionRunSummary,
  SourceCollectionSummary,
} from './models.js';

export const COLLECTOR_VERSION = '2.0.0';

export interface CompanyHealthRecord {
  readonly companyId: string;
  readonly name: string;
  readonly careersUrl?: string;
  readonly provider?: string;
  readonly discoveryStatus: string;
  readonly discoveryConfidence: number;
  readonly discoveryMethod?: string;
  readonly collectorVersion?: string;
  readonly lastDiscoveredAt?: string;
  readonly lastSuccessfulCrawlAt?: string;
  readonly lastFailureAt?: string;
  readonly lastFailureCode?: string;
  readonly jobCount: number;
  readonly crawlCount: number;
}

export interface CrawlHealthSummary {
  readonly companyCount: number;
  readonly discoveredCompanyCount: number;
  readonly unknownProviderCount: number;
  readonly healthyCompanyCount: number;
  readonly failedCompanyCount: number;
  readonly totalJobs: number;
  readonly companies: readonly CompanyHealthRecord[];
}

export interface CompanyRegistryPort {
  recordDiscovery(
    result: ProviderDiscoveryResult,
    discoveredAt: string,
  ): Promise<void>;
  recordCrawl(
    companyId: string,
    run: CollectionRunSummary,
    source: SourceCollectionSummary,
    completedAt: string,
  ): Promise<void>;
  getCompany(companyId: string): Promise<CompanyHealthRecord | undefined>;
  getHealth(): Promise<CrawlHealthSummary>;
}
