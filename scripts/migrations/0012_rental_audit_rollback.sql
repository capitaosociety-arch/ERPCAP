-- Reversao da migracao 0012. Remove somente as tabelas de auditoria.
-- Nao altera reservas, comandas, pagamentos, caixas, financeiro, estoque ou DRE.
BEGIN;

DROP TABLE IF EXISTS "RentalAuditEvent";
DROP TABLE IF EXISTS "RentalAuditOccurrence";
DROP TABLE IF EXISTS "RentalAuditRun";

COMMIT;
