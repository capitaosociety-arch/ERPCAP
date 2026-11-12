-- Reversao A3. NAO EXECUTAR SEM AUTORIZACAO.
BEGIN;
DROP TRIGGER IF EXISTS "FinancialEntry_allocation_total_check" ON "FinancialEntry";
DROP FUNCTION IF EXISTS "check_financial_entry_allocation_total"();
DROP TRIGGER IF EXISTS "CostAllocation_total_check" ON "CostAllocation";
DROP FUNCTION IF EXISTS "check_cost_allocation_total"();
DROP TABLE IF EXISTS "OperatingCostRule";
DROP TABLE IF EXISTS "CostAllocation";
DROP TABLE IF EXISTS "CostCenter";
COMMIT;
