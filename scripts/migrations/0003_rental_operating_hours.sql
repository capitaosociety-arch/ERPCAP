-- Grade operacional regular das quadras.
-- NAO EXECUTAR EM PRODUCAO SEM AUTORIZACAO E BACKUP.
-- Aplica a tabela e semeia a regra: segunda a sabado, 18h-23h, FUT5/FUT7.
BEGIN;

CREATE TABLE IF NOT EXISTS "RentalOperatingHour" (
  "id" TEXT PRIMARY KEY,
  "weekday" INTEGER NOT NULL CHECK ("weekday" >= 0 AND "weekday" <= 6),
  "field" TEXT NOT NULL,
  "startMinute" INTEGER NOT NULL CHECK ("startMinute" >= 0 AND "startMinute" < 1440),
  "endMinute" INTEGER NOT NULL CHECK ("endMinute" > "startMinute" AND "endMinute" <= 1440),
  "demandWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "RentalOperatingHour_weekday_field_startMinute_endMinute_key"
  ON "RentalOperatingHour" ("weekday", "field", "startMinute", "endMinute");
CREATE INDEX IF NOT EXISTS "RentalOperatingHour_weekday_field_idx"
  ON "RentalOperatingHour" ("weekday", "field");
CREATE INDEX IF NOT EXISTS "RentalOperatingHour_isActive_idx"
  ON "RentalOperatingHour" ("isActive");

ALTER TABLE "RentalOperatingHour" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "RentalOperatingHour" FROM anon, authenticated;

INSERT INTO "RentalOperatingHour" ("id", "weekday", "field", "startMinute", "endMinute", "demandWeight", "isActive", "createdAt", "updatedAt")
VALUES
  ('rentalcfg-fut5-1', 1, 'FUT5', 1080, 1380, 1, true, now(), now()),
  ('rentalcfg-fut7-1', 1, 'FUT7', 1080, 1380, 1, true, now(), now()),
  ('rentalcfg-fut5-2', 2, 'FUT5', 1080, 1380, 1, true, now(), now()),
  ('rentalcfg-fut7-2', 2, 'FUT7', 1080, 1380, 1, true, now(), now()),
  ('rentalcfg-fut5-3', 3, 'FUT5', 1080, 1380, 1, true, now(), now()),
  ('rentalcfg-fut7-3', 3, 'FUT7', 1080, 1380, 1, true, now(), now()),
  ('rentalcfg-fut5-4', 4, 'FUT5', 1080, 1380, 1, true, now(), now()),
  ('rentalcfg-fut7-4', 4, 'FUT7', 1080, 1380, 1, true, now(), now()),
  ('rentalcfg-fut5-5', 5, 'FUT5', 1080, 1380, 1, true, now(), now()),
  ('rentalcfg-fut7-5', 5, 'FUT7', 1080, 1380, 1, true, now(), now()),
  ('rentalcfg-fut5-6', 6, 'FUT5', 1080, 1380, 1, true, now(), now()),
  ('rentalcfg-fut7-6', 6, 'FUT7', 1080, 1380, 1, true, now(), now())
ON CONFLICT ("weekday", "field", "startMinute", "endMinute") DO NOTHING;

COMMIT;
