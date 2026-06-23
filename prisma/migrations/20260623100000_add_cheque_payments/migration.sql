-- CreateTable
CREATE TABLE "cheque_payments" (
    "id" TEXT NOT NULL,
    "chequeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cheque_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cheque_payments_chequeId_idx" ON "cheque_payments"("chequeId");

-- CreateIndex
CREATE INDEX "cheque_payments_companyId_paymentDate_idx" ON "cheque_payments"("companyId", "paymentDate");

-- CreateIndex
CREATE INDEX "cheque_payments_paymentDate_idx" ON "cheque_payments"("paymentDate");

-- AddForeignKey
ALTER TABLE "cheque_payments" ADD CONSTRAINT "cheque_payments_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "cheques"("id") ON DELETE CASCADE ON UPDATE CASCADE;
