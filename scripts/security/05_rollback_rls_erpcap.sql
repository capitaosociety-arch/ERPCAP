-- ===========================================================================
-- ERPCAP / Capitão Society — REVERSÃO DE EMERGÊNCIA do RLS
-- USAR SOMENTE SE A APLICAÇÃO QUEBRAR APÓS 02_enable_rls_erpcap.sql.
--
-- ATENÇÃO: este script REABRE a leitura anônima das 27 tabelas.
-- As revogações de INSERT/UPDATE/DELETE feitas no script 02 permanecem,
-- portanto anon/authenticated continuam sem escrita. Para reverter também
-- as revogações (NÃO recomendado), seria necessário re-conceder privilégios.
--
-- O Prisma (owner) continua funcionando normalmente.
-- ===========================================================================

begin;

alter table public."User"                disable row level security;
alter table public."Customer"            disable row level security;
alter table public."Table"               disable row level security;
alter table public."ProductCategory"     disable row level security;
alter table public."Service"             disable row level security;
alter table public."Stock"               disable row level security;
alter table public."CashRegister"        disable row level security;
alter table public."AuditLog"            disable row level security;
alter table public."PriceHistory"        disable row level security;
alter table public."Subscription"        disable row level security;
alter table public."SubscriptionPayment" disable row level security;
alter table public."Rental"              disable row level security;
alter table public."Payment"             disable row level security;
alter table public."FinancialEntry"      disable row level security;
alter table public."Order"               disable row level security;
alter table public."DepotStock"          disable row level security;
alter table public."CashDeposit"         disable row level security;
alter table public."DepotMovement"       disable row level security;
alter table public."TransferRequest"     disable row level security;
alter table public."CustomerScoreHistory" disable row level security;
alter table public."Product"             disable row level security;
alter table public."OrderItem"           disable row level security;
alter table public."StockMovement"       disable row level security;
alter table public."StockCount"          disable row level security;
alter table public."CustomerScore"       disable row level security;
alter table public."ScoreConfig"         disable row level security;
alter table public."CopilotLog"          disable row level security;

commit;

-- ---------------------------------------------------------------------------
-- LIMITAÇÕES DESTE ROLLBACK (importante):
--   1) Ele NÃO restaura os privilégios de escrita revogados pelo script 02.
--      anon/authenticated continuam sem INSERT/UPDATE/DELETE. Isso é
--      intencional; restaurar escrita não é recomendado.
--   2) Ele NÃO remove as policies criadas pelo script 03 (se aplicado).
--      Elas ficam inertes enquanto o RLS estiver desabilitado, mas voltam
--      a valer se o RLS for reativado. Para removê-las:
--        drop policy if exists "erp_realtime_select_payment" on public."Payment";
--        drop policy if exists "erp_realtime_select_rental"  on public."Rental";
--        drop policy if exists "erp_realtime_select_order"   on public."Order";
--   3) Ele NÃO reverte o script 04. Para reverter (somente com coordenação):
--        alter function public.is_admin() reset search_path;
--        grant execute on function public.is_admin() to anon;
--        grant execute on function public.handle_new_user() to anon, authenticated;
--   4) Reabrir a leitura anônima expõe PII/hashes novamente. Use apenas
--      como emergência e reative o RLS assim que a causa for corrigida.
-- ---------------------------------------------------------------------------

-- Ações adicionais de emergência (se necessário):
--   * Rotacionar a ANON KEY no dashboard do Supabase.
--   * Atualizar NEXT_PUBLIC_SUPABASE_ANON_KEY local e na Vercel.
--   * Revisar logs de acesso e contas criadas em public."User".
