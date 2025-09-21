-- Add optional condition to checklist subtasks and leave item entry unchanged
ALTER TABLE "public"."ChecklistTask"
ADD COLUMN "condition" "public"."Condition";
