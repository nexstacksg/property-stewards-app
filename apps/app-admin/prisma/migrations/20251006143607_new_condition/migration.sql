-- AlterTable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'ContractChecklistLocation'
  ) THEN
    ALTER TABLE "public"."ContractChecklistLocation" ALTER COLUMN "updatedOn" DROP DEFAULT;
  END IF;
END
$$;
