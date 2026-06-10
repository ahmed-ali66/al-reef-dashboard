-- Create bill_cycles table
CREATE TABLE "bill_cycles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recurringBillId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_cycles_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints
ALTER TABLE "bill_cycles" ADD CONSTRAINT "bill_cycles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bill_cycles" ADD CONSTRAINT "bill_cycles_recurringBillId_fkey" FOREIGN KEY ("recurringBillId") REFERENCES "recurring_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX "bill_cycles_companyId_idx" ON "bill_cycles"("companyId");
CREATE INDEX "bill_cycles_recurringBillId_idx" ON "bill_cycles"("recurringBillId");
CREATE INDEX "bill_cycles_status_idx" ON "bill_cycles"("status");
CREATE INDEX "bill_cycles_dueDate_idx" ON "bill_cycles"("dueDate");
CREATE INDEX "bill_cycles_periodStart_periodEnd_idx" ON "bill_cycles"("periodStart", "periodEnd");

-- Add billCycleId to bill_payments (nullable for migration)
ALTER TABLE "bill_payments" ADD COLUMN "billCycleId" TEXT;

-- Create index on billCycleId
CREATE INDEX "bill_payments_billCycleId_idx" ON "bill_payments"("billCycleId");

-- Add foreign key constraint for billCycleId
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_billCycleId_fkey" FOREIGN KEY ("billCycleId") REFERENCES "bill_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MIGRATE EXISTING DATA: Create one BillCycle per existing RecurringBill
-- For each existing active recurring bill, create a cycle from current data
INSERT INTO "bill_cycles" ("id", "companyId", "recurringBillId", "periodStart", "periodEnd", "dueDate", "amount", "paidAmount", "outstandingAmount", "status", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    rb."companyId",
    rb."id",
    -- periodStart: 1 month before nextDueDate
    (rb."nextDueDate" - INTERVAL '1 month')::timestamp(3),
    -- periodEnd: day before nextDueDate
    (rb."nextDueDate" - INTERVAL '1 day')::timestamp(3),
    rb."nextDueDate",
    COALESCE(rb."totalAmountDue", rb."currentOutstanding", 0),
    COALESCE(rb."totalAmountDue", 0) - COALESCE(rb."currentOutstanding", 0),
    COALESCE(rb."currentOutstanding", 0),
    CASE
        WHEN rb."currentOutstanding" = 0 THEN 'paid'
        WHEN rb."nextDueDate" < NOW() AND rb."status" = 'active' THEN 'overdue'
        ELSE 'pending'
    END,
    NOW(),
    NOW()
FROM "recurring_bills" rb
WHERE rb."deletedAt" IS NULL;

-- Link existing bill_payments to their corresponding bill_cycles
UPDATE "bill_payments" bp
SET "billCycleId" = bc."id"
FROM "bill_cycles" bc
WHERE bp."recurringBillId" = bc."recurringBillId"
  AND bp."companyId" = bc."companyId";
