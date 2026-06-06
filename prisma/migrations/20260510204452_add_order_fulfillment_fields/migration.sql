-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "paymentDeadline" TIMESTAMP(3),
ADD COLUMN     "trackingNumber" TEXT;
