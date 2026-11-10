# ===========================================================================
# ERPCAP / Capitão Society — Teste isolado dos scripts de RLS
# NÃO usa produção, NÃO usa dados reais. Sobe um Postgres descartável
# via Docker, carrega o baseline (tabelas vazias) e testa 02/05/06.
#
# Pré-requisitos:
#   * Docker Desktop em execução
#   * Imagem postgres:16 (será baixada se não existir)
#
# Uso (a partir da raiz do repositório):
#   powershell -ExecutionPolicy Bypass -File .\scripts\security\test_isolated_rls.ps1
#
# O container é removido ao final em caso de sucesso. Em caso de falha,
# ele é mantido para inspeção (o nome é informado no console).
# ===========================================================================
param(
    [string]$Container = "erpcap-rls-test",
    [int]$Port = 55432
)

$ErrorActionPreference = "Stop"

$repoRoot      = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$baseline      = Join-Path $repoRoot "scripts\migrations\0000_baseline.sql"
$rlsScript     = Join-Path $PSScriptRoot "02_enable_rls_erpcap.sql"
$verifyScript  = Join-Path $PSScriptRoot "06_verify_after_rls.sql"
$rollbackScript= Join-Path $PSScriptRoot "05_rollback_rls_erpcap.sql"

foreach ($f in @($baseline, $rlsScript, $verifyScript, $rollbackScript)) {
    if (-not (Test-Path -LiteralPath $f)) { throw "Arquivo nao encontrado: $f" }
}

docker --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker nao encontrado no PATH." }

# Remove eventual container anterior com o mesmo nome
docker rm -f $Container 2>$null | Out-Null

Write-Host "Subindo Postgres descartavel ($Container) na porta $Port..."
docker run --name $Container -e "POSTGRES_PASSWORD=erpcap_test_only" -p "${Port}:5432" -d postgres:16 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Falha ao iniciar o container." }

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    docker exec $Container pg_isready -U postgres 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    docker rm -f $Container | Out-Null
    throw "Postgres nao ficou pronto a tempo."
}

try {
    Write-Host "Criando roles anon/authenticated/service_role..."
    $rolesSql = @'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
'@
    $rolesSql | docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "Falha ao criar roles." }

    Write-Host "Carregando baseline (tabelas vazias, sem dados reais)..."
    Get-Content -Raw -LiteralPath $baseline | docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "Falha ao carregar baseline." }

    Write-Host "Simulando grants abertos do Supabase (ALL para anon/authenticated)..."
    $grantsSql = @'
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
'@
    $grantsSql | docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar grants de simulacao." }

    Write-Host "Aplicando 02_enable_rls_erpcap.sql..."
    Get-Content -Raw -LiteralPath $rlsScript | docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar RLS (02)." }

    Write-Host "Executando 06_verify_after_rls.sql..."
    Get-Content -Raw -LiteralPath $verifyScript | docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "Falha na verificacao (06)." }

    Write-Host "Testando rollback 05_rollback_rls_erpcap.sql..."
    Get-Content -Raw -LiteralPath $rollbackScript | docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw "Falha no rollback (05)." }

    Write-Host ""
    Write-Host "OK: scripts 02/06/05 executaram no ambiente isolado." -ForegroundColor Green
    Write-Host "Container: $Container | porta: $Port | banco: postgres | usuario: postgres"
    Write-Host "Removendo container de teste..."
    docker rm -f $Container | Out-Null
    Write-Host "Teste isolado concluido." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "FALHA no teste isolado. Container mantido para inspecao: $Container" -ForegroundColor Red
    Write-Host "Para limpar depois: docker rm -f $Container" -ForegroundColor Yellow
    throw
}
