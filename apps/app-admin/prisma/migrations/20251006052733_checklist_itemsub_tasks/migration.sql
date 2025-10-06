/*
  Warnings:

  - You are about to drop the column `action` on the `ChecklistItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."ChecklistItem" DROP COLUMN "action";

ALTER TABLE "public"."ChecklistItem"
ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL';

-- CreateTable
CREATE TABLE "public"."ChecklistItemTask" (
    "id" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL,

    CONSTRAINT "ChecklistItemTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistItemTask_checklistItemId_idx" ON "public"."ChecklistItemTask"("checklistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItemTask_checklistItemId_order_key" ON "public"."ChecklistItemTask"("checklistItemId", "order");

-- AddForeignKey
ALTER TABLE "public"."ChecklistItemTask" ADD CONSTRAINT "ChecklistItemTask_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "public"."ChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
