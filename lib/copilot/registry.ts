// ===========================================================================
// Registro de ferramentas do Copiloto: validação de permissão e execução.
// O orquestrador chama runTool() — aqui é o ÚNICO ponto que toca nas queries.
// ===========================================================================

import { COPILOT_TOOLS } from './tools';
import type { CopilotCtx, CopilotTool, ToolResult } from './types';
import type { AIToolParam } from '../ai/types';

export const TOOLS: CopilotTool[] = COPILOT_TOOLS;

const byName = new Map(TOOLS.map(t => [t.name, t]));

/** Definições de ferramentas no formato esperado pela camada de IA. */
export function getToolDefs(): AIToolParam[] {
  return TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters
  }));
}

/**
 * Executa uma ferramenta com checagem de permissão.
 * Nunca lança para o modelo: erros viram ToolResult { ok:false }.
 */
export async function runTool(ctx: CopilotCtx, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = byName.get(name);
  if (!tool) {
    return { ok: false, error: `Ferramenta desconhecida: ${name}` };
  }

  const isAdmin = ctx.user.role === 'ADMIN';
  const allowed = tool.requiredPerm === null || isAdmin || ctx.user[tool.requiredPerm] === true;
  if (!allowed) {
    return { ok: false, error: `Sem permissão para a ferramenta "${name}".` };
  }

  try {
    return await tool.execute(ctx, args || {});
  } catch (e: any) {
    console.error(`[Copiloto] Erro na ferramenta ${name}:`, e);
    return { ok: false, error: `Erro ao consultar "${name}": ${e?.message || 'erro interno'}` };
  }
}
