-- Reversao A1. NAO EXECUTAR SEM AUTORIZACAO.
BEGIN;
UPDATE "Product"
SET "isService" = false,
    "stockControlled" = true,
    "updatedAt" = now()
WHERE "id" IN ('cmo1qf1dq000xl404tjy4un4o', 'cmo1qqegu0001jo04vmz5t0z0');
ALTER TABLE "Product"
  DROP COLUMN IF EXISTS "stockControlled",
  DROP COLUMN IF EXISTS "isService";
COMMIT;
