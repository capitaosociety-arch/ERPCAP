-- Reversao da migracao 0008. Nao altera quantidade contada nem demais dados historicos.
BEGIN;

ALTER TABLE "StockCount"
  DROP COLUMN IF EXISTS "systemQuantity";

COMMIT;
