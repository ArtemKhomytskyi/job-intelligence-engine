ALTER TABLE "JobScore"
ADD COLUMN "opportunityScore" DECIMAL(7,4) NOT NULL DEFAULT 0,
ADD COLUMN "scoreKey" TEXT,
ADD COLUMN "processingDecisionId" UUID,
ADD COLUMN "inputRevisionNumber" INTEGER;

CREATE TABLE "RecommendationBatch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inputHash" TEXT NOT NULL,
    "evaluationTime" TIMESTAMPTZ(3) NOT NULL,
    "requestedLimit" INTEGER NOT NULL,
    "selectedCount" INTEGER NOT NULL,
    "configurationFingerprint" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "selectorVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecommendationBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecommendationBatch_requestedLimit_check" CHECK ("requestedLimit" > 0),
    CONSTRAINT "RecommendationBatch_selectedCount_check" CHECK ("selectedCount" >= 0 AND "selectedCount" <= "requestedLimit")
);

ALTER TABLE "Recommendation" ADD COLUMN "batchId" UUID;

CREATE UNIQUE INDEX "JobScore_scoreKey_key" ON "JobScore"("scoreKey");
CREATE INDEX "JobScore_processingDecisionId_idx" ON "JobScore"("processingDecisionId");
CREATE UNIQUE INDEX "RecommendationBatch_inputHash_key" ON "RecommendationBatch"("inputHash");
CREATE INDEX "RecommendationBatch_evaluationTime_idx" ON "RecommendationBatch"("evaluationTime");
CREATE INDEX "RecommendationBatch_configurationFingerprint_idx" ON "RecommendationBatch"("configurationFingerprint");
CREATE UNIQUE INDEX "Recommendation_batchId_rank_key" ON "Recommendation"("batchId", "rank");
CREATE INDEX "Recommendation_batchId_rank_idx" ON "Recommendation"("batchId", "rank");

ALTER TABLE "JobScore" ADD CONSTRAINT "JobScore_processingDecisionId_fkey" FOREIGN KEY ("processingDecisionId") REFERENCES "JobProcessingDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RecommendationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
