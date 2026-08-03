import type { PrismaClient } from '@prisma/client';

import {
  COLLECTOR_VERSION,
  type CompanyHealthRecord,
  type CompanyRegistryPort,
  type CrawlHealthSummary,
  type CollectionRunSummary,
  type SourceCollectionSummary,
} from '../../application/index.js';
import type { ProviderDiscoveryResult } from '../../domain/index.js';
import { toPrismaJson } from './prisma-json.js';

export class PrismaCompanyRegistryStore implements CompanyRegistryPort {
  public constructor(private readonly client: PrismaClient) {}

  public async recordDiscovery(
    result: ProviderDiscoveryResult,
    discoveredAt: string,
  ): Promise<void> {
    const data = {
      name: result.companyName,
      careersUrl: result.careersUrl ?? null,
      provider: result.provider ?? null,
      discoveryStatus: result.status,
      discoveryConfidence: result.confidence,
      discoveryMethod: result.method,
      collectorVersion:
        result.provider === undefined ? null : COLLECTOR_VERSION,
      lastDiscoveredAt: new Date(discoveredAt),
      diagnostics: toPrismaJson({
        evidence: result.evidence,
        diagnostics: result.diagnostics,
      }),
    };
    await this.client.companyRegistry.upsert({
      where: { configCompanyId: result.companyId },
      create: { configCompanyId: result.companyId, ...data },
      update: data,
    });
  }

  public async recordCrawl(
    companyId: string,
    run: CollectionRunSummary,
    source: SourceCollectionSummary,
    completedAt: string,
  ): Promise<void> {
    const company = await this.client.companyRegistry.findUniqueOrThrow({
      where: { configCompanyId: companyId },
      select: { id: true },
    });
    const successful = ['SUCCEEDED', 'PARTIALLY_FAILED'].includes(
      source.status,
    );
    await this.client.$transaction([
      this.client.companyCrawlResult.create({
        data: {
          companyId: company.id,
          collectionRunId: run.runId,
          status: source.status,
          startedAt: new Date(
            new Date(completedAt).getTime() - source.durationMs,
          ),
          completedAt: new Date(completedAt),
          durationMs: source.durationMs,
          jobsDiscovered: source.rawJobsFound,
          jobsCreated: source.createdJobs,
          jobsUpdated: source.updatedJobs,
          jobsUnchanged: source.unchangedJobs + source.linkedJobs,
          requestCount: source.requestCount,
          httpFailureCount: source.status === 'FAILED' ? 1 : 0,
          parsingFailureCount: source.invalidJobs,
          errorCode: source.failureCode ?? null,
        },
      }),
      this.client.companyRegistry.update({
        where: { id: company.id },
        data: {
          jobCount: source.rawJobsFound,
          ...(successful
            ? { lastSuccessfulCrawlAt: new Date(completedAt) }
            : {
                lastFailureAt: new Date(completedAt),
                lastFailureCode: source.failureCode ?? 'COLLECTION_FAILED',
              }),
        },
      }),
    ]);
  }

  public async getCompany(
    companyId: string,
  ): Promise<CompanyHealthRecord | undefined> {
    const record = await this.client.companyRegistry.findUnique({
      where: { configCompanyId: companyId },
      include: { _count: { select: { crawlResults: true } } },
    });
    return record === null ? undefined : mapCompany(record);
  }

  public async getHealth(): Promise<CrawlHealthSummary> {
    const records = await this.client.companyRegistry.findMany({
      include: { _count: { select: { crawlResults: true } } },
      orderBy: [{ name: 'asc' }, { configCompanyId: 'asc' }],
    });
    const companies = records.map(mapCompany);
    return {
      companyCount: companies.length,
      discoveredCompanyCount: companies.filter(
        (company) => company.discoveryStatus === 'DISCOVERED',
      ).length,
      unknownProviderCount: companies.filter(
        (company) => company.discoveryStatus === 'UNKNOWN_PROVIDER',
      ).length,
      healthyCompanyCount: companies.filter(
        (company) => company.lastSuccessfulCrawlAt !== undefined,
      ).length,
      failedCompanyCount: companies.filter(
        (company) =>
          company.lastFailureAt !== undefined &&
          (company.lastSuccessfulCrawlAt === undefined ||
            company.lastFailureAt > company.lastSuccessfulCrawlAt),
      ).length,
      totalJobs: companies.reduce((sum, company) => sum + company.jobCount, 0),
      companies,
    };
  }
}

type CompanyRecord = Awaited<
  ReturnType<PrismaClient['companyRegistry']['findMany']>
>[number] & { readonly _count: { readonly crawlResults: number } };

function mapCompany(record: CompanyRecord): CompanyHealthRecord {
  return {
    companyId: record.configCompanyId,
    name: record.name,
    ...(record.careersUrl === null ? {} : { careersUrl: record.careersUrl }),
    ...(record.provider === null ? {} : { provider: record.provider }),
    discoveryStatus: record.discoveryStatus,
    discoveryConfidence: record.discoveryConfidence,
    ...(record.discoveryMethod === null
      ? {}
      : { discoveryMethod: record.discoveryMethod }),
    ...(record.collectorVersion === null
      ? {}
      : { collectorVersion: record.collectorVersion }),
    ...(record.lastDiscoveredAt === null
      ? {}
      : { lastDiscoveredAt: record.lastDiscoveredAt.toISOString() }),
    ...(record.lastSuccessfulCrawlAt === null
      ? {}
      : { lastSuccessfulCrawlAt: record.lastSuccessfulCrawlAt.toISOString() }),
    ...(record.lastFailureAt === null
      ? {}
      : { lastFailureAt: record.lastFailureAt.toISOString() }),
    ...(record.lastFailureCode === null
      ? {}
      : { lastFailureCode: record.lastFailureCode }),
    jobCount: record.jobCount,
    crawlCount: record._count.crawlResults,
  };
}
