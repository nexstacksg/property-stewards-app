-- CreateTable
CREATE TABLE "ContractReport" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" DECIMAL(4,1) NOT NULL,
    "generatedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,

    CONSTRAINT "ContractReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractReport_contractId_version_key" ON "ContractReport"("contractId", "version");

-- CreateIndex
CREATE INDEX "ContractReport_contractId_idx" ON "ContractReport"("contractId");

-- CreateIndex
CREATE INDEX "ContractReport_generatedOn_idx" ON "ContractReport"("generatedOn");

-- AddForeignKey
ALTER TABLE "ContractReport" ADD CONSTRAINT "ContractReport_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractReport" ADD CONSTRAINT "ContractReport_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
