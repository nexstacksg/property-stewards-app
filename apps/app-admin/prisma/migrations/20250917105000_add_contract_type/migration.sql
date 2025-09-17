-- Add ContractType enum and contractType column

CREATE TYPE "ContractType" AS ENUM ('INSPECTION', 'REPAIR');

ALTER TABLE "Contract"
  ADD COLUMN "contractType" "ContractType" NOT NULL DEFAULT 'INSPECTION';
