-- CreateTable
CREATE TABLE "ImageGeneration" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "askerAddress" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "imageUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "model" TEXT,
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

    CONSTRAINT "ImageGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageGeneration_agentId_idx" ON "ImageGeneration"("agentId");

-- CreateIndex
CREATE INDEX "ImageGeneration_askerAddress_idx" ON "ImageGeneration"("askerAddress");
