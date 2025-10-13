/*
  Warnings:

  - You are about to drop the column `marketingSource` on the `Contract` table. All the data in the column will be lost.
  - The `propertySizeRange` column on the `CustomerAddress` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."Contract" DROP COLUMN "marketingSource",
ADD COLUMN     "marketingSourceId" TEXT;

-- AlterTable
ALTER TABLE "public"."CustomerAddress" DROP COLUMN "propertySizeRange",
ADD COLUMN     "propertySizeRange" TEXT;

-- DropEnum
DROP TYPE "public"."MarketingSource";

-- DropEnum
DROP TYPE "public"."PropertySizeRange";

-- CreateTable
CREATE TABLE "public"."PropertySizeRangeOption" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."Status" NOT NULL DEFAULT 'ACTIVE',
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertySizeRangeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketingSource" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."Status" NOT NULL DEFAULT 'ACTIVE',
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertySizeRangeOption_code_key" ON "public"."PropertySizeRangeOption"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingSource_code_key" ON "public"."MarketingSource"("code");

-- CreateIndex
CREATE INDEX "MarketingSource_status_idx" ON "public"."MarketingSource"("status");

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_marketingSourceId_fkey" FOREIGN KEY ("marketingSourceId") REFERENCES "public"."MarketingSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
