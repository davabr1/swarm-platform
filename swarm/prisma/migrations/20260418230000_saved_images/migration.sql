-- CreateTable
CREATE TABLE "SavedImage" (
    "walletAddress" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedImage_pkey" PRIMARY KEY ("walletAddress","imageId")
);

-- CreateIndex
CREATE INDEX "SavedImage_walletAddress_savedAt_idx" ON "SavedImage"("walletAddress", "savedAt" DESC);

-- CreateIndex
CREATE INDEX "SavedImage_imageId_idx" ON "SavedImage"("imageId");
