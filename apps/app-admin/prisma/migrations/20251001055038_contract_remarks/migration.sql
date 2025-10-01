/*
  Warnings:

  - The values [RANGE_800_1200] on the enum `PropertySizeRange` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."PropertySizeRange_new" AS ENUM ('RANGE_50_399', 'RANGE_400_699', 'RANGE_700_899', 'RANGE_900_1200', 'RANGE_1201_1399', 'RANGE_1400_1599', 'RANGE_1600_1999', 'RANGE_2000_PLUS');
ALTER TABLE "public"."CustomerAddress" ALTER COLUMN "propertySizeRange" TYPE "public"."PropertySizeRange_new" USING ("propertySizeRange"::text::"public"."PropertySizeRange_new");
ALTER TYPE "public"."PropertySizeRange" RENAME TO "PropertySizeRange_old";
ALTER TYPE "public"."PropertySizeRange_new" RENAME TO "PropertySizeRange";
DROP TYPE "public"."PropertySizeRange_old";
COMMIT;

-- CreateTable
CREATE TABLE "public"."ContractRemark" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ContractRemark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChecklistTag" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractRemark_contractId_idx" ON "public"."ContractRemark"("contractId");

-- CreateIndex
CREATE INDEX "ContractRemark_createdOn_idx" ON "public"."ContractRemark"("createdOn");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTag_label_key" ON "public"."ChecklistTag"("label");

-- CreateIndex
CREATE INDEX "ChecklistTag_label_idx" ON "public"."ChecklistTag"("label");

-- AddForeignKey
ALTER TABLE "public"."ContractRemark" ADD CONSTRAINT "ContractRemark_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContractRemark" ADD CONSTRAINT "ContractRemark_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
