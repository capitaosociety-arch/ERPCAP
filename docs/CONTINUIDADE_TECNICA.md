# Continuidade Técnica — Capitão Society ERP

**Última atualização:** 24/11/2026  
**Documento de referência permanente:** `AGENTS.md` (não substituído por este arquivo)  
**Branch:** `dev/inteligencia-p3`  
**Commit atual:** `7eba295a93ce81a71ab823e6f5b6e03e8f063e94`  
**Deployment de produção:** `dpl_AkBhnFSYvYbosqjWx3C7TeSMMB8Y`  
**URL de produção:** https://capitao-society-il6qculq5-capitaosociety-1198s-projects.vercel.app  
**Alias:** https://capitao-society-erp.vercel.app

> Este documento foi produzido por auditoria read-only de código, Git e banco de produção. Não altera código, dados, configurações, permissões, migrações ou registros históricos.

> **Atualização de 24/11/2026:** auditoria automática de reservas publicada, migração 0012 aplicada, 0007 substituída, duas execuções manuais concluídas com 35 ocorrências e cron diário ainda não ativado.

---

## 1. Arquitetura atual

### Stack
- Next.js 16.2.2 com App Router.
- React 19 e TypeScript.
- Tailwind CSS 4.
- Prisma 6 + PostgreSQL no Supabase existente.
- NextAuth com provider de credenciais e sessão JWT.
- Vercel como hospedagem de produção, região `gru1`.
- Exportações Excel/PDF no próprio servidor/aplicação.
- Sem multiempresa, sem banco alternativo e sem ambiente de homologação.

### Organização
- `app/(dashboard)/*`: páginas autenticadas dos módulos.
- `app/actions/*`: Server Actions de leitura/escrita.
- `app/api/*`: rotas de autenticação, OCR/IA e endpoints internos.
- `lib/*`: motores de domínio, cálculos, integrações e utilitários.
- `components/*`: Sidebar, Topbar, modais e componentes compartilhados.
- `prisma/schema.prisma`: modelo de dados Prisma.
- `scripts/migrations/*`: migrações SQL controladas manualmente.
- `scripts/tests/*`: testes puros executados com `tsx`.

### Rotas funcionais
`/dashboard`, `/inteligencia`, `/agenda`, `/pdv`, `/mesas`, `/produtos`, `/estoque`, `/deposito`, `/clientes`, `/financeiro`, `/usuarios`.

### Modelos centrais
- `Customer`, `Subscription`, `SubscriptionPayment`, `CustomerScore`, `CustomerScoreHistory`.
- `Rental`, `RentalChangeLog`, `RentalOperatingHour`, `RentalAuditRun`, `RentalAuditOccurrence`, `RentalAuditEvent`.
- `Order`, `OrderItem`, `Payment`, `Table`.
- `CashRegister`, `CashDeposit`.
- `Product`, `ProductCategory`, `Stock`, `StockMovement`, `StockCount`.
- `DepotStock`, `DepotMovement`, `TransferRequest`.
- `FinancialEntry`, `FinancialPeriodClose`, `FinancialPeriodAudit`.
- `AuditLog`, `CopilotLog`, `User`.
- `InventoryCostLedger` e `PriceHistory`.

### Motores principais
- `lib/analytics.ts`: períodos, formatação e identificação de itens de aluguel.
- `lib/commercial-analytics.ts`: ocupação, mix de receita e conciliação comercial.
- `lib/official-financials.ts` e `lib/dre.ts`: DRE oficial e períodos.
- `lib/management-analytics.ts`, `lib/strategic-analytics.ts`, `lib/pricing-intelligence.ts`: inteligência gerencial.
- `lib/rental-time.ts`, `lib/rental-schedule.ts`, `lib/rental-booking.ts`, `lib/rental-renewal.ts`, `lib/time-zone.ts`: domínio de reservas e tempo.
- `lib/agenda.ts` e `lib/agenda-data.ts`: Agenda operacional.
- `lib/rental-corrections.ts` e `lib/rental-conflicts.ts`: correções e conflitos de reservas.
- `lib/rental-audit-rules.ts`, `lib/rental-audit.ts` e `lib/rental-audit-types.ts`: motor determinístico e estrutura da auditoria de reservas.
- `lib/prisma.ts`: Prisma estendido para invalidar caches operacionais em mutações.
- `lib/intelligence-cache.ts`: cache em memória para relatórios.

### Autenticação e autorização
- `lib/auth-guard.ts` valida sessão e recarrega o usuário no banco a cada verificação.
- `lib/permissions.ts` centraliza `SystemPermission` e `permissionGranted`.
- `ADMIN` acessa por perfil; demais usuários dependem das flags individuais.
- Usuários inativos são bloqueados no layout e pelos guards server-side.
- Menu lateral e páginas usam a mesma fonte de permissão.

---

## 2. Regras permanentes de desenvolvimento e segurança

As regras de `AGENTS.md` permanecem a fonte oficial e devem ser lidas antes de qualquer tarefa. Resumo operacional:

- Usar exclusivamente Supabase e Vercel de produção existentes.
- Não criar banco, projeto Supabase, ambiente de homologação ou multiempresa.
- Não executar ERP, PostgreSQL, Docker ou Next.js localmente.
- Validar com análise estática, `tsc`, lint, testes puros e, quando autorizado, build/deploy.
- Não executar migração, commit, push ou deploy sem autorização expressa.
- Antes de alteração estrutural: verificar dependências, gerar backup verificado e preparar rollback.
- Preservar PDV, Comandas, Estoque, Financeiro, DRE, fechamentos, snapshots e histórico.
- Não recalcular períodos fechados nem alterar valores financeiros históricos.
- Não criar reservas, pagamentos, correções ou movimentações fictícias em produção.
- Não presumir custos, margens, rateios ou classificações sem evidência.
- Não incorporar alterações pendentes não relacionadas.
- Interromper a execução diante de inconsistência impeditiva.
- Não realizar restauração automática do banco em caso de falha.

---

## 3. Funcionalidades implementadas e publicadas

### Módulos operacionais existentes
- Dashboard.
- Central de Inteligência.
- Agenda.
- PDV.
- Comandas.
- Produtos.
- Estoque Balcão.
- Depósito (Matriz).
- Clientes e mensalidades.
- Financeiro e DRE.
- Usuários e permissões.

### Entregas recentes publicadas
- **Clientes:** correção integral de codificação/acentuação do módulo.
- **Produtos:** coluna calculada `MARGEM (%)`, sem campo persistido no banco.
- **Estoque Balcão:** `StockCount.systemQuantity` e colunas de saldo/diferença nas contagens.
- **Depósito (Matriz):** `StockCount.systemQuantity` com captura transacional do saldo do Depósito.
- **Agenda:** módulo completo de consulta operacional.
- **Agenda:** permissão independente `permAgenda`.
- **Sidebar:** compactação visual do menu lateral.
- **Fase 2A:** correção administrativa de reservas com histórico `RentalChangeLog`.
- **T1:** padronização do fuso oficial em `America/Cuiaba` com compatibilidade histórica persistente.
- **Auditoria de Reservas:** motor determinístico, tabelas próprias, histórico de eventos, execução manual e interface na Central de Inteligência.
- **Auditoria de Reservas:** migração `0012_rental_audit.sql` aplicada; `0007` substituída.

### Commits recentes relevantes
- `a6fda20` — Agenda Fase 1.
- `11fe4d7` — ajuste visual dos blocos da Agenda.
- `a151fe0` — `permAgenda` independente.
- `350180a` — Sidebar compacto.
- `17198c3` — Fase 2A e `RentalChangeLog`.
- `b98b662` — T1, fuso Cuiaba e compatibilidade histórica.
- `7eba295` — Auditoria automática de reservas e migração 0012.

---

## 4. Estrutura e funcionamento do módulo Agenda

### Arquivos
- `app/(dashboard)/agenda/page.tsx`: autenticação e carga inicial server-side.
- `app/(dashboard)/agenda/AgendaClient.tsx`: visualizações, filtros, indicadores e polling.
- `app/(dashboard)/agenda/AgendaDetailsModal.tsx`: detalhes da reserva, histórico, correção administrativa.
- `app/actions/agenda.ts`: ação de leitura autenticada.
- `lib/agenda-data.ts`: consulta Prisma, mapeamento de reservas, pedidos, pagamentos e itens sem vínculo.
- `lib/agenda.ts`: motor puro de períodos, status, conflitos, horas, métricas e auditoria.
- `lib/stock-count-diff.ts`: não pertence à Agenda; usado em Estoque/Depósito.

### Permissão
- Página: `requirePagePermission('permAgenda')`.
- Ação server-side: `requirePermission('permAgenda')`.
- Menu: item `permAgenda`.
- Administrador acessa por perfil.
- Não concede acesso à Central de Inteligência nem a outros módulos.

### Visualizações e filtros
- Dia, semana e mês.
- Navegação por período e ano, além de “Hoje”.
- Filtros por campo FUT5/FUT7, cliente, mensalista/avulso, situação financeira, situação operacional e origem.
- Grade semanal com os dois campos simultâneos, horários livres/ocupados, destaque 18h–23h, meia-noite e durações variáveis.
- Indicadores de reservas, valores, horas e inconsistências.
- Atualização automática a cada 60 segundos e ao recuperar foco.
- Somente leitura, exceto a correção administrativa da Fase 2A.

### Regras financeiras da Agenda
- Fonte exclusiva: `Rental` para operação e `Order`/`OrderItem`/`Payment` para financeiro.
- Comanda integralmente paga reconhece os aluguéis vinculados como pagos.
- Receita do aluguel usa o valor líquido do item, com desconto rateado pela metodologia oficial.
- Comanda parcial com um único item pode ser atribuída; com múltiplos itens é “pagamento não individualizado”.
- Estornos e reabertura são recalculados pelo saldo efetivo.
- Reserva paga sem comprovação é sinalizada como não comprovada.
- Mensalista sem vínculo individual de assinatura não é tratado como inadimplente.
- DRE não soma `Rental`; ele usa `Order`/`Payment` e itens da operação.

### Limitações históricas da Agenda
- Horário original, duração original e valor original anteriores à Fase 2A não existiam de forma estruturada.
- `RentalChangeLog` passou a registrar alterações a partir da Fase 2A.
- Histórico de pagamentos é da operação, não rateado por reserva.
- Canal Comanda/PDV não é gravado explicitamente.
- Horário efetivamente jogado não é registrado.
- Reservas legadas exibem aviso de convenção histórica.

---

## 5. Permissões individuais da Agenda

- Campo persistente: `User.permAgenda BOOLEAN NOT NULL DEFAULT false`.
- Migração: `0009_perm_agenda.sql`.
- Backfill original: `permAgenda = permInteligencia`, preservando o acesso anterior e sem ampliar permissões.
- Administradores acessam por `role === 'ADMIN'`.
- Menu, página e ação server-side são protegidos por `permAgenda`.
- A matriz de Usuários possui o ícone de calendário, azul quando autorizado e cinza quando bloqueado.
- O toggle é auditado em `AuditLog`.
- Usuário bloqueado (`isActive = false`) não acessa.
- A revogação é reconhecida na próxima requisição porque os guards consultam o banco, não apenas o JWT.

**Estado verificado em 24/11/2026:** 4 usuários, 2 ADMIN, 0 usuários não-admin com `permAgenda` autorizado. Administradores seguem com acesso por perfil.

### Auditoria de Reservas
- Consulta protegida por `permInteligencia`, validada no servidor.
- Execução manual, reconhecimento, resolução, ignorância e reabertura restritos a `ADMIN`.
- Não exige `permAgenda`.
- Nenhuma permissão de usuário foi alterada.
- Estado verificado: 2 ADMIN ativos; nenhum usuário não-admin com `permInteligencia` ou `permAgenda` autorizado. A validação funcional com perfil não-admin permanece pendente.

---

## 6. Auditoria automática de reservas

**Situação em produção: publicada e operacional em modo manual.**

Publicado no commit `7eba295a93ce81a71ab823e6f5b6e03e8f063e94`, deployment `dpl_AkBhnFSYvYbosqjWx3C7TeSMMB8Y`.

### Estrutura
- `RentalAuditRun`: execuções, status, origem, totais e resumo.
- `RentalAuditOccurrence`: ocorrências com fingerprint único, gravidade, vínculos, cliente, campo, período, evidências e status administrativo/técnico.
- `RentalAuditEvent`: histórico de detecção, eliminação, reabertura, reconhecimento, resolução, ignorância e observações.
- Migração: `0012_rental_audit.sql`, aplicada em 24/11/2026.
- A `0007` nunca foi aplicada e foi substituída por guarda de segurança.

### Estados
- Administrativo: `OPEN`, `ACKNOWLEDGED`, `RESOLVED`, `IGNORED`.
- Técnico: `ACTIVE`, `CLEARED`.
- Reconhecer ou resolver administrativamente não elimina tecnicamente a inconsistência.
- A eliminação técnica ocorre apenas quando a ocorrência deixa de ser detectada.
- Reabertura automática quando uma ocorrência eliminada volta a aparecer.
- Execuções simultâneas são bloqueadas por advisory lock transacional.
- Limites: 5.000 reservas, 20.000 itens e 5.000 ocorrências por execução.

### Verificações
- Reserva sem cliente.
- Reserva paga sem comanda/operação.
- Comanda com aluguel de campo sem reserva.
- Duplicidade e sobreposição com normalização CUIABA/LEGACY.
- Duração, campo e produto de aluguel.
- Regras financeiras oficiais da Agenda, incluindo pagamentos integrais, parciais, não individualizados e excedentes.
- Vínculos entre reserva, comanda, pagamento e sessão de caixa.
- Correções do `RentalChangeLog`.
- Eventos de exclusão/cancelamento no `AuditLog`.
- Redução de reservas entre auditorias.
- Divergência de fronteira de data.
- Orphan links e vínculos inconsistentes.

### Permissões
- Consulta: `permInteligencia`, validada no servidor.
- Execução manual, reconhecimento, resolução, ignorância e reabertura: somente `ADMIN`.
- Nenhuma permissão de usuário foi alterada.
- `permAgenda` não é exigida cumulativamente.

### Execuções realizadas em produção
- Primeira execução: `cmwv89e1s0000u7841r5orzd4`, MANUAL, SUCCESS, 203 reservas, 43 vínculos, 661 verificações, 35 ocorrências.
- Segunda execução: `cmwv8aeb1002yu784g0igcru6`, MANUAL, SUCCESS, mesmos totais, 0 eliminadas.
- 35 fingerprints únicos; 70 detecções acumuladas; nenhuma duplicação.
- Snapshot operacional idêntico antes/depois das execuções.

### Cron
O cron diário **não está ativo**. `vercel.json` permanece sem o novo cron. `CRON_SECRET` não foi configurado. A rota `/api/internal/rental-audit` existe, mas retorna 503 sem segredo.

### Pendência de validação
A interface autenticada não foi validada por falta de sessão administrativa. A conferência visual da aba “Auditoria de Reservas”, dos filtros e dos botões de resolução permanece pendente para o administrador.

---

## 7. Fase 2A — correções administrativas

### Estado
- Publicada no commit `17198c3`.
- `RentalChangeLog` e migração 0010 aplicados.
- Nenhuma correção real registrada na verificação inicial (`RentalChangeLog = 0`).
- Em 24/11/2026 já existem 6 correções reais registradas, todas com `requiresFinancialReview = true`.

### Funcionamento
- Botão “Corrigir reserva” apenas para ADMIN no modal da Agenda.
- Permite alterar data, início, fim, duração e campo FUT5/FUT7.
- Funciona mesmo com comanda paga e caixa encerrado.
- Exige justificativa mínima de 5 caracteres.
- Usa transação, timeout, trava advisory por campo e validação de sobreposição.
- Valida a janela em Cuiaba e considera a convenção da reserva.
- Não altera `Payment`, `Order`, `OrderItem`, `CashRegister`, `FinancialEntry`, estoque, DRE ou fechamentos.
- Mantém `totalAmount` e status financeiro.
- Registra antes/depois, autor, data/hora, justificativa e campos alterados.
- `requiresFinancialReview` sinaliza necessidade de conferência financeira futura.
- Não calcula cobrança, estorno ou rateio automaticamente.

### Conversão de convenção
- Reserva legada pode ser corrigida preservando `LEGACY_FORTALEZA`.
- O administrador pode marcar “Converter para America/Cuiaba”.
- A conversão preserva o horário exibido, altera a convenção e o instante armazenado de forma transacional.
- O log registra a mudança de `timeConvention` e não duplica o deslocamento.

### Proteções legadas
- `updateRental`, `deleteRental` e `setRentalStatus` bloqueiam reservas com `OrderItem` ativo.
- `deleteCustomer` bloqueia cliente com reserva vinculada ativa.
- Essa proteção é independente da T1.

### Limitações
- Diferenças financeiras não são regularizadas na Fase 2A.
- Não há cálculo automático de preço por duração, faixa horária ou campo.
- Troca de cliente da reserva não é permitida.

---

## 8. RentalChangeLog e migração 0010

### Tabela `RentalChangeLog`
Campos:
- `id`.
- `rentalId`.
- `orderId` opcional.
- `changedByUserId` opcional.
- `changedByName` (snapshot do nome do administrador).
- `reason` obrigatório.
- `beforeData` JSONB.
- `afterData` JSONB.
- `changedFields` TEXT[].
- `requiresFinancialReview` booleano.
- `financialDifference` numérico opcional.
- `createdAt`.

Relações:
- `rental` com `onDelete: Restrict`, impedindo exclusão de reserva corrigida e perda do histórico.
- `changedBy` com `onDelete: SetNull`, preservando o snapshot do nome.

### Migração 0010
- Arquivo: `scripts/migrations/0010_rental_change_log.sql`.
- Rollback: `scripts/migrations/0010_rental_change_log_rollback.sql`.
- Status: **aplicada em produção**.
- Registros na aplicação da 0010: **0**. Registros em 24/11/2026: **6**.
- Nenhum registro histórico foi alterado pela migração.

---

## 9. Padronização T1 de fuso horário

### Fuso oficial
- `America/Cuiaba` é o fuso oficial operacional.
- Cáceres-MT usa `America/Cuiaba`.
- Armazenamento de instantes permanece em UTC quando aplicável.
- Datas civis de vencimento continuam data-only.

### Implementação publicada na T1
Commit `b98b662`, deployment `dpl_5v1RbEjjjNS8LsyaB6yC3sM95fer` à época.

- Novo módulo central `lib/time-zone.ts`.
- `America/Fortaleza` mantido apenas para compatibilidade de registros legados.
- Novos agendamentos gravam `timeConvention = CUIABA`.
- Reservas existentes permanecem `LEGACY_FORTALEZA`.
- Nenhum timestamp histórico foi convertido.
- A Agenda, Dashboard, Central, ocupação, precificação e concorrência usam a janela operacional por convenção.
- Displays de Agenda, Clientes, Dashboard, Financeiro, Caixa, Estoque, Depósito e Auditoria usam Cuiaba.
- Vencimentos e vencidos usam data civil em Cuiaba, sem deslocamento de dia.

### Migração 0011
- Arquivo: `scripts/migrations/0011_rental_time_convention.sql`.
- Rollback: `scripts/migrations/0011_rental_time_convention_rollback.sql`.
- Status: **aplicada em produção**.
- Coluna: `Rental.timeConvention TEXT NOT NULL DEFAULT 'LEGACY_FORTALEZA'`.
- Constraint: `LEGACY_FORTALEZA` ou `CUIABA`.
- Rollback bloqueia se houver registros `CUIABA`.

**Estado verificado naquele snapshot da T1:** 202 reservas existentes, todas `LEGACY_FORTALEZA`; 17 futuras já cadastradas preservadas como legado; 0 registros `CUIABA` no momento da verificação. Nenhum dado fictício criado.

---

## 10. Convenções CUIABA e LEGACY_FORTALEZA

### `CUIABA`
- Convenção dos novos registros.
- `startTime` e `endTime` são instantes UTC reais correspondentes à hora de parede em America/Cuiaba.
- Agenda e analytics leem diretamente o instante.
- Data/hora informadas pelo operador correspondem ao horário de Cáceres-MT.

### `LEGACY_FORTALEZA`
- Convenção dos registros históricos.
- Preserva a hora de parede que já era exibida pelo sistema anterior.
- Para exibição/analytics em Cuiaba, o código aplica compatibilidade read-time de +1h:
  - `effective = storedUtc + 1h`.
- O timestamp armazenado **não é alterado**.
- A conversão individual para Cuiaba é explícita pela Fase 2A e gera log.
- Não há inferência baseada apenas em data ou origem para converter registros.

### Conflitos entre convenções
- `lib/rental-conflicts.ts` normaliza as duas convenções para a mesma linha operacional antes de detectar sobreposição.
- Correções, PDV/Comandas, Dossiê e renovação usam essa mesma lógica.
- O índice único parcial `OrderItem_active_rentalId_key` impede múltiplos itens ativos para a mesma reserva.

---

## 11. Relação das migrações

Os scripts são aplicados manualmente; não há tabela `_prisma_migrations`.

| Migração | Situação verificada | Evidência |
|---|---|---|
| `0000_baseline.sql` | Base existente | Estrutura histórica do banco |
| `0001_finance_wac_close.sql` | Histórica aplicada | Estrutura financeira existente |
| `0002_finance_wac_backfill.sql` | Histórica aplicada | Dados financeiros existentes |
| `0003_rental_operating_hours.sql` | Aplicada | Tabela `RentalOperatingHour` |
| `0004_product_service_classification.sql` | Aplicada | Colunas `isService`, `stockControlled`, `allowFractional` |
| `0005_rental_cost_centers.sql` | Aplicada | `CostCenter`, `CostAllocation`, `OperatingCostRule` |
| `0006_rental_occupancy_links.sql` | Aplicada | `Rental.source`, `OrderItem.rentalId` e índices |
| `0007_rental_audit.sql` | **Substituída / não aplicar** | Arquivo convertido em guarda; a 0007 nunca foi aplicada |
| `0008_stock_count_system_quantity.sql` | Aplicada | `StockCount.systemQuantity` |
| `0009_perm_agenda.sql` | Aplicada | `User.permAgenda` |
| `0010_rental_change_log.sql` | Aplicada | Tabela `RentalChangeLog`, 6 registros em 24/11/2026 |
| `0011_rental_time_convention.sql` | Aplicada | `Rental.timeConvention` e constraint |
| `0012_rental_audit.sql` | **Aplicada em 24/11/2026** | `RentalAuditRun`, `RentalAuditOccurrence`, `RentalAuditEvent`, índices, FKs, checks e RLS |

Rollbacks existentes para 0003–0006, 0008–0011 e 0012. A 0012 remove somente as tabelas de auditoria. Não aplicar rollback sem tratar registros novos e sem autorização.

---

## 12. As quatro reservas com divergência de fronteira de data

Estas reservas são legadas, estão preservadas e **não foram alteradas**. A divergência é a mudança de data civil entre Cuiaba e Fortaleza.

| Reserva | Campo | Cuiaba | Fortaleza | Status | Origem |
|---|---|---|---|---|---|
| `cmwfuw31t0004la0891mjl7t4` | FUT7 | 13/11/2026 23:30 → 14/11/2026 00:30 | 14/11/2026 00:30 → 01:30 | PAID | WALK_IN |
| `cmwh8936e0003le074jeyo1md` | FUT5 | 13/11/2026 23:30 → 14/11/2026 00:30 | 14/11/2026 00:30 → 01:30 | PAID | WALK_IN |
| `cmwn2qojk0028jn07jzrgv13i` | FUT5 | 18/11/2026 23:30 → 19/11/2026 00:30 | 19/11/2026 00:30 → 01:30 | PAID | WALK_IN |
| `cmwrd32jm001jjp08ls7m13cb` | FUT5 | 21/11/2026 23:30 → 22/11/2026 00:30 | 22/11/2026 00:30 → 01:30 | PAID | WALK_IN |

Todas estão com `timeConvention = LEGACY_FORTALEZA`. A auditoria publicada as sinaliza como `DATE_BOUNDARY_DIVERGENCE` (INFO) e não as altera. Qualquer correção deve ser individual e auditada pela Fase 2A.

---

## 13. Commit e deployment atual de produção

- **Commit:** `7eba295a93ce81a71ab823e6f5b6e03e8f063e94`
- **Mensagem:** `feat: implementar auditoria automatica de reservas`
- **Deployment ID:** `dpl_AkBhnFSYvYbosqjWx3C7TeSMMB8Y`
- **Status:** Production / Ready
- **URL:** https://capitao-society-il6qculq5-capitaosociety-1198s-projects.vercel.app
- **Alias:** https://capitao-society-erp.vercel.app
- **Branch remoto:** `origin/dev/inteligencia-p3` no mesmo commit.
- **HTTP:** `/login` 200; `/agenda` 307 para autenticação; `/api/internal/rental-audit` 503 sem `CRON_SECRET`.

---

## 14. Testes realizados e pendências de validação

### Testes executados com sucesso
- Todos os 19 scripts puros: `finance`, `official`, `commercial`, `management`, `ai`, `strategic`, `pricing`, `quantity`, `margin`, `stock-count`, `agenda`, `agenda-access`, `rental-corrections`, `rental-time`, `rental-booking`, `rental-renewal`, `subscription-date`, `time-zone`, `rental-audit`.
- `test:rental-audit`: OK.
- `tsc --noEmit`: OK.
- ESLint: 0 erros; 53 avisos preexistentes.
- `prisma generate` e `prisma validate`: OK.
- Build de produção na Vercel: OK.
- Migração 0012 aplicada em transação com timeout e advisory lock.
- `0012_rental_audit_verify.sql`: tabelas, colunas, índices, FKs, checks e RLS confirmados.
- Primeira e segunda auditoria manual em produção: SUCCESS; 35 ocorrências, 35 fingerprints únicos, 0 eliminadas e 0 duplicações.

### Dry-run e auditoria em produção
- 203 reservas e 43 vínculos analisados.
- 661 verificações executadas.
- 1 CRITICAL, 3 HIGH, 22 MEDIUM e 9 INFO.
- Snapshot operacional idêntico antes/depois das duas execuções.

### Comparação read-only — novembro/2026
| Indicador | Antes da compatibilidade | Depois da compatibilidade |
|---|---:|---:|
| Reservas no período | 69 | 69 |
| Valor contratado | R$ 9.205,00 | R$ 9.205,00 |
| Horas efetivas | 33h | 38h |
| Horas reservadas | 42h | 47h |
| Ocupação efetiva | 12,7% | 14,6% |
| Ocupação reservada | 16,2% | 18,1% |
| Receita realizada de agenda | R$ 4.230,00 | R$ 4.930,00 |
| Receita de agenda | R$ 5.460,00 | R$ 6.155,00 |
| Horas extraordinárias | 21h | 16h |

A mudança é operacional/compatibilidade de leitura; não altera pagamentos ou DRE.

### Integridade financeira verificada
- Pedidos: 2.211.
- Itens: 5.587.
- Pagamentos: 3.863, total R$ 185.515,60.
- Caixas: 209, fechamentos R$ 74.727,15.
- Lançamentos financeiros: 86, total R$ 59.356,99986468.
- Estoque Balcão: 11.993,5.
- Estoque Matriz: 3.075.
- `RentalChangeLog`: 6 em 24/11/2026.
- Reservas: 203 (10 `CUIABA`, 193 `LEGACY_FORTALEZA`).
- Futuras: 17 (4 `CUIABA`, 13 legadas).
- Backups/execuções da auditoria não alteraram os totais operacionais.

### Pendências de validação funcional
- A interface autenticada não foi validada visualmente por falta de sessão administrativa.
- Validar como ADMIN a aba “Auditoria de Reservas”, filtros, botões e histórico.
- Validar como usuário ativo com `permInteligencia` e sem `permAgenda` que a consulta funciona e que executar/resolver é bloqueado.
- Validar que usuário sem `permInteligencia` não acessa a Central nem a ação de consulta.
- A primeira nova reserva real após a T1 deve ser conferida:
  - horário exibido em Cáceres;
  - `timeConvention = CUIABA`;
  - coerência Agenda/Dashboard/Central.
- A primeira correção real da Fase 2A deve ser acompanhada:
  - histórico no modal;
  - preservação de comanda/pagamentos;
  - conversão explícita, se usada.
- Testar em navegador/dispositivo de Cáceres e outra localidade (ex.: Natal) para confirmar independência do fuso do cliente.
- A rota `/api/internal/rental-audit` retornou 503 sem `CRON_SECRET`; o cron permanece desativado.

---

## 15. Riscos técnicos ainda existentes

- Os registros legados misturam convenções históricas; a intenção original não é recuperável sem evidência.
- A compatibilidade legada aplica +1h em leitura para exibição/analytics, mas não altera o banco.
- Indicadores históricos de ocupação/receita de agenda podem diferir dos valores anteriores à T1.
- Alguns componentes secundários de exibição podem ainda usar fuso do navegador; os módulos principais foram centralizados, mas uma varredura visual completa ainda é necessária.
- `Rental.cancelledAt` está como `timestamptz`, diferente dos demais campos de Rental.
- Não há exclusion constraint de intervalos no PostgreSQL; a proteção é transacional/aplicacional.
- Ações administrativas de edição/exclusão de pagamento e exclusão de sessão de caixa continuam existindo fora do escopo da correção de reservas; não devem ser usadas como mecanismo de correção.
- A auditoria de reservas está publicada em modo manual; o cron diário não está ativo e `CRON_SECRET` não está configurado.
- A interface autenticada da auditoria ainda não foi validada visualmente.
- Exclusões de reservas via `deleteRental`/Dossiê não geram evento específico; a auditoria detecta redução de contagem e eventos genéricos, mas não identifica com precisão o registro removido.
- Ocorrências históricas são consolidadas em agregados informativos (835 itens sem reserva, 129 reservas pagas sem comprovação e 14 sem operação).
- Ocorrências reconhecidas/resolvidas administrativamente continuam tecnicamente ativas até deixarem de ser detectadas.
- O ledger/caches operacionais são em memória; correções invalidam caches, mas múltiplas instâncias podem ter curta janela de inconsistência.
- Dados de produção podem mudar entre auditorias; contagens deste documento são snapshot de 24/11/2026.

---

## 16. Escopo previsto para a Fase 2B

Não iniciada. Escopo sujeito a autorização específica:

- Ajustes financeiros de reservas corrigidas quando houver diferença de preço.
- Cobrança complementar rastreável.
- Estorno/refund rastreável.
- Preservação integral do pagamento, comanda, item e fechamento originais.
- Estrutura aditiva para ajuste financeiro com vínculo à reserva e à operação.
- Tratamento de período financeiro do ajuste: competência original versus período corrente, conforme decisão de negócio.
- Rateio/individualização por item de comanda, se aprovado.
- Vínculo entre pagamento de mensalidade e reservas cobertas.
- Dupla autorização e trilha de auditoria para valores.
- Sem reescrever caixa, DRE ou históricos.

---

## 17. Condições para eventual execução da T2

A T2 é a normalização histórica em massa, opcional. Só pode ocorrer com autorização específica e:

1. Evidência documentada da intenção original por coorte ou por reserva.
2. Backup integral verificado e rollback preparado.
3. Mapeamento explícito de cada registro afetado.
4. Migração/data update aditivo, jamais deslocamento indiscriminado de +1h.
5. Preservação de `Payment`, `Order`, `OrderItem`, `CashRegister`, `FinancialEntry`, estoque, DRE e fechamentos.
6. Tratamento das quatro reservas de fronteira e demais casos ambíguos.
7. Testes comparativos antes/depois e validação read-only em produção.
8. Trilha de auditoria por reserva com antes/depois.
9. Rollback que impeça reinterpretação incorreta de registros criados após a T1.
10. Aprovação explícita do responsável financeiro/operacional.

---

## 18. Alterações pendentes no Git não publicadas

A auditoria de reservas foi publicada no commit `7eba295`. Permanecem no working tree, sem publicação:

### Untracked
- `scripts/homologation/`
- `scripts/security/02b_enable_rls_erpcap_reinforced.sql`
- `scripts/security/06b_verify_after_rls_reinforced.sql`
- `scripts/security/07_rollback_rls_and_grants_exact.sql`

Esses itens **não** pertencem à auditoria publicada. Não devem ser incluídos em commits/deploys sem autorização específica e revisão própria.

O `vercel.json` permanece **sem cron** nesta etapa. A ativação do cron diário exige autorização específica, configuração de `CRON_SECRET` e validação funcional prévia.

---

## 19. Prompt de retomada para nova sessão

Copiar o texto abaixo como primeira mensagem de uma nova sessão do OpenCode:

> Retome o desenvolvimento do Capitão Society ERP (ERPCAP). Leia obrigatoriamente `AGENTS.md` e `docs/CONTINUIDADE_TECNICA.md` antes de qualquer ação. O estado de produção é o commit `7eba295a93ce81a71ab823e6f5b6e03e8f063e94`, deployment `dpl_AkBhnFSYvYbosqjWx3C7TeSMMB8Y`, fuso oficial `America/Cuiaba`, T1, Fase 2A, `RentalChangeLog`, `permAgenda` e Auditoria de Reservas publicados. As migrações 0008–0012 estão aplicadas; a 0007 foi substituída e não deve ser aplicada. A auditoria está em modo manual: o cron diário NÃO está ativo, `CRON_SECRET` não está configurado e a interface autenticada ainda precisa de validação visual pelo administrador. No snapshot de 24/11/2026 21:51Z existiam 203 reservas (10 `CUIABA`, 193 legadas), 17 futuras e 35 ocorrências abertas. Há 3 possíveis overpayments e 4 reservas de fronteira de data que não devem ser corrigidas automaticamente. Não iniciar T2 nem Fase 2B sem autorização específica. Não executar ERP, banco ou Next.js localmente; validar por análise, typecheck, lint, testes puros e, quando autorizado, build/deploy em produção. Preservar todos os dados financeiros e históricos. Pergunte qual próximo escopo autorizado antes de implementar.

---

## 20. Checklist rápido antes de qualquer nova implementação

- [ ] Ler `AGENTS.md` e este documento.
- [ ] Conferir `git status` e separar alterações pendentes.
- [ ] Confirmar commit/deployment atual.
- [ ] Confirmar migrações aplicadas; 0012 aplicada e 0007 substituída (não aplicar).
- [ ] Não converter timestamps históricos sem autorização.
- [ ] Não alterar `Payment`, `Order`, `OrderItem`, `CashRegister` ou `FinancialEntry` por conveniência.
- [ ] Criar testes puros para regras de negócio.
- [ ] Gerar backup verificado antes de qualquer migração.
- [ ] Preparar rollback.
- [ ] Publicar somente arquivos autorizados.
- [ ] Validar read-only em produção após deploy.

---

## 21. Ocorrências abertas da auditoria em 24/11/2026

Snapshot após duas execuções manuais: 35 ocorrências, 35 fingerprints únicos, 70 detecções acumuladas, todas `OPEN`/`ACTIVE`.

| Categoria | Gravidade | Qtd. |
|---|---|---:|
| `PAID_RENTAL_WITHOUT_ORDER` | CRITICAL | 1 |
| `POSSIBLE_OVERPAYMENT` | HIGH | 3 |
| `AMOUNT_MISMATCH` | MEDIUM | 10 |
| `DURATION_MISMATCH` | MEDIUM | 6 |
| `RENTAL_CORRECTION_FINANCIAL_REVIEW` | MEDIUM | 6 |
| `DATE_BOUNDARY_DIVERGENCE` | INFO | 4 |
| `SUBSCRIPTION_COVERAGE_UNLINKED` | INFO | 2 |
| `HISTORICAL_PAID_RENTALS_WITHOUT_ORDER` | INFO | 1 |
| `HISTORICAL_RENTALS_WITHOUT_OPERATION` | INFO | 1 |
| `HISTORICAL_UNLINKED_RENTAL_ITEMS` | INFO | 1 |

### Itens que exigem decisão humana
- A reserva `cmwu25www002cic08haojmp7l` está `PAID` sem item ativo de comanda/PDV (R$ 140,00).
- Os 3 pagamentos excedentes continuam pendentes de revisão administrativa.
- As 4 reservas de fronteira de data continuam apenas sinalizadas.
- As 6 correções do `RentalChangeLog` com `requiresFinancialReview = true` continuam pendentes.
- As 10 divergências de valor e 6 de duração exigem conferência individual.

Nenhum ajuste financeiro, estorno, compensação, conversão histórica ou resolução automática foi executado.

### Próxima etapa pendente
- Validação visual da interface autenticada pelo administrador.
- Autorização específica para configurar `CRON_SECRET` e ativar o cron diário.
- Fase 2B e T2 permanecem não iniciadas.
