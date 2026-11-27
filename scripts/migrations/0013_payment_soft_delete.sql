-- Migracao aditiva 0013: exclusao logica de pagamentos lancados incorretamente.
-- NAO e estorno/refund: o registro original permanece e apenas deixa de compor
-- totais ativos. Nenhum dado historico e apagado ou recalculado.
-- Aplicar somente apos backup verificado e autorizacao expressa.
BEGIN;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;

CREATE INDEX IF NOT EXISTS "Payment_deletedAt_idx" ON "Payment"("deletedAt");
CREATE INDEX IF NOT EXISTS "Payment_deletedByUserId_idx" ON "Payment"("deletedByUserId");

DO $$
BEGIN
  ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_deletedByUserId_fkey"
    FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_deletion_trace_check"
    CHECK (
      "deletedAt" IS NULL
      OR (
        "deletedByUserId" IS NOT NULL
        AND "deletionReason" IS NOT NULL
        AND length(btrim("deletionReason")) >= 5
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
