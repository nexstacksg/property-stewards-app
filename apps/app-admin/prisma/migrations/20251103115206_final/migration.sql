-- AlterTable
ALTER TABLE "public"."ItemEntry" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "public"."ItemEntryMedia" ADD COLUMN     "taskId" TEXT,
ALTER COLUMN "entryId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."ChecklistTaskFinding" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "details" JSONB,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTaskFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistTaskFinding_entryId_idx" ON "public"."ChecklistTaskFinding"("entryId");

-- CreateIndex
CREATE INDEX "ChecklistTaskFinding_taskId_idx" ON "public"."ChecklistTaskFinding"("taskId");

-- CreateIndex
CREATE INDEX "ItemEntry_locationId_idx" ON "public"."ItemEntry"("locationId");

-- CreateIndex
CREATE INDEX "ItemEntryMedia_taskId_idx" ON "public"."ItemEntryMedia"("taskId");

-- AddForeignKey
ALTER TABLE "public"."ItemEntry" ADD CONSTRAINT "ItemEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."ContractChecklistLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ItemEntryMedia" ADD CONSTRAINT "ItemEntryMedia_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."ChecklistTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChecklistTaskFinding" ADD CONSTRAINT "ChecklistTaskFinding_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "public"."ItemEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChecklistTaskFinding" ADD CONSTRAINT "ChecklistTaskFinding_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."ChecklistTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
