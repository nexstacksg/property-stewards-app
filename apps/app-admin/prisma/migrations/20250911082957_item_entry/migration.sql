-- CreateTable
CREATE TABLE "public"."ItemEntry" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "remarks" TEXT,
    "photos" TEXT[],
    "videos" TEXT[],
    "includeInReport" BOOLEAN NOT NULL DEFAULT false,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemEntry_itemId_idx" ON "public"."ItemEntry"("itemId");

-- CreateIndex
CREATE INDEX "ItemEntry_inspectorId_idx" ON "public"."ItemEntry"("inspectorId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemEntry_itemId_inspectorId_key" ON "public"."ItemEntry"("itemId", "inspectorId");

-- AddForeignKey
ALTER TABLE "public"."ItemEntry" ADD CONSTRAINT "ItemEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."ContractChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ItemEntry" ADD CONSTRAINT "ItemEntry_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "public"."Inspector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
