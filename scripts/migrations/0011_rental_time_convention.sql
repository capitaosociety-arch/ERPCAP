-- T1: distingue reservas legadas (Fortaleza preservada) de reservas novas em America/Cuiaba.
-- Migracao exclusivamente aditiva. Nenhum timestamp historico e convertido.
-- Nao executar sem backup verificado e autorizacao expressa.
BEGIN;

ALTER TABLE "Rental"
  ADD COLUMN IF NOT EXISTS "timeConvention" TEXT NOT NULL DEFAULT 'LEGACY_FORTALEZA';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Rental_timeConvention_check'
  ) THEN
    ALTER TABLE "Rental"
      ADD CONSTRAINT "Rental_timeConvention_check"
      CHECK ("timeConvention" IN ('LEGACY_FORTALEZA', 'CUIABA')) NOT VALID;
    ALTER TABLE "Rental" VALIDATE CONSTRAINT "Rental_timeConvention_check";
  END IF;
END $$;

COMMIT;
