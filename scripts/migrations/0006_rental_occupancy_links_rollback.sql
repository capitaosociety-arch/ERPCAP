-- Reversao da migracao 0006. Nao altera dados historicos.
BEGIN;

ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_rentalId_fkey";
ALTER TABLE "Rental" DROP CONSTRAINT IF EXISTS "Rental_source_check";
DROP INDEX IF EXISTS "OrderItem_active_rentalId_key";
DROP INDEX IF EXISTS "OrderItem_rentalId_idx";
DROP INDEX IF EXISTS "Rental_source_idx";

ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "rentalId";
ALTER TABLE "Rental" DROP COLUMN IF EXISTS "source";

COMMIT;
