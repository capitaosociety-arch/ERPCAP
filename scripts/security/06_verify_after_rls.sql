-- ===========================================================================
-- ERPCAP / Capitão Society — Verificação pós-RLS
-- SOMENTE LEITURA (exceto o bloco de teste com SET LOCAL ROLE, que é
-- revertido com ROLLBACK e não altera dados).
-- ===========================================================================

-- 1) RLS ativo nas tabelas do ERP
select c.relname as tabela, c.relrowsecurity as rls_ativo, c.relforcerowsecurity as rls_force
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'User','Customer','Table','ProductCategory','Service','Stock','CashRegister',
    'AuditLog','PriceHistory','Subscription','SubscriptionPayment','Rental','Payment',
    'FinancialEntry','Order','DepotStock','CashDeposit','DepotMovement','TransferRequest',
    'CustomerScoreHistory','Product','OrderItem','StockMovement','StockCount',
    'CustomerScore','ScoreConfig','CopilotLog'
  )
order by c.relname;

-- 2) Policies criadas (deve estar vazio, exceto se 03 foi aplicado)
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'User','Customer','Table','ProductCategory','Service','Stock','CashRegister',
    'AuditLog','PriceHistory','Subscription','SubscriptionPayment','Rental','Payment',
    'FinancialEntry','Order','DepotStock','CashDeposit','DepotMovement','TransferRequest',
    'CustomerScoreHistory','Product','OrderItem','StockMovement','StockCount',
    'CustomerScore','ScoreConfig','CopilotLog'
  )
order by tablename, policyname;

-- 3) Privilégios efetivos (INSERT/UPDATE/DELETE devem ser false;
--    SELECT pode ser true, pois não revogamos SELECT).
select 'anon INSERT User'          as teste, has_table_privilege('anon', 'public."User"', 'INSERT') as permitido
union all
select 'anon UPDATE User',                   has_table_privilege('anon', 'public."User"', 'UPDATE')
union all
select 'anon DELETE User',                   has_table_privilege('anon', 'public."User"', 'DELETE')
union all
select 'anon SELECT User',                   has_table_privilege('anon', 'public."User"', 'SELECT')
union all
select 'auth INSERT User',                   has_table_privilege('authenticated', 'public."User"', 'INSERT')
union all
select 'auth SELECT User',                   has_table_privilege('authenticated', 'public."User"', 'SELECT');

-- 4) Teste como anon.
--    SEM o script 03: todas as contagens devem ser 0.
--    COM o script 03: Payment/Order/Rental podem ser > 0 (Realtime).
--    User e Customer devem continuar 0 em ambos os casos.
--    O ROLLBACK garante que nada é alterado.
begin;
set local role anon;
select 'anon User'      as teste, count(*) from public."User";
select 'anon Customer'  as teste, count(*) from public."Customer";
select 'anon Payment'   as teste, count(*) from public."Payment";
select 'anon Order'     as teste, count(*) from public."Order";
select 'anon Rental'    as teste, count(*) from public."Rental";
rollback;

-- 5) Teste como authenticated (deve retornar 0 nas tabelas do ERP,
--    exceto se o script 03 tiver policies para authenticated — ele não tem).
begin;
set local role authenticated;
select 'auth User'      as teste, count(*) from public."User";
select 'auth Customer'  as teste, count(*) from public."Customer";
select 'auth Payment'   as teste, count(*) from public."Payment";
select 'auth Order'     as teste, count(*) from public."Order";
select 'auth Rental'    as teste, count(*) from public."Rental";
rollback;

-- 6) Funções SECURITY DEFINER após 04
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('handle_new_user', 'is_admin')
order by routine_name, grantee;

-- 7) Aplicação (executar fora do SQL Editor):
--    * login (NextAuth) e navegação em todos os módulos;
--    * PDV, comandas, caixa, estoque, depósito, financeiro, clientes,
--      produtos, usuários, inteligência/copiloto, OCR/Storage;
--    * Realtime do dashboard (se 03 foi aplicado).
