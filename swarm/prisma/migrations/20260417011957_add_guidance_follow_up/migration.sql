-- AlterTable
ALTER TABLE "GuidanceRequest" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "replyType" TEXT,
ADD COLUMN     "rootId" TEXT;

-- CreateIndex
CREATE INDEX "GuidanceRequest_rootId_idx" ON "GuidanceRequest"("rootId");
