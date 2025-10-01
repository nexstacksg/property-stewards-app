/*
  Warnings:

  - The values [CLOSED] on the enum `ContractStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."PropertyRelationship" AS ENUM ('AGENT', 'OWNER', 'TENANT');

-- CreateEnum
CREATE TYPE "public"."PropertySizeRange" AS ENUM ('RANGE_800_1200', 'RANGE_1201_1399', 'RANGE_1400_1599', 'RANGE_1600_1999', 'RANGE_2000_PLUS');

-- CreateEnum
CREATE TYPE "public"."MarketingSource" AS ENUM ('GOOGLE', 'REFERRAL', 'OTHERS');

-- AlterEnum
BEGIN;
CREATE TYPE "public"."ContractStatus_new" AS ENUM ('DRAFT', 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'TERMINATED', 'CANCELLED');
ALTER TABLE "public"."Contract" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Contract" ALTER COLUMN "status" TYPE "public"."ContractStatus_new" USING ("status"::text::"public"."ContractStatus_new");
ALTER TYPE "public"."ContractStatus" RENAME TO "ContractStatus_old";
ALTER TYPE "public"."ContractStatus_new" RENAME TO "ContractStatus";
DROP TYPE "public"."ContractStatus_old";
ALTER TABLE "public"."Contract" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterTable
ALTER TABLE "public"."Contract" ADD COLUMN     "marketingSource" "public"."MarketingSource",
ADD COLUMN     "referenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "public"."CustomerAddress" ADD COLUMN     "propertySizeRange" "public"."PropertySizeRange",
ADD COLUMN     "relationship" "public"."PropertyRelationship";

-- CreateTable
CREATE TABLE "public"."ContractContactPerson" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "relation" TEXT,

    CONSTRAINT "ContractContactPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractContactPerson_contractId_idx" ON "public"."ContractContactPerson"("contractId");

-- AddForeignKey
ALTER TABLE "public"."ContractContactPerson" ADD CONSTRAINT "ContractContactPerson_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
