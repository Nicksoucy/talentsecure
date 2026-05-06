-- CreateTable
CREATE TABLE "prospect_analyses" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" TEXT[],
    "redFlags" TEXT[],
    "workEnvironments" JSONB NOT NULL DEFAULT '[]',
    "reasoning" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "cvHash" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "processingTimeMs" INTEGER NOT NULL DEFAULT 0,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospect_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prospect_analyses_prospectId_key" ON "prospect_analyses"("prospectId");

-- CreateIndex
CREATE INDEX "prospect_analyses_tier_score_idx" ON "prospect_analyses"("tier", "score");

-- CreateIndex
CREATE INDEX "prospect_analyses_recommendation_idx" ON "prospect_analyses"("recommendation");

-- CreateIndex
CREATE INDEX "prospect_analyses_analyzedAt_idx" ON "prospect_analyses"("analyzedAt");

-- AddForeignKey
ALTER TABLE "prospect_analyses" ADD CONSTRAINT "prospect_analyses_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospect_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
