/*
  Warnings:

  - You are about to drop the column `photos` on the `ContractChecklistItem` table. All the data in the column will be lost.
  - You are about to drop the column `tasks` on the `ContractChecklistItem` table. All the data in the column will be lost.
  - You are about to drop the column `videos` on the `ContractChecklistItem` table. All the data in the column will be lost.
  - You are about to drop the column `photos` on the `ItemEntry` table. All the data in the column will be lost.
  - You are about to drop the column `videos` on the `ItemEntry` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."ChecklistTaskStatus" AS ENUM ('PENDING', 'COMPLETED');

-- DropForeignKey
ALTER TABLE "public"."ItemEntry" DROP CONSTRAINT "ItemEntry_inspectorId_fkey";

-- AlterTable
ALTER TABLE "public"."ContractChecklistItem" DROP COLUMN "photos",
DROP COLUMN "tasks",
DROP COLUMN "videos";

-- AlterTable
ALTER TABLE "public"."ItemEntry" DROP COLUMN "photos",
DROP COLUMN "videos";

-- CreateTable
CREATE TABLE "public"."ChecklistTask" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "entryId" TEXT,
    "inspectorId" TEXT,
    "name" TEXT NOT NULL,
    "status" "public"."ChecklistTaskStatus" NOT NULL DEFAULT 'PENDING',
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistTask_itemId_idx" ON "public"."ChecklistTask"("itemId");

-- CreateIndex
CREATE INDEX "ChecklistTask_entryId_idx" ON "public"."ChecklistTask"("entryId");

-- CreateIndex
CREATE INDEX "ChecklistTask_inspectorId_idx" ON "public"."ChecklistTask"("inspectorId");

-- AddForeignKey
ALTER TABLE "public"."ItemEntry" ADD CONSTRAINT "ItemEntry_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "public"."Inspector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChecklistTask" ADD CONSTRAINT "ChecklistTask_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."ContractChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChecklistTask" ADD CONSTRAINT "ChecklistTask_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "public"."ItemEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChecklistTask" ADD CONSTRAINT "ChecklistTask_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "public"."Inspector"("id") ON DELETE SET NULL ON UPDATE CASCADE;
