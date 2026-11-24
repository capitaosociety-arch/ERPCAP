-- Historico aditivo de correcoes administrativas de reservas.
-- Nao altera Rental, Order, OrderItem, Payment, CashRegister ou dados financeiros.
-- Nao executar sem backup verificado e autorizacao expressa.
BEGIN;

CREATE TABLE IF NOT EXISTS "RentalChangeLog" (
  "id" TEXT NOT NULL,
  "rentalId" TEXT NOT NULL,
  "orderId" TEXT,
  "changedByUserId" TEXT,
  "changedByName" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "beforeData" JSONB NOT NULL,
  "afterData" JSONB NOT NULL,
  "changedFields" TEXT[] NOT NULL,
  "requiresFinancialReview" BOOLEAN NOT NULL DEFAULT false,
  "financialDifference" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RentalChangeLog_rentalId_createdAt_idx"
  ON "RentalChangeLog" ("rentalId", "createdAt");
CREATE INDEX IF NOT EXISTS "RentalChangeLog_changedByUserId_idx"
  ON "RentalChangeLog" ("changedByUserId");
CREATE INDEX IF NOT EXISTS "RentalChangeLog_createdAt_idx"
  ON "RentalChangeLog" ("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RentalChangeLog_rentalId_fkey'
  ) THEN
    ALTER TABLE "RentalChangeLog"
      ADD CONSTRAINT "RentalChangeLog_rentalId_fkey"
      FOREIGN KEY ("rentalId") REFERENCES "Rental"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RentalChangeLog_changedByUserId_fkey'
  ) THEN
    ALTER TABLE "RentalChangeLog"
      ADD CONSTRAINT "RentalChangeLog_changedByUserId_fkey"
      FOREIGN KEY ("changedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
