-- Restructure checklist hierarchy: introduce ContractChecklistLocation and link tasks to it.

-- Create second-level location table
CREATE TABLE "public"."ContractChecklistLocation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."ChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
    "order" INTEGER,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractChecklistLocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContractChecklistLocation_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "public"."ContractChecklistItem"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ContractChecklistLocation_itemId_idx"
  ON "public"."ContractChecklistLocation"("itemId");

CREATE INDEX "ContractChecklistLocation_status_idx"
  ON "public"."ContractChecklistLocation"("status");

-- Extend checklist tasks to reference the new location table
ALTER TABLE "public"."ChecklistTask"
  ADD COLUMN "locationId" TEXT;

ALTER TABLE "public"."ChecklistTask"
  ADD CONSTRAINT "ChecklistTask_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "public"."ContractChecklistLocation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ChecklistTask_locationId_idx"
  ON "public"."ChecklistTask"("locationId");

-- Remove any legacy columns that are no longer part of the model
ALTER TABLE "public"."ContractChecklistItem"
  DROP COLUMN IF EXISTS "actions";

ALTER TABLE "public"."ChecklistTask"
  DROP COLUMN IF EXISTS "actions";
