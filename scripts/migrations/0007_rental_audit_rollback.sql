-- Rollback da 0007 nao deve ser executado.
-- A 0007 nunca foi aplicada. O rollback canonico e 0012_rental_audit_rollback.sql.
DO $$
BEGIN
  RAISE EXCEPTION '0007_rental_audit_rollback.sql foi substituido por 0012_rental_audit_rollback.sql.';
END $$;
