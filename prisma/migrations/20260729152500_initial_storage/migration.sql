-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('NEW', 'RECOMMENDED', 'VIEWED', 'APPLIED', 'SKIPPED', 'REJECTED', 'ARCHIVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CollectionRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CollectionSourceStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "JobSource" (
    "id" UUID NOT NULL,
    "configSourceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "settings" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "description" TEXT,
    "canonicalUrl" TEXT NOT NULL,
    "applicationUrl" TEXT,
    "normalizedTitle" TEXT NOT NULL,
    "normalizedCompany" TEXT NOT NULL,
    "locations" JSONB NOT NULL,
    "remotePolicy" TEXT,
    "employmentType" TEXT,
    "seniority" TEXT,
    "salaryMinimum" DECIMAL(14,2),
    "salaryMaximum" DECIMAL(14,2),
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "requiredExperience" JSONB,
    "requiredEducation" TEXT,
    "requiredLanguages" JSONB NOT NULL,
    "skills" JSONB NOT NULL,
    "normalizedSkills" JSONB NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastCollectedAt" TIMESTAMPTZ(3) NOT NULL,
    "currentStatus" "JobStatus" NOT NULL DEFAULT 'NEW',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSourceReference" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastCollectedAt" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobSourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFingerprint" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRevision" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL,
    "changedFields" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "sourceReferenceId" UUID,
    "changeType" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStatusHistory" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus" NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "status" "CollectionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "initiatedBy" TEXT NOT NULL,
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "insertedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRunSourceResult" (
    "id" UUID NOT NULL,
    "collectionRunId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "status" "CollectionSourceStatus" NOT NULL,
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "insertedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "metadata" JSONB,

    CONSTRAINT "CollectionRunSourceResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobScore" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "searchTrackId" TEXT NOT NULL,
    "totalScore" DECIMAL(7,4) NOT NULL,
    "confidence" DECIMAL(7,4) NOT NULL,
    "positiveReasons" JSONB NOT NULL,
    "concerns" JSONB NOT NULL,
    "missingData" JSONB NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreComponent" (
    "id" UUID NOT NULL,
    "scoreId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "rawScore" DECIMAL(7,4) NOT NULL,
    "weight" DECIMAL(7,4) NOT NULL,
    "contribution" DECIMAL(7,4) NOT NULL,
    "confidence" DECIMAL(7,4) NOT NULL,
    "reasons" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "scoreId" UUID NOT NULL,
    "searchTrackId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "recommendationBatch" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_configSourceId_key" ON "JobSource"("configSourceId");

-- CreateIndex
CREATE INDEX "JobSource_enabled_idx" ON "JobSource"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Job_canonicalUrl_key" ON "Job"("canonicalUrl");

-- CreateIndex
CREATE INDEX "Job_currentStatus_idx" ON "Job"("currentStatus");

-- CreateIndex
CREATE INDEX "Job_normalizedCompany_idx" ON "Job"("normalizedCompany");

-- CreateIndex
CREATE INDEX "Job_normalizedTitle_idx" ON "Job"("normalizedTitle");

-- CreateIndex
CREATE INDEX "Job_publishedAt_idx" ON "Job"("publishedAt");

-- CreateIndex
CREATE INDEX "Job_lastCollectedAt_idx" ON "Job"("lastCollectedAt");

-- CreateIndex
CREATE INDEX "JobSourceReference_jobId_idx" ON "JobSourceReference"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSourceReference_sourceId_externalId_key" ON "JobSourceReference"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSourceReference_sourceId_sourceUrl_key" ON "JobSourceReference"("sourceId", "sourceUrl");

-- CreateIndex
CREATE INDEX "JobFingerprint_jobId_idx" ON "JobFingerprint"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobFingerprint_fingerprint_algorithm_version_key" ON "JobFingerprint"("fingerprint", "algorithm", "version");

-- CreateIndex
CREATE INDEX "JobRevision_jobId_changedAt_idx" ON "JobRevision"("jobId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRevision_jobId_revisionNumber_key" ON "JobRevision"("jobId", "revisionNumber");

-- CreateIndex
CREATE INDEX "JobStatusHistory_jobId_changedAt_idx" ON "JobStatusHistory"("jobId", "changedAt");

-- CreateIndex
CREATE INDEX "CollectionRun_startedAt_idx" ON "CollectionRun"("startedAt");

-- CreateIndex
CREATE INDEX "CollectionRun_status_idx" ON "CollectionRun"("status");

-- CreateIndex
CREATE INDEX "CollectionRunSourceResult_sourceId_idx" ON "CollectionRunSourceResult"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionRunSourceResult_collectionRunId_sourceId_key" ON "CollectionRunSourceResult"("collectionRunId", "sourceId");

-- CreateIndex
CREATE INDEX "JobScore_jobId_searchTrackId_calculatedAt_idx" ON "JobScore"("jobId", "searchTrackId", "calculatedAt");

-- CreateIndex
CREATE INDEX "JobScore_scoringVersion_idx" ON "JobScore"("scoringVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreComponent_scoreId_key_key" ON "ScoreComponent"("scoreId", "key");

-- CreateIndex
CREATE INDEX "Recommendation_recommendationBatch_rank_idx" ON "Recommendation"("recommendationBatch", "rank");

-- CreateIndex
CREATE INDEX "Recommendation_jobId_generatedAt_idx" ON "Recommendation"("jobId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_recommendationBatch_jobId_key" ON "Recommendation"("recommendationBatch", "jobId");

-- AddForeignKey
ALTER TABLE "JobSourceReference" ADD CONSTRAINT "JobSourceReference_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSourceReference" ADD CONSTRAINT "JobSourceReference_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFingerprint" ADD CONSTRAINT "JobFingerprint_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRevision" ADD CONSTRAINT "JobRevision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRevision" ADD CONSTRAINT "JobRevision_sourceReferenceId_fkey" FOREIGN KEY ("sourceReferenceId") REFERENCES "JobSourceReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStatusHistory" ADD CONSTRAINT "JobStatusHistory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRunSourceResult" ADD CONSTRAINT "CollectionRunSourceResult_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRunSourceResult" ADD CONSTRAINT "CollectionRunSourceResult_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScore" ADD CONSTRAINT "JobScore_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreComponent" ADD CONSTRAINT "ScoreComponent_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "JobScore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "JobScore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
