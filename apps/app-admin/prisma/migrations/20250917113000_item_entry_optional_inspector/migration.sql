-- Allow item entries without inspector reference

ALTER TABLE "ItemEntry"
  ALTER COLUMN "inspectorId" DROP NOT NULL;
