-- CreateEnum
CREATE TYPE "public"."InspectorContractRatingValue" AS ENUM ('GOOD', 'FAIR', 'BAD');

-- AlterTable
ALTER TABLE "public"."ItemEntry" ADD COLUMN     "cause" TEXT,
ADD COLUMN     "resolution" TEXT;

-- CreateTable
CREATE TABLE "public"."InspectorContractRating" (
    "id" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "rating" "public"."InspectorContractRatingValue" NOT NULL,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectorContractRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspectorContractRating_inspectorId_idx" ON "public"."InspectorContractRating"("inspectorId");

-- CreateIndex
CREATE INDEX "InspectorContractRating_contractId_idx" ON "public"."InspectorContractRating"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectorContractRating_inspectorId_contractId_key" ON "public"."InspectorContractRating"("inspectorId", "contractId");

-- AddForeignKey
ALTER TABLE "public"."InspectorContractRating" ADD CONSTRAINT "InspectorContractRating_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "public"."Inspector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InspectorContractRating" ADD CONSTRAINT "InspectorContractRating_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
