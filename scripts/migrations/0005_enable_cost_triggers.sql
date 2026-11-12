-- Recuperacao controlada: reabilita os triggers novos da A3.
-- Usar antes de republicar o codigo novo ou apos concluir a recuperacao do codigo anterior.
-- Nao remove nem cria dados.
BEGIN;

ALTER TABLE "CostAllocation" ENABLE TRIGGER "CostAllocation_total_check";
ALTER TABLE "FinancialEntry" ENABLE TRIGGER "FinancialEntry_allocation_total_check";

COMMIT;
