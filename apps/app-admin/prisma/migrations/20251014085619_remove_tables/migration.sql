/*
  Warnings:

  - You are about to drop the `ContractContactPerson` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InspectorContractRating` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."ContractContactPerson" DROP CONSTRAINT "ContractContactPerson_contractId_fkey";

-- DropForeignKey
ALTER TABLE "public"."InspectorContractRating" DROP CONSTRAINT "InspectorContractRating_contractId_fkey";

-- DropForeignKey
ALTER TABLE "public"."InspectorContractRating" DROP CONSTRAINT "InspectorContractRating_inspectorId_fkey";

-- AlterTable
ALTER TABLE "public"."Contract" ADD COLUMN     "contactPersons" JSONB,
ADD COLUMN     "inspectorRatings" JSONB;

-- DropTable
DROP TABLE "public"."ContractContactPerson";

-- DropTable
DROP TABLE "public"."InspectorContractRating";
