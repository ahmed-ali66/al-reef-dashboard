-- Migration: Add groupId column to payments table
-- This column was added directly to the production DB via ALTER TABLE on 2026-06-21
-- to support linking group payments to TenantGroup records. This migration brings
-- the Prisma migration history in sync with the actual DB schema.
--
-- The corresponding Prisma schema change (adding `groupId String?` to the Payment model)
-- must be applied separately to prisma/schema.prisma.

-- Add column (idempotent — won't fail if column already exists)
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "groupId" TEXT;

-- Add index for querying payments by group
CREATE INDEX IF NOT EXISTS "payments_groupId_idx" ON "payments"("groupId");

-- Add foreign key constraint to link payments.groupId → tenant_groups.id
-- ON DELETE SET NULL: if a group is deleted, payments keep their data but lose the link
-- ON UPDATE CASCADE: if a group's id changes, payments follow
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'payments_groupId_fkey'
          AND table_name = 'payments'
    ) THEN
        ALTER TABLE "payments" ADD CONSTRAINT "payments_groupId_fkey"
            FOREIGN KEY ("groupId") REFERENCES "tenant_groups"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
