-- Reversao da migracao 0010. Remove apenas o historico de correcoes de reservas.
-- O codigo anterior deve ser restaurado junto caso a publicacao seja revertida.
BEGIN;

DROP TABLE IF EXISTS "RentalChangeLog";

COMMIT;
