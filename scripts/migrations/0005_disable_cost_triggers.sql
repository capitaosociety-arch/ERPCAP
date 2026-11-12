-- Recuperacao controlada: desabilita apenas os triggers novos da A3.
-- NAO EXECUTAR SEM AUTORIZACAO, JANELA SEM GRAVACOES E BACKUP.
-- Nao remove tabelas, alocacoes, regras, funcoes, policies ou dados.
-- Usar somente depois de reverter o codigo da Vercel para a versao anterior.
BEGIN;

ALTER TABLE "CostAllocation" DISABLE TRIGGER "CostAllocation_total_check";
ALTER TABLE "FinancialEntry" DISABLE TRIGGER "FinancialEntry_allocation_total_check";

COMMIT;
