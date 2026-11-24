-- Verificacao read-only pos-migracao 0012.
-- Nao altera dados.

SELECT to_regclass('public."RentalAuditRun"')::text AS rental_audit_run,
       to_regclass('public."RentalAuditOccurrence"')::text AS rental_audit_occurrence,
       to_regclass('public."RentalAuditEvent"')::text AS rental_audit_event;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('RentalAuditRun', 'RentalAuditOccurrence', 'RentalAuditEvent')
ORDER BY table_name, ordinal_position;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('RentalAuditRun', 'RentalAuditOccurrence', 'RentalAuditEvent')
ORDER BY tablename, indexname;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
  '"RentalAuditRun"'::regclass,
  '"RentalAuditOccurrence"'::regclass,
  '"RentalAuditEvent"'::regclass
)
ORDER BY conname;

SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('RentalAuditRun', 'RentalAuditOccurrence', 'RentalAuditEvent')
ORDER BY relname;

SELECT
  (SELECT COUNT(*)::int FROM "RentalAuditRun") AS audit_runs,
  (SELECT COUNT(*)::int FROM "RentalAuditOccurrence") AS audit_occurrences,
  (SELECT COUNT(*)::int FROM "RentalAuditEvent") AS audit_events,
  (SELECT COUNT(*)::int FROM "Rental") AS rentals,
  (SELECT COUNT(*)::int FROM "Order") AS orders,
  (SELECT COUNT(*)::int FROM "Payment") AS payments,
  (SELECT COALESCE(SUM(amount), 0) FROM "Payment") AS payments_total,
  (SELECT COUNT(*)::int FROM "RentalChangeLog") AS rental_change_logs;
