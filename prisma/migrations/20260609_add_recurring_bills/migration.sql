-- CreateTable
CREATE TABLE "recurring_bills" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "accountNumber" TEXT,
    "contractNumber" TEXT,
    "currentOutstanding" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "previousOutstanding" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmountDue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lastPaymentAmount" DECIMAL(10,2),
    "lastPaymentDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "billingFrequency" TEXT NOT NULL DEFAULT 'monthly',
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "attachmentUrls" TEXT,
    "buildingName" TEXT,
    "ownerName" TEXT,
    "propertyManager" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "recurring_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recurringBillId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "outstandingBefore" DECIMAL(10,2) NOT NULL,
    "outstandingAfter" DECIMAL(10,2) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_bills_companyId_idx" ON "recurring_bills"("companyId");
CREATE INDEX "recurring_bills_propertyId_idx" ON "recurring_bills"("propertyId");
CREATE INDEX "recurring_bills_serviceType_idx" ON "recurring_bills"("serviceType");
CREATE INDEX "recurring_bills_status_idx" ON "recurring_bills"("status");
CREATE INDEX "recurring_bills_nextDueDate_idx" ON "recurring_bills"("nextDueDate");
CREATE INDEX "recurring_bills_deletedAt_idx" ON "recurring_bills"("deletedAt");

-- CreateIndex
CREATE INDEX "bill_payments_companyId_idx" ON "bill_payments"("companyId");
CREATE INDEX "bill_payments_recurringBillId_idx" ON "bill_payments"("recurringBillId");
CREATE INDEX "bill_payments_paymentDate_idx" ON "bill_payments"("paymentDate");

-- AddForeignKey
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_recurringBillId_fkey" FOREIGN KEY ("recurringBillId") REFERENCES "recurring_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
