-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "minReputation" DOUBLE PRECISION,
ADD COLUMN     "posterRatedAt" TIMESTAMP(3),
ADD COLUMN     "posterRating" INTEGER,
ADD COLUMN     "requiredSkill" TEXT,
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'private';

-- CreateTable
CREATE TABLE "UserProfile" (
    "walletAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "email" TEXT,
    "spendCapPerTask" TEXT,
    "spendCapPerSession" TEXT,
    "autoTopup" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("walletAddress")
);

-- CreateIndex
CREATE INDEX "Task_assignedTo_idx" ON "Task"("assignedTo");

-- CreateIndex
CREATE INDEX "Task_requiredSkill_idx" ON "Task"("requiredSkill");
