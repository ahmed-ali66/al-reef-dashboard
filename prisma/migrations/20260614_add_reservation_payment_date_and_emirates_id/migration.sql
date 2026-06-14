-- Add Reservation Payment Date and Emirates ID columns
ALTER TABLE "reservations" ADD COLUMN "depositPaymentDate" TIMESTAMP(3);
ALTER TABLE "reservations" ADD COLUMN "emiratesId" TEXT;
