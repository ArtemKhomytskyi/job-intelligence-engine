ALTER TABLE "Job"
ADD COLUMN "normalizedLocationKey" TEXT,
ADD COLUMN "canonicalApplicationUrl" TEXT,
ADD COLUMN "normalizationVersion" TEXT,
ADD COLUMN "normalizedAt" TIMESTAMPTZ(3),
ADD COLUMN "normalizationIssues" JSONB,
ADD COLUMN "normalizedPayload" JSONB;

CREATE TABLE "JobProcessingRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL,
    "initiatedBy" TEXT NOT NULL,
    "normalizationVersion" TEXT NOT NULL,
    "fingerprintVersion" INTEGER NOT NULL,
    "filterRulesVersion" TEXT NOT NULL,
    "configFingerprint" TEXT NOT NULL,
    "consideredCount" INTEGER NOT NULL DEFAULT 0,
    "normalizedCount" INTEGER NOT NULL DEFAULT 0,
    "normalizationFailedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "possibleDuplicateCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "JobProcessingRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobProcessingDecision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jobId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "primaryJobId" UUID,
    "inputRevisionNumber" INTEGER NOT NULL,
    "normalizationVersion" TEXT NOT NULL,
    "fingerprintVersion" INTEGER NOT NULL,
    "filterRulesVersion" TEXT NOT NULL,
    "configFingerprint" TEXT NOT NULL,
    "processingStatus" TEXT NOT NULL,
    "processingFingerprint" TEXT,
    "duplicateDecision" TEXT,
    "duplicateEvidence" JSONB,
    "hardFilterDecision" TEXT,
    "hardFilterReasons" JSONB,
    "normalizationIssues" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobProcessingDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobProcessingRun_startedAt_idx" ON "JobProcessingRun"("startedAt");
CREATE INDEX "JobProcessingRun_status_idx" ON "JobProcessingRun"("status");
CREATE INDEX "JobProcessingRun_configFingerprint_idx" ON "JobProcessingRun"("configFingerprint");
CREATE UNIQUE INDEX "JobProcessingDecision_jobId_inputRevisionNumber_normalizationVersion_fingerprintVersion_filterRulesVersion_configFingerprint_key" ON "JobProcessingDecision"("jobId", "inputRevisionNumber", "normalizationVersion", "fingerprintVersion", "filterRulesVersion", "configFingerprint");
CREATE INDEX "JobProcessingDecision_runId_idx" ON "JobProcessingDecision"("runId");
CREATE INDEX "JobProcessingDecision_processingStatus_idx" ON "JobProcessingDecision"("processingStatus");
CREATE INDEX "JobProcessingDecision_primaryJobId_idx" ON "JobProcessingDecision"("primaryJobId");
CREATE INDEX "JobProcessingDecision_processingFingerprint_idx" ON "JobProcessingDecision"("processingFingerprint");

ALTER TABLE "JobProcessingDecision" ADD CONSTRAINT "JobProcessingDecision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobProcessingDecision" ADD CONSTRAINT "JobProcessingDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "JobProcessingRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobProcessingDecision" ADD CONSTRAINT "JobProcessingDecision_primaryJobId_fkey" FOREIGN KEY ("primaryJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
