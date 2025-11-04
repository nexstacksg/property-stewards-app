-- Ensure ChecklistTaskFinding has a unique constraint on (entryId, taskId)
-- This fixes Prisma upsert errors that rely on the compound unique.

-- 1) Deduplicate any existing duplicate rows, keep the latest by createdOn/id
WITH ranked AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "entryId", "taskId"
      ORDER BY "createdOn" DESC, id DESC
    ) AS rn
  FROM "public"."ChecklistTaskFinding"
)
DELETE FROM "public"."ChecklistTaskFinding" t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- 2) Add the unique index used by Prisma for upsert
CREATE UNIQUE INDEX IF NOT EXISTS "ChecklistTaskFinding_entryId_taskId_key"
ON "public"."ChecklistTaskFinding" ("entryId", "taskId");

