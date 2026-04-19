-- CreateTable
CREATE TABLE "HiddenImage" (
    "walletAddress" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenImage_pkey" PRIMARY KEY ("walletAddress","imageId")
);

-- CreateIndex
CREATE INDEX "HiddenImage_walletAddress_hiddenAt_idx" ON "HiddenImage"("walletAddress", "hiddenAt" DESC);

-- CreateIndex
CREATE INDEX "HiddenImage_imageId_idx" ON "HiddenImage"("imageId");
