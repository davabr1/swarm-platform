-- AlterTable
ALTER TABLE "GuidanceRequest" ADD COLUMN     "settlementStatus" TEXT,
ADD COLUMN     "settlementTxHash" TEXT;

-- AlterTable
ALTER TABLE "ImageGeneration" ADD COLUMN     "settlementStatus" TEXT,
ADD COLUMN     "settlementTxHash" TEXT;
