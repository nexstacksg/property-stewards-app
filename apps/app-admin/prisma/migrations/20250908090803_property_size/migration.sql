-- CreateTable
CREATE TABLE "public"."PropertySizeOption" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,
    "status" "public"."Status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "PropertySizeOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertySizeOption_propertyId_idx" ON "public"."PropertySizeOption"("propertyId");

-- CreateIndex
CREATE INDEX "PropertySizeOption_status_idx" ON "public"."PropertySizeOption"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PropertySizeOption_propertyId_code_key" ON "public"."PropertySizeOption"("propertyId", "code");

-- AddForeignKey
ALTER TABLE "public"."PropertySizeOption" ADD CONSTRAINT "PropertySizeOption_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "public"."Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
