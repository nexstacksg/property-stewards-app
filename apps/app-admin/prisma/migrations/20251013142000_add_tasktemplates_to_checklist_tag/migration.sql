-- Add taskTemplates JSONB column to ChecklistTag if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ChecklistTag'
      AND column_name = 'taskTemplates'
  ) THEN
    ALTER TABLE "public"."ChecklistTag"
      ADD COLUMN "taskTemplates" jsonb;
  END IF;
END $$;

