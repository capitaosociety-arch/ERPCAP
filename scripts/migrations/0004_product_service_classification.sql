-- A1: classifica FUT5/FUT7 como servicos sem controle de estoque.
-- NAO EXECUTAR EM PRODUCAO SEM AUTORIZACAO, BACKUP E PLANO DE REVERSAO.
BEGIN;

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "isService" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stockControlled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Product"
SET "isService" = true,
    "stockControlled" = false
WHERE "id" IN ('cmo1qf1dq000xl404tjy4un4o', 'cmo1qqegu0001jo04vmz5t0z0');

COMMIT;
