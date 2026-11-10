-- ===========================================================================
-- ERPCAP / Capitão Society — Policies OPCIONAIS de Realtime
-- NÃO EXECUTAR SEM AUTORIZAÇÃO.
--
-- Contexto:
--   O Dashboard usa Supabase Realtime com a chave ANON nas tabelas
--   Payment, Rental e Order (app/(dashboard)/dashboard/DashboardClient.tsx).
--   Após 02_enable_rls_erpcap.sql (RLS sem policies), o Realtime para.
--
-- Escolha:
--   (A) Recomendado: desativar o Realtime no código e usar refresh
--       server-side. Neste caso NÃO execute este script.
--   (B) Se precisar manter o Realtime: execute este script, ciente de que
--       ele reabre SELECT anônimo SOMENTE nestas 3 tabelas.
--
-- Não criar policies de INSERT/UPDATE/DELETE para anon/authenticated.
-- ===========================================================================

begin;

grant select on table public."Payment", public."Rental", public."Order" to anon;

drop policy if exists "erp_realtime_select_payment" on public."Payment";
create policy "erp_realtime_select_payment"
  on public."Payment" for select to anon using (true);

drop policy if exists "erp_realtime_select_rental" on public."Rental";
create policy "erp_realtime_select_rental"
  on public."Rental" for select to anon using (true);

drop policy if exists "erp_realtime_select_order" on public."Order";
create policy "erp_realtime_select_order"
  on public."Order" for select to anon using (true);

commit;

-- Para reverter este script:
--   drop policy if exists "erp_realtime_select_payment" on public."Payment";
--   drop policy if exists "erp_realtime_select_rental"  on public."Rental";
--   drop policy if exists "erp_realtime_select_order"   on public."Order";
--   revoke select on table public."Payment", public."Rental", public."Order" from anon;
