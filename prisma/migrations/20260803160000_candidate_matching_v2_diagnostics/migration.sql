CREATE TABLE "RecommendationEvaluation" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "processingDecisionId" UUID NOT NULL,
    "inputRevisionNumber" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "exclusionReason" TEXT,
    "threshold" DECIMAL(7,4) NOT NULL,
    "selectedTrackId" TEXT,
    "totalScore" DECIMAL(7,4),
    "candidateFitScore" DECIMAL(7,4),
    "opportunityScore" DECIMAL(7,4),
    "completeness" DECIMAL(7,4),
    "components" JSONB,
    "trackEvaluations" JSONB NOT NULL,
    "positiveReasons" JSONB,
    "concerns" JSONB,
    "missingData" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecommendationEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecommendationEvaluation_batchId_jobId_key" ON "RecommendationEvaluation"("batchId", "jobId");
CREATE INDEX "RecommendationEvaluation_batchId_outcome_idx" ON "RecommendationEvaluation"("batchId", "outcome");
CREATE INDEX "RecommendationEvaluation_jobId_createdAt_idx" ON "RecommendationEvaluation"("jobId", "createdAt");
CREATE INDEX "RecommendationEvaluation_processingDecisionId_idx" ON "RecommendationEvaluation"("processingDecisionId");

ALTER TABLE "RecommendationEvaluation" ADD CONSTRAINT "RecommendationEvaluation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RecommendationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvaluation" ADD CONSTRAINT "RecommendationEvaluation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvaluation" ADD CONSTRAINT "RecommendationEvaluation_processingDecisionId_fkey" FOREIGN KEY ("processingDecisionId") REFERENCES "JobProcessingDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
