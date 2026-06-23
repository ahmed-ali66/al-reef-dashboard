-- CreateTable
CREATE TABLE "cheques" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "payeeName" TEXT NOT NULL,
    "payeeMobile" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "chequeNumber" TEXT,
    "bankName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidDate" TIMESTAMP(3),
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cheques_companyId_status_idx" ON "cheques"("companyId", "status");

-- CreateIndex
CREATE INDEX "cheques_companyId_dueDate_idx" ON "cheques"("companyId", "dueDate");

-- CreateIndex
CREATE INDEX "cheques_propertyId_idx" ON "cheques"("propertyId");

-- CreateIndex
CREATE INDEX "cheques_status_dueDate_idx" ON "cheques"("status", "dueDate");

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
