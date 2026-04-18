-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "bountyMicroUsd" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "escrowTransactionId" TEXT,
ADD COLUMN     "payoutBlockNumber" INTEGER,
ADD COLUMN     "payoutTxHash" TEXT;
