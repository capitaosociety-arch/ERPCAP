-- Migracao aditiva para persistir o saldo do Deposito (Matriz) no momento da contagem.
-- Registros anteriores permanecem com NULL e devem ser exibidos como "—".
-- Nao executar sem backup verificado e autorizacao expressa.
BEGIN;

ALTER TABLE "StockCount"
  ADD COLUMN IF NOT EXISTS "systemQuantity" DOUBLE PRECISION;

COMMIT;
