-- CreateTable
CREATE TABLE "GuidanceRequest" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "askerAddress" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response" TEXT,
    "errorMessage" TEXT,
    "commissionUsd" TEXT,
    "geminiCostUsd" TEXT,
    "platformFeeUsd" TEXT,
    "totalUsd" TEXT,
    "promptTokens" INTEGER,
    "outputTokens" INTEGER,
    "thoughtsTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "GuidanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuidanceRequest_agentId_idx" ON "GuidanceRequest"("agentId");

-- CreateIndex
CREATE INDEX "GuidanceRequest_askerAddress_idx" ON "GuidanceRequest"("askerAddress");
