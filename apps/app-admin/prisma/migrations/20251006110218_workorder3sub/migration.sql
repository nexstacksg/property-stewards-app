-- AlterTable
ALTER TABLE "public"."ChecklistTask" ADD COLUMN     "actions" TEXT[] DEFAULT ARRAY[]::TEXT[];
