-- Permissao independente para o modulo Agenda.
-- Migracao aditiva: adiciona a coluna e preserva o acesso existente da regra anterior.
-- Nao altera reservas, pagamentos, caixa, estoque, DRE ou dados financeiros.
-- Executar uma unica vez, apos backup verificado e autorizacao expressa.
BEGIN;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "permAgenda" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
  SET "permAgenda" = "permInteligencia"
  WHERE "permAgenda" IS DISTINCT FROM "permInteligencia";

COMMIT;
