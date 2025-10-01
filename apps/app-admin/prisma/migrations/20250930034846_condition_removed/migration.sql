/*
  Warnings:

  - The values [UN_OBSERVABLE] on the enum `Condition` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."Condition_new" AS ENUM ('GOOD', 'FAIR', 'UNSATISFACTORY', 'NOT_APPLICABLE');
ALTER TABLE "public"."ContractChecklistItem" ALTER COLUMN "condition" TYPE "public"."Condition_new" USING ("condition"::text::"public"."Condition_new");
ALTER TABLE "public"."ItemEntry" ALTER COLUMN "condition" TYPE "public"."Condition_new" USING ("condition"::text::"public"."Condition_new");
ALTER TABLE "public"."ChecklistTask" ALTER COLUMN "condition" TYPE "public"."Condition_new" USING ("condition"::text::"public"."Condition_new");
ALTER TYPE "public"."Condition" RENAME TO "Condition_old";
ALTER TYPE "public"."Condition_new" RENAME TO "Condition";
DROP TYPE "public"."Condition_old";
COMMIT;
