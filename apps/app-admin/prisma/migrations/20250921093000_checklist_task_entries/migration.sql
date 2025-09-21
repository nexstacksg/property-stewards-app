-- Adjust ItemEntry to store media and link directly to ChecklistTask
ALTER TABLE "ItemEntry"
  ADD COLUMN "condition" "Condition",
  ADD COLUMN "taskId" TEXT;

-- Allow multiple remarks per inspector/item by removing unique constraint
ALTER TABLE "ItemEntry" DROP CONSTRAINT IF EXISTS "ItemEntry_itemId_inspectorId_key";

-- Maintain referential integrity for task linkage
ALTER TABLE "ItemEntry"
  ADD CONSTRAINT "ItemEntry_taskId_fkey" FOREIGN KEY ("taskId")
  REFERENCES "ChecklistTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ItemEntry_taskId_idx" ON "ItemEntry"("taskId");

-- Checklist tasks no longer hold a direct entry reference
ALTER TABLE "ChecklistTask" DROP CONSTRAINT IF EXISTS "ChecklistTask_entryId_fkey";
ALTER TABLE "ChecklistTask" DROP COLUMN IF EXISTS "entryId";
DROP INDEX IF EXISTS "ChecklistTask_entryId_idx";
