-- Migracao aditiva para vinculo entre financeiro e ocupacao de campos.
-- Nao executar sem backup verificado e autorizacao expressa.
BEGIN;

ALTER TABLE "Rental"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'LEGACY';

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "rentalId" TEXT;

CREATE INDEX IF NOT EXISTS "Rental_source_idx" ON "Rental" ("source");
CREATE INDEX IF NOT EXISTS "OrderItem_rentalId_idx" ON "OrderItem" ("rentalId");

-- Um Rental pode ter no maximo um OrderItem ativo; evita cobranca duplicada.
CREATE UNIQUE INDEX IF NOT EXISTS "OrderItem_active_rentalId_key"
  ON "OrderItem" ("rentalId")
  WHERE "rentalId" IS NOT NULL AND "status" = 'ACTIVE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Rental_source_check'
  ) THEN
    ALTER TABLE "Rental"
      ADD CONSTRAINT "Rental_source_check"
      CHECK ("source" IN ('SUBSCRIPTION', 'WALK_IN', 'MANUAL', 'LEGACY')) NOT VALID;
    ALTER TABLE "Rental" VALIDATE CONSTRAINT "Rental_source_check";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_rentalId_fkey'
  ) THEN
    ALTER TABLE "OrderItem"
      ADD CONSTRAINT "OrderItem_rentalId_fkey"
      FOREIGN KEY ("rentalId") REFERENCES "Rental"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
