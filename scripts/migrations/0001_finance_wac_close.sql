-- Migração aditiva do Financeiro: WAC por local, ledger de custo e fechamento mensal.
-- Não altera tabelas compartilhadas, RLS existente, notas fiscais ou dados históricos.
BEGIN;

ALTER TABLE public."Stock"
  ADD COLUMN IF NOT EXISTS "averageCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE public."DepotStock"
  ADD COLUMN IF NOT EXISTS "averageCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE public."StockMovement"
  ADD COLUMN IF NOT EXISTS "movementKind" TEXT,
  ADD COLUMN IF NOT EXISTS "orderId" TEXT,
  ADD COLUMN IF NOT EXISTS "orderItemId" TEXT;

ALTER TABLE public."DepotMovement"
  ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "movementKind" TEXT;

ALTER TABLE public."PriceHistory"
  ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "landedUnitCost" DOUBLE PRECISION;

ALTER TABLE public."FinancialEntry"
  ADD COLUMN IF NOT EXISTS "entryKind" TEXT,
  ADD COLUMN IF NOT EXISTS "competenceDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "StockMovement_movementKind_idx" ON public."StockMovement"("movementKind");
CREATE INDEX IF NOT EXISTS "StockMovement_orderId_idx" ON public."StockMovement"("orderId");
CREATE INDEX IF NOT EXISTS "StockMovement_orderItemId_idx" ON public."StockMovement"("orderItemId");
CREATE INDEX IF NOT EXISTS "DepotMovement_movementKind_idx" ON public."DepotMovement"("movementKind");
CREATE INDEX IF NOT EXISTS "FinancialEntry_entryKind_idx" ON public."FinancialEntry"("entryKind");
CREATE INDEX IF NOT EXISTS "FinancialEntry_competenceDate_idx" ON public."FinancialEntry"("competenceDate");

CREATE TABLE IF NOT EXISTS public."InventoryCostLedger" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "movementType" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unitCost" DOUBLE PRECISION NOT NULL,
  "totalCost" DOUBLE PRECISION NOT NULL,
  "balanceQty" DOUBLE PRECISION NOT NULL,
  "balanceAvgCost" DOUBLE PRECISION NOT NULL,
  "referenceId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryCostLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryCostLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "InventoryCostLedger_productId_idx" ON public."InventoryCostLedger"("productId");
CREATE INDEX IF NOT EXISTS "InventoryCostLedger_location_idx" ON public."InventoryCostLedger"("location");
CREATE INDEX IF NOT EXISTS "InventoryCostLedger_movementType_idx" ON public."InventoryCostLedger"("movementType");
CREATE INDEX IF NOT EXISTS "InventoryCostLedger_createdAt_idx" ON public."InventoryCostLedger"("createdAt");

CREATE TABLE IF NOT EXISTS public."FinancialPeriodClose" (
  "id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "snapshot" JSONB NOT NULL,
  "revenue" DOUBLE PRECISION NOT NULL,
  "cmv" DOUBLE PRECISION NOT NULL,
  "expenses" DOUBLE PRECISION NOT NULL,
  "result" DOUBLE PRECISION NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "closedAt" TIMESTAMP(3),
  "closedById" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "reopenedById" TEXT,
  "reopenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialPeriodClose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinancialPeriodClose_period_key" ON public."FinancialPeriodClose"("period");
CREATE INDEX IF NOT EXISTS "FinancialPeriodClose_status_idx" ON public."FinancialPeriodClose"("status");

CREATE TABLE IF NOT EXISTS public."FinancialPeriodAudit" (
  "id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reason" TEXT,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialPeriodAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FinancialPeriodAudit_period_idx" ON public."FinancialPeriodAudit"("period");
CREATE INDEX IF NOT EXISTS "FinancialPeriodAudit_createdAt_idx" ON public."FinancialPeriodAudit"("createdAt");

ALTER TABLE public."InventoryCostLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FinancialPeriodClose" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FinancialPeriodAudit" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."InventoryCostLedger" FROM anon, authenticated;
REVOKE ALL ON public."FinancialPeriodClose" FROM anon, authenticated;
REVOKE ALL ON public."FinancialPeriodAudit" FROM anon, authenticated;

GRANT ALL ON public."InventoryCostLedger" TO postgres, service_role;
GRANT ALL ON public."FinancialPeriodClose" TO postgres, service_role;
GRANT ALL ON public."FinancialPeriodAudit" TO postgres, service_role;

COMMIT;
