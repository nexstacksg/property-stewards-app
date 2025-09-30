-- AlterTable
ALTER TABLE "ContractReport"
ADD COLUMN     "storageKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fileUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fileSizeBytes" INTEGER NOT NULL DEFAULT 0;

-- Remove defaults now that data is migrated
ALTER TABLE "ContractReport"
ALTER COLUMN "storageKey" DROP DEFAULT,
ALTER COLUMN "fileUrl" DROP DEFAULT,
ALTER COLUMN "fileSizeBytes" DROP DEFAULT;
