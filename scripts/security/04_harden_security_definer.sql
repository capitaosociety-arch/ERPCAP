-- ===========================================================================
-- ERPCAP / Capitão Society — Endurecimento de funções SECURITY DEFINER
-- NÃO EXECUTAR SEM AUTORIZAÇÃO.
--
-- Funções identificadas no schema public (compartilhado com outro sistema):
--   public.handle_new_user()  — SECURITY DEFINER, trigger de auth.users.
--                               No dump, tinha EXECUTE para anon/authenticated.
--   public.is_admin()         — SECURITY DEFINER, usada por policies do outro
--                               sistema (profiles_admin_all). Sem search_path fixo.
--
-- Observações:
--   * handle_new_user() é função de trigger: o disparo não exige EXECUTE do
--     role que faz o INSERT. Revogar EXECUTE de anon/authenticated é seguro
--     para o funcionamento do trigger.
--   * is_admin() é usada por policies do OUTRO sistema com role authenticated.
--     Por isso mantemos EXECUTE para authenticated e revogamos apenas de anon
--     e de PUBLIC. NÃO revogar de authenticated sem revisar o outro sistema.
--   * pgbouncer.get_auth() é interno e não é exposta em public; sem ação.
--   * graphql_public.graphql() é do Supabase GraphQL; avaliar separadamente.
-- ===========================================================================

begin;

-- handle_new_user: remover execução pública/anon/authenticated.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- is_admin: remover execução pública e anônima; manter authenticated.
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Fixar search_path (elimina o WARN do advisor).
-- A função já referencia public.profiles e auth.uid() de forma qualificada.
alter function public.is_admin() set search_path = '';

commit;

-- Verificação (somente leitura):
--   select routine_name, grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_schema = 'public'
--     and routine_name in ('handle_new_user','is_admin')
--   order by routine_name, grantee;
