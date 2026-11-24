-- Reversao da migracao 0009. Remove apenas a permissao exclusiva da Agenda.
-- O codigo anterior deve ser restaurado junto para que a Agenda volte a usar permInteligencia.
BEGIN;

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "permAgenda";

COMMIT;
