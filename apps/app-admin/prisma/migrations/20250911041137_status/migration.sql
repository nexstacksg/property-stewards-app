-- CreateEnum
CREATE TYPE "public"."ChecklistItemStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."Condition" AS ENUM ('GOOD', 'FAIR', 'UNSATISFACTORY', 'NOT_APPLICABLE', 'UN_OBSERVABLE');

-- AlterTable
ALTER TABLE "public"."ContractChecklistItem" ADD COLUMN     "condition" "public"."Condition",
ADD COLUMN     "status" "public"."ChecklistItemStatus" NOT NULL DEFAULT 'PENDING';
