// ===========================================================================
// Contratos das ferramentas seguras do Copiloto.
//
// Regras de segurança:
//  - Nenhuma ferramenta executa SQL livre: só queries Prisma pré-definidas
//    com filtros fixos/parametrizados.
//  - Cada ferramenta declara `requiredPerm`; o executor valida a permissão
//    do usuário autenticado (ADMIN sempre passa).
//  - Resultado traz `meta { periodo, origem, nota }` para o modelo citar a
//    origem e o período dos dados (nunca inventar).
// ===========================================================================

export interface CopilotUser {
  id: string;
  name: string;
  role: string;
  [perm: string]: string | boolean;
}

export interface CopilotCtx {
  userId: string;
  user: CopilotUser;
  hoje: Date; // início do dia em America/Cuiaba
}

export interface ToolMeta {
  periodo: string; // rótulo amigável do período analisado
  origem: string[]; // tabelas/entidades-fonte
  nota?: string; // regime de caixa, pagamentos parciais, projeção etc.
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  meta?: ToolMeta;
  error?: string; // motivo (ex.: sem permissão, período inválido)
}

export interface CopilotTool {
  name: string;
  description: string; // para o modelo decidir quando usar
  parameters: Record<string, unknown>; // JSON Schema
  requiredPerm: string | null; // null = permitido a qualquer usuário do Copiloto
  execute(ctx: CopilotCtx, args: Record<string, unknown>): Promise<ToolResult>;
}

export type PeriodoArg = 'month' | '7d' | '30d' | '90d';

export const isAdmin = (ctx: CopilotCtx) => ctx.user.role === 'ADMIN';

export function hasPerm(ctx: CopilotCtx, perm: string | null): boolean {
  if (!perm) return true;
  if (isAdmin(ctx)) return true;
  return ctx.user[perm] === true;
}
