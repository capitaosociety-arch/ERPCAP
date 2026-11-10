-- ===========================================================================
-- ERPCAP / Capitão Society — Auditoria de RLS, grants e funções
-- SOMENTE LEITURA. Não altera nada.
--
-- Executar no SQL Editor do Supabase (projeto bpiwpnmgwczgojhhytob)
-- com a conta proprietária. Guardar o resultado antes de qualquer mudança.
-- ===========================================================================

-- 1) Sessão e roles relevantes
select current_user as usuario_atual, session_user as usuario_sessao;

select rolname, rolsuper, rolbypassrls, rolcanlogin
from pg_roles
where rolname in ('postgres', 'service_role', 'anon', 'authenticated', 'authenticator')
order by rolname;

-- 2) Dono, RLS e FORCE RLS de cada tabela do schema public
select n.nspname                         as schema,
       c.relname                         as tabela,
       pg_get_userbyid(c.relowner)       as owner,
       c.relrowsecurity                  as rls_ativo,
       c.relforcerowsecurity             as rls_force
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- 3) Policies existentes
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 4) Privilégios efetivos por tabela e role
select grantee,
       table_name,
       string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee, table_name
order by grantee, table_name;

-- 5) Funções SECURITY DEFINER no schema public
select n.nspname                     as schema,
       p.proname                     as funcao,
       pg_get_userbyid(p.proowner)   as owner,
       p.prosecdef                   as security_definer,
       p.proacl                      as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;

-- 6) Privilégios de execução das funções públicas
select routine_schema, routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by routine_name, grantee;

-- 7) Default privileges (o que novas tabelas herdam automaticamente)
select pg_get_userbyid(defaclrole)       as role,
       defaclnamespace::regnamespace     as schema,
       defaclobjtype                     as tipo,
       defaclacl                         as acl
from pg_default_acl
order by 1, 2, 3;

-- 8) Tabelas com RLS desabilitado (visão rápida)
select n.nspname as schema, c.relname as tabela
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by c.relname;

-- 9) Tabelas publicadas no Realtime
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;

-- 10) Buckets do Storage (public vs privado)
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by name;

-- 11) Policies do Storage para objetos
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;

-- 12) Triggers que referenciam handle_new_user
select event_object_schema, event_object_table, trigger_name, action_statement
from information_schema.triggers
where action_statement ilike '%handle_new_user%';
