CREATE TABLE "CompanyRegistry" (
    "id" UUID NOT NULL,
    "configCompanyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "careersUrl" TEXT,
    "provider" TEXT,
    "discoveryStatus" TEXT NOT NULL,
    "discoveryConfidence" INTEGER NOT NULL DEFAULT 0,
    "discoveryMethod" TEXT,
    "collectorVersion" TEXT,
    "lastDiscoveredAt" TIMESTAMPTZ(3),
    "lastSuccessfulCrawlAt" TIMESTAMPTZ(3),
    "lastFailureAt" TIMESTAMPTZ(3),
    "lastFailureCode" TEXT,
    "jobCount" INTEGER NOT NULL DEFAULT 0,
    "etag" TEXT,
    "lastModified" TEXT,
    "diagnostics" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CompanyRegistry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyCrawlResult" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "collectionRunId" UUID,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "jobsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "jobsCreated" INTEGER NOT NULL DEFAULT 0,
    "jobsUpdated" INTEGER NOT NULL DEFAULT 0,
    "jobsUnchanged" INTEGER NOT NULL DEFAULT 0,
    "jobsRemoved" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "httpFailureCount" INTEGER NOT NULL DEFAULT 0,
    "parsingFailureCount" INTEGER NOT NULL DEFAULT 0,
    "redirectCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "diagnostics" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyCrawlResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyRegistry_configCompanyId_key" ON "CompanyRegistry"("configCompanyId");
CREATE INDEX "CompanyRegistry_provider_idx" ON "CompanyRegistry"("provider");
CREATE INDEX "CompanyRegistry_discoveryStatus_idx" ON "CompanyRegistry"("discoveryStatus");
CREATE INDEX "CompanyCrawlResult_companyId_startedAt_idx" ON "CompanyCrawlResult"("companyId", "startedAt");
CREATE INDEX "CompanyCrawlResult_collectionRunId_idx" ON "CompanyCrawlResult"("collectionRunId");
CREATE INDEX "CompanyCrawlResult_status_idx" ON "CompanyCrawlResult"("status");
ALTER TABLE "CompanyCrawlResult" ADD CONSTRAINT "CompanyCrawlResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CompanyRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyCrawlResult" ADD CONSTRAINT "CompanyCrawlResult_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "HttpCollectionCache" (
    "key" TEXT NOT NULL,
    "responseBody" TEXT NOT NULL,
    "etag" TEXT,
    "lastModified" TEXT,
    "finalUrl" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "HttpCollectionCache_pkey" PRIMARY KEY ("key")
);
