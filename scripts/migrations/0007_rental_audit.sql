-- Migracao 0007 revisada e SUPERSEDIDA pela 0012_rental_audit.sql.
-- A 0007 nunca foi aplicada em producao.
-- Nao aplicar a 0007. A migracao canonica e a 0012_rental_audit.sql.
DO $$
BEGIN
  RAISE EXCEPTION '0007_rental_audit.sql foi substituida por 0012_rental_audit.sql. Aplique a 0012.';
END $$;
