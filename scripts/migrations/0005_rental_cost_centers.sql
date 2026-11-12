-- A3: centros de custo, alocacoes e regras operacionais.
-- NAO EXECUTAR EM PRODUCAO SEM AUTORIZACAO, BACKUP E REVERSAO.
BEGIN;

CREATE TABLE IF NOT EXISTS "CostCenter" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "CostCenter_code_key" ON "CostCenter" ("code");
CREATE INDEX IF NOT EXISTS "CostCenter_isActive_idx" ON "CostCenter" ("isActive");

CREATE TABLE IF NOT EXISTS "CostAllocation" (
  "id" TEXT PRIMARY KEY,
  "financialEntryId" TEXT NOT NULL,
  "costCenterId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "driver" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "CostAllocation_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry"("id") ON DELETE CASCADE,
  CONSTRAINT "CostAllocation_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CostAllocation_financialEntryId_costCenterId_period_key"
  ON "CostAllocation" ("financialEntryId", "costCenterId", "period");
CREATE INDEX IF NOT EXISTS "CostAllocation_period_idx" ON "CostAllocation" ("period");
CREATE INDEX IF NOT EXISTS "CostAllocation_costCenterId_idx" ON "CostAllocation" ("costCenterId");

CREATE TABLE IF NOT EXISTS "OperatingCostRule" (
  "id" TEXT PRIMARY KEY,
  "costCenterId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ratePerHour" DOUBLE PRECISION,
  "driver" TEXT,
  "effectiveFrom" TIMESTAMPTZ,
  "effectiveTo" TIMESTAMPTZ,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "OperatingCostRule_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id")
);
CREATE INDEX IF NOT EXISTS "OperatingCostRule_costCenterId_idx" ON "OperatingCostRule" ("costCenterId");
CREATE INDEX IF NOT EXISTS "OperatingCostRule_isActive_idx" ON "OperatingCostRule" ("isActive");

ALTER TABLE "CostCenter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OperatingCostRule" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "CostCenter", "CostAllocation", "OperatingCostRule" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION "check_cost_allocation_total"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  entry_amount DOUBLE PRECISION;
  allocated_other DOUBLE PRECISION;
BEGIN
  IF NEW."amount" IS NULL OR NEW."amount" <= 0 THEN
    RAISE EXCEPTION 'CostAllocation amount must be positive';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW."financialEntryId")::bigint);
  SELECT "amount" INTO entry_amount
  FROM "FinancialEntry"
  WHERE "id" = NEW."financialEntryId";
  IF entry_amount IS NULL THEN
    RAISE EXCEPTION 'FinancialEntry not found for CostAllocation';
  END IF;
  SELECT COALESCE(SUM("amount"), 0) INTO allocated_other
  FROM "CostAllocation"
  WHERE "financialEntryId" = NEW."financialEntryId"
    AND "id" <> COALESCE(NEW."id", '');
  IF allocated_other + NEW."amount" > entry_amount + 0.001 THEN
    RAISE EXCEPTION 'CostAllocation total exceeds FinancialEntry amount';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "CostAllocation_total_check" ON "CostAllocation";
CREATE TRIGGER "CostAllocation_total_check"
BEFORE INSERT OR UPDATE ON "CostAllocation"
FOR EACH ROW EXECUTE FUNCTION "check_cost_allocation_total"();

CREATE OR REPLACE FUNCTION "check_financial_entry_allocation_total"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allocated DOUBLE PRECISION;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW."id")::bigint);
  SELECT COALESCE(SUM("amount"), 0) INTO allocated
  FROM "CostAllocation"
  WHERE "financialEntryId" = NEW."id";
  IF allocated > NEW."amount" + 0.001 THEN
    RAISE EXCEPTION 'FinancialEntry amount is lower than allocated CostAllocation total';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "FinancialEntry_allocation_total_check" ON "FinancialEntry";
CREATE TRIGGER "FinancialEntry_allocation_total_check"
BEFORE UPDATE OF "amount" ON "FinancialEntry"
FOR EACH ROW EXECUTE FUNCTION "check_financial_entry_allocation_total"();

INSERT INTO "CostCenter" ("id", "code", "name", "isActive", "createdAt", "updatedAt")
VALUES
  ('costcenter-fut5', 'FUT5', 'Campo FUT5', true, now(), now()),
  ('costcenter-fut7', 'FUT7', 'Campo FUT7', true, now(), now()),
  ('costcenter-bar', 'BAR', 'Bar', true, now(), now()),
  ('costcenter-admin', 'ADMIN', 'Administrativo', true, now(), now())
ON CONFLICT ("code") DO NOTHING;

COMMIT;
