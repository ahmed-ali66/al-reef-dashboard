-- CreateTable
CREATE TABLE "tenant_groups" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameBn" TEXT,
    "nameUr" TEXT,
    "billingMode" TEXT NOT NULL DEFAULT 'consolidated',
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_groups_companyId_idx" ON "tenant_groups"("companyId");
CREATE INDEX "tenant_groups_propertyId_idx" ON "tenant_groups"("propertyId");
CREATE INDEX "tenant_groups_status_idx" ON "tenant_groups"("status");

-- AddForeignKey: tenant_groups -> companies
ALTER TABLE "tenant_groups" ADD CONSTRAINT "tenant_groups_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: tenant_groups -> properties
ALTER TABLE "tenant_groups" ADD CONSTRAINT "tenant_groups_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add groupId column to tenants
ALTER TABLE "tenants" ADD COLUMN "groupId" TEXT;

-- AddForeignKey: tenants.groupId -> tenant_groups.id
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tenant_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex on tenants.groupId
CREATE INDEX "tenants_groupId_idx" ON "tenants"("groupId");
