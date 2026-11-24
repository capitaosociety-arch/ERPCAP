-- Reversao da migracao 0011.
-- Bloqueia se ja existirem reservas CUIABA, para nao perde-las ou interpreta-las incorretamente.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Rental' AND column_name = 'timeConvention'
  ) THEN
    IF EXISTS (SELECT 1 FROM "Rental" WHERE "timeConvention" = 'CUIABA') THEN
      RAISE EXCEPTION 'Rollback bloqueado: existem reservas com timeConvention CUIABA. Trate esses registros antes de reverter.';
    END IF;
  END IF;
END $$;

ALTER TABLE "Rental" DROP CONSTRAINT IF EXISTS "Rental_timeConvention_check";
ALTER TABLE "Rental" DROP COLUMN IF EXISTS "timeConvention";

COMMIT;
