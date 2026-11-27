-- Verificacao read-only pos-migracao 0013.
-- Nao altera dados.

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Payment'
  AND column_name IN ('deletedAt', 'deletedByUserId', 'deletionReason')
ORDER BY column_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'Payment'
  AND indexname IN ('Payment_deletedAt_idx', 'Payment_deletedByUserId_idx')
ORDER BY indexname;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = '"Payment"'::regclass
  AND conname IN ('Payment_deletedByUserId_fkey', 'Payment_deletion_trace_check')
ORDER BY conname;

SELECT
  (SELECT COUNT(*)::int FROM "Payment") AS payments_total,
  (SELECT COUNT(*)::int FROM "Payment" WHERE "deletedAt" IS NOT NULL) AS payments_deleted,
  (SELECT COALESCE(SUM("amount"), 0) FROM "Payment") AS payments_sum_all,
  (SELECT COALESCE(SUM("amount"), 0) FROM "Payment" WHERE "deletedAt" IS NULL) AS payments_sum_active;
