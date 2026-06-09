-- Drop unneeded fields from recurring_bills table
-- Remove monthlyExpectedAmount and customerNumber as per user request

ALTER TABLE "recurring_bills" DROP COLUMN IF EXISTS "monthlyExpectedAmount";
ALTER TABLE "recurring_bills" DROP COLUMN IF EXISTS "customerNumber";
