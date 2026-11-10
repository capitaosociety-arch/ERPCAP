-- ===========================================================================
-- ERPCAP / Capitão Society — Habilitar RLS nas 27 tabelas do ERP
-- NÃO EXECUTAR SEM AUTORIZAÇÃO E SEM BACKUP.
--
-- Pré-requisitos:
--   1) Executar 01_audit_rls_and_grants.sql e guardar o resultado.
--   2) Confirmar que o Prisma de produção conecta como owner
--      (ex.: postgres.<ref>) ou role com BYPASSRLS. Caso contrário,
--      habilitar RLS SEM policies fará a aplicação parar de ler.
--   3) Fazer backup lógico novo do banco.
--
-- Escopo: APENAS as 27 tabelas do ERPCAP. NÃO tocar nas tabelas do outro
-- sistema que compartilha o schema public (admin_*, crm_*, nr01_*,
-- occupational_*, training_*, tenants, profiles etc.).
--
-- Efeito: anon/authenticated passam a ser negados (não há policies).
-- O owner/serviço continua acessando (a menos que FORCE RLS esteja ativo).
-- Não usamos FORCE RLS de propósito, para não quebrar o Prisma owner.
-- ===========================================================================

begin;

alter table public."User"                enable row level security;
alter table public."Customer"            enable row level security;
alter table public."Table"               enable row level security;
alter table public."ProductCategory"     enable row level security;
alter table public."Service"             enable row level security;
alter table public."Stock"               enable row level security;
alter table public."CashRegister"        enable row level security;
alter table public."AuditLog"            enable row level security;
alter table public."PriceHistory"        enable row level security;
alter table public."Subscription"        enable row level security;
alter table public."SubscriptionPayment" enable row level security;
alter table public."Rental"              enable row level security;
alter table public."Payment"             enable row level security;
alter table public."FinancialEntry"      enable row level security;
alter table public."Order"               enable row level security;
alter table public."DepotStock"          enable row level security;
alter table public."CashDeposit"         enable row level security;
alter table public."DepotMovement"       enable row level security;
alter table public."TransferRequest"     enable row level security;
alter table public."CustomerScoreHistory" enable row level security;
alter table public."Product"             enable row level security;
alter table public."OrderItem"           enable row level security;
alter table public."StockMovement"       enable row level security;
alter table public."StockCount"          enable row level security;
alter table public."CustomerScore"       enable row level security;
alter table public."ScoreConfig"         enable row level security;
alter table public."CopilotLog"          enable row level security;

-- Defesa em profundidade: remover escrita direta de anon/authenticated.
-- SELECT é mantido para permitir policies opcionais de Realtime (03).
revoke insert, update, delete, truncate, references, trigger
  on table
    public."User",
    public."Customer",
    public."Table",
    public."ProductCategory",
    public."Service",
    public."Stock",
    public."CashRegister",
    public."AuditLog",
    public."PriceHistory",
    public."Subscription",
    public."SubscriptionPayment",
    public."Rental",
    public."Payment",
    public."FinancialEntry",
    public."Order",
    public."DepotStock",
    public."CashDeposit",
    public."DepotMovement",
    public."TransferRequest",
    public."CustomerScoreHistory",
    public."Product",
    public."OrderItem",
    public."StockMovement",
    public."StockCount",
    public."CustomerScore",
    public."ScoreConfig",
    public."CopilotLog"
  from anon, authenticated;

commit;

-- Verificação imediata (somente leitura):
--   executar 06_verify_after_rls.sql
-- Reversão de emergência:
--   executar 05_rollback_rls_erpcap.sql
