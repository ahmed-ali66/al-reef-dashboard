-- Fix totalAmountDue: For bills where totalAmountDue was incorrectly overwritten
-- to equal currentOutstanding after payments, restore it from the latest cycle's amount.
-- This is a one-time data fix migration.

-- Step 1: For bills with open cycles (pending/partially_paid/overdue),
-- set totalAmountDue to the latest open cycle's amount
UPDATE "recurring_bills" rb
SET "totalAmountDue" = lc.amount
FROM (
  SELECT DISTINCT ON (bc."recurringBillId")
    bc."recurringBillId",
    bc.amount
  FROM "bill_cycles" bc
  WHERE bc.status IN ('pending', 'partially_paid', 'overdue')
    AND bc."deletedAt" IS NULL
  ORDER BY bc."recurringBillId", bc."dueDate" DESC
) lc
WHERE rb.id = lc."recurringBillId"
  AND rb."totalAmountDue" <= rb."currentOutstanding"
  AND rb."currentOutstanding" > 0
  AND rb."deletedAt" IS NULL;

-- Step 2: For bills with no open cycles but with paid cycles,
-- set totalAmountDue to the latest paid cycle's amount
UPDATE "recurring_bills" rb
SET "totalAmountDue" = lc.amount
FROM (
  SELECT DISTINCT ON (bc."recurringBillId")
    bc."recurringBillId",
    bc.amount
  FROM "bill_cycles" bc
  WHERE bc.status = 'paid'
    AND bc."deletedAt" IS NULL
  ORDER BY bc."recurringBillId", bc."dueDate" DESC
) lc
WHERE rb.id = lc."recurringBillId"
  AND rb."totalAmountDue" <= rb."currentOutstanding"
  AND rb."currentOutstanding" = 0
  AND rb."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "bill_cycles" bc2
    WHERE bc2."recurringBillId" = rb.id
      AND bc2.status IN ('pending', 'partially_paid', 'overdue')
  );
