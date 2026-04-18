-- UserProfile: swap per-task/per-session caps for a global deposited balance
-- + a single autonomous-spend cap. Fresh install of the treasury custody model.
ALTER TABLE "UserProfile"
  DROP COLUMN "spendCapPerTask",
  DROP COLUMN "spendCapPerSession",
  ADD COLUMN "balanceMicroUsd" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "autonomousCapUsd" TEXT,
  ADD COLUMN "autonomousSpentMicroUsd" BIGINT NOT NULL DEFAULT 0;

-- McpSession: drop the on-chain budget shadow — the global user cap governs.
ALTER TABLE "McpSession"
  DROP COLUMN "budgetUsd",
  DROP COLUMN "spentUsd",
  ADD COLUMN "label" TEXT;

-- Transaction ledger: append-only rows behind the profile's Transactions panel.
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "deltaMicroUsd" BIGINT NOT NULL,
    "grossMicroUsd" BIGINT NOT NULL,
    "description" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "txHash" TEXT,
    "blockNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Transaction_walletAddress_createdAt_idx" ON "Transaction"("walletAddress", "createdAt" DESC);
CREATE INDEX "Transaction_kind_idx" ON "Transaction"("kind");
CREATE UNIQUE INDEX "Transaction_txHash_kind_key" ON "Transaction"("txHash", "kind");

-- Deposit: one row per observed USDC.Transfer → treasury. Dedupe credits by tx hash.
CREATE TABLE "Deposit" (
    "txHash" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "microUsd" BIGINT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "creditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionId" TEXT,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("txHash")
);

CREATE INDEX "Deposit_fromAddress_creditedAt_idx" ON "Deposit"("fromAddress", "creditedAt" DESC);

-- Singleton cursor for the poll-on-read deposit scanner.
CREATE TABLE "DepositScanCursor" (
    "id" TEXT NOT NULL,
    "lastBlock" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositScanCursor_pkey" PRIMARY KEY ("id")
);

-- Seed: start at block 0. First scan will auto-advance to (head -
-- depositConfirmations) without emitting spurious credits because the
-- window is chunked and only matches USDC.Transfer(_, treasury).
INSERT INTO "DepositScanCursor" ("id", "lastBlock", "updatedAt")
VALUES ('usdc', 0, CURRENT_TIMESTAMP);
