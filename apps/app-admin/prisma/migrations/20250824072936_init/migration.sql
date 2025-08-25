-- CreateEnum
CREATE TYPE "public"."CustomerType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "public"."MemberTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD');

-- CreateEnum
CREATE TYPE "public"."PropertyType" AS ENUM ('HDB', 'CONDO', 'EC', 'APARTMENT', 'LANDED');

-- CreateEnum
CREATE TYPE "public"."PropertySize" AS ENUM ('HDB_1_ROOM', 'HDB_2_ROOM', 'HDB_3_ROOM', 'HDB_4_ROOM', 'HDB_5_ROOM', 'HDB_EXECUTIVE', 'HDB_JUMBO', 'STUDIO', 'ONE_BEDROOM', 'TWO_BEDROOM', 'THREE_BEDROOM', 'FOUR_BEDROOM', 'PENTHOUSE', 'TERRACE', 'SEMI_DETACHED', 'DETACHED', 'BUNGALOW', 'GOOD_CLASS_BUNGALOW');

-- CreateEnum
CREATE TYPE "public"."InspectorType" AS ENUM ('FULL_TIME', 'PART_TIME');

-- CreateEnum
CREATE TYPE "public"."Status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "public"."ContractStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."WorkOrderStatus" AS ENUM ('SCHEDULED', 'STARTED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."CustomerType" NOT NULL,
    "personInCharge" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isMember" BOOLEAN NOT NULL DEFAULT false,
    "memberSince" TIMESTAMP(3),
    "memberExpiredOn" TIMESTAMP(3),
    "memberTier" "public"."MemberTier",
    "billingAddress" TEXT NOT NULL,
    "remarks" TEXT,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,
    "status" "public"."Status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerAddress" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "propertyType" "public"."PropertyType" NOT NULL,
    "propertySize" "public"."PropertySize" NOT NULL,
    "remarks" TEXT,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,
    "status" "public"."Status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Inspector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobilePhone" TEXT NOT NULL,
    "type" "public"."InspectorType" NOT NULL,
    "specialization" TEXT[],
    "remarks" TEXT,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,
    "status" "public"."Status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Inspector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Checklist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "propertyType" "public"."PropertyType" NOT NULL,
    "remarks" TEXT,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,
    "status" "public"."Status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Contract" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "firstPaymentOn" TIMESTAMP(3) NOT NULL,
    "finalPaymentOn" TIMESTAMP(3),
    "basedOnChecklistId" TEXT,
    "scheduledStartDate" TIMESTAMP(3) NOT NULL,
    "scheduledEndDate" TIMESTAMP(3) NOT NULL,
    "actualStartDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "remarks" TEXT,
    "servicePackage" TEXT,
    "customerComments" TEXT,
    "customerRating" INTEGER,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,
    "status" "public"."ContractStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContractChecklist" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,
    "status" "public"."Status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "ContractChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContractChecklistItem" (
    "id" TEXT NOT NULL,
    "contractChecklistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "remarks" TEXT,
    "photos" TEXT[],
    "videos" TEXT[],
    "enteredOn" TIMESTAMP(3),
    "enteredById" TEXT,
    "workOrderId" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ContractChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkOrder" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "scheduledStartDateTime" TIMESTAMP(3) NOT NULL,
    "scheduledEndDateTime" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "signature" TEXT,
    "signOffBy" TEXT,
    "remarks" TEXT,
    "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedOn" TIMESTAMP(3) NOT NULL,
    "status" "public"."WorkOrderStatus" NOT NULL DEFAULT 'SCHEDULED',

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "public"."Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "public"."Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "public"."Customer"("status");

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_idx" ON "public"."CustomerAddress"("customerId");

-- CreateIndex
CREATE INDEX "CustomerAddress_status_idx" ON "public"."CustomerAddress"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Inspector_mobilePhone_key" ON "public"."Inspector"("mobilePhone");

-- CreateIndex
CREATE INDEX "Inspector_mobilePhone_idx" ON "public"."Inspector"("mobilePhone");

-- CreateIndex
CREATE INDEX "Inspector_status_idx" ON "public"."Inspector"("status");

-- CreateIndex
CREATE INDEX "Checklist_propertyType_idx" ON "public"."Checklist"("propertyType");

-- CreateIndex
CREATE INDEX "Checklist_status_idx" ON "public"."Checklist"("status");

-- CreateIndex
CREATE INDEX "ChecklistItem_checklistId_idx" ON "public"."ChecklistItem"("checklistId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItem_checklistId_order_key" ON "public"."ChecklistItem"("checklistId", "order");

-- CreateIndex
CREATE INDEX "Contract_customerId_idx" ON "public"."Contract"("customerId");

-- CreateIndex
CREATE INDEX "Contract_addressId_idx" ON "public"."Contract"("addressId");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "public"."Contract"("status");

-- CreateIndex
CREATE INDEX "Contract_scheduledStartDate_idx" ON "public"."Contract"("scheduledStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "ContractChecklist_contractId_key" ON "public"."ContractChecklist"("contractId");

-- CreateIndex
CREATE INDEX "ContractChecklistItem_contractChecklistId_idx" ON "public"."ContractChecklistItem"("contractChecklistId");

-- CreateIndex
CREATE INDEX "ContractChecklistItem_workOrderId_idx" ON "public"."ContractChecklistItem"("workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractChecklistItem_contractChecklistId_order_key" ON "public"."ContractChecklistItem"("contractChecklistId", "order");

-- CreateIndex
CREATE INDEX "WorkOrder_contractId_idx" ON "public"."WorkOrder"("contractId");

-- CreateIndex
CREATE INDEX "WorkOrder_inspectorId_idx" ON "public"."WorkOrder"("inspectorId");

-- CreateIndex
CREATE INDEX "WorkOrder_status_idx" ON "public"."WorkOrder"("status");

-- CreateIndex
CREATE INDEX "WorkOrder_scheduledStartDateTime_idx" ON "public"."WorkOrder"("scheduledStartDateTime");

-- AddForeignKey
ALTER TABLE "public"."CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "public"."Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "public"."CustomerAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_basedOnChecklistId_fkey" FOREIGN KEY ("basedOnChecklistId") REFERENCES "public"."Checklist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContractChecklist" ADD CONSTRAINT "ContractChecklist_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContractChecklistItem" ADD CONSTRAINT "ContractChecklistItem_contractChecklistId_fkey" FOREIGN KEY ("contractChecklistId") REFERENCES "public"."ContractChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContractChecklistItem" ADD CONSTRAINT "ContractChecklistItem_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "public"."Inspector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContractChecklistItem" ADD CONSTRAINT "ContractChecklistItem_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkOrder" ADD CONSTRAINT "WorkOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkOrder" ADD CONSTRAINT "WorkOrder_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "public"."Inspector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
