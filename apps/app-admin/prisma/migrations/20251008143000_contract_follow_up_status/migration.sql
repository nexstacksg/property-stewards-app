-- CreateEnum
CREATE TYPE "ContractRemarkType" AS ENUM ('FYI', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "ContractRemarkStatus" AS ENUM ('OPEN', 'COMPLETED');

-- AlterTable
ALTER TABLE "ContractRemark"
  ADD COLUMN     "type" "ContractRemarkType" NOT NULL DEFAULT 'FOLLOW_UP',
  ADD COLUMN     "status" "ContractRemarkStatus" NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE INDEX "ContractRemark_status_idx" ON "ContractRemark"("status");
