/*
  Warnings:

  - You are about to drop the column `inspectorId` on the `WorkOrder` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."WorkOrder" DROP CONSTRAINT "WorkOrder_inspectorId_fkey";

-- DropIndex
DROP INDEX "public"."WorkOrder_inspectorId_idx";

-- AlterTable
ALTER TABLE "public"."WorkOrder" DROP COLUMN "inspectorId";

-- CreateTable
CREATE TABLE "public"."_InspectorToWorkOrder" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_InspectorToWorkOrder_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_InspectorToWorkOrder_B_index" ON "public"."_InspectorToWorkOrder"("B");

-- AddForeignKey
ALTER TABLE "public"."_InspectorToWorkOrder" ADD CONSTRAINT "_InspectorToWorkOrder_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Inspector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_InspectorToWorkOrder" ADD CONSTRAINT "_InspectorToWorkOrder_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
