-- Rollback da migracao 0013.
-- ATENCAO: remove a marca de exclusao logica. Antes de executar, confira se
-- existem pagamentos excluidos; a trilha textual permanece no AuditLog
-- (acao "Exclusão de Pagamento"), mas o estado estruturado sera perdido.
BEGIN;

ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_deletion_trace_check";
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_deletedByUserId_fkey";

DROP INDEX IF EXISTS "Payment_deletedByUserId_idx";
DROP INDEX IF EXISTS "Payment_deletedAt_idx";

ALTER TABLE "Payment" DROP COLUMN IF EXISTS "deletionReason";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "deletedByUserId";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "deletedAt";

COMMIT;
