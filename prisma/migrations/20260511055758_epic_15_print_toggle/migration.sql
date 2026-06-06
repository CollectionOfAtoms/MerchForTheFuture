/*
  Warnings:

  - You are about to drop the column `printListingId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the `PrintListing` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_printListingId_fkey";

-- DropForeignKey
ALTER TABLE "PrintListing" DROP CONSTRAINT "PrintListing_artworkId_fkey";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "printListingId";

-- AlterTable
ALTER TABLE "OriginalListing" ADD COLUMN     "availableForPrint" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "printProducts" JSONB,
ADD COLUMN     "printSourceImageUrl" TEXT;

-- DropTable
DROP TABLE "PrintListing";

-- CreateIndex
CREATE INDEX "OriginalListing_availableForPrint_idx" ON "OriginalListing"("availableForPrint");
