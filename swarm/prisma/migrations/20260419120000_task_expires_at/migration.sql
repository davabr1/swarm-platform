-- AlterTable
ALTER TABLE "Task" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_expiresAt_idx" ON "Task"("expiresAt");
