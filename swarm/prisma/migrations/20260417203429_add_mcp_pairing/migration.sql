-- CreateTable
CREATE TABLE "PairCode" (
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PairCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "McpSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "budgetUsd" DOUBLE PRECISION NOT NULL,
    "spentUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PairCode_createdAt_idx" ON "PairCode"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpSession_token_key" ON "McpSession"("token");

-- CreateIndex
CREATE INDEX "McpSession_address_idx" ON "McpSession"("address");

-- CreateIndex
CREATE INDEX "McpSession_token_idx" ON "McpSession"("token");
