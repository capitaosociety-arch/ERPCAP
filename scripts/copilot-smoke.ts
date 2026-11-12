// Smoke test da camada do Copiloto â€” sem rede e sem banco.
// Roda com: npx tsx scripts/copilot-smoke.ts
import assert from 'node:assert';
import { extractJson } from '../lib/ai/json';
import { TOOLS, getToolDefs, runTool } from '../lib/copilot/registry';
import type { CopilotCtx } from '../lib/copilot/types';

const base: Omit<CopilotCtx, 'user'> = { userId: 'u1', hoje: new Date() };
const ctxNoPerm: CopilotCtx = { ...base, user: { id: 'u1', name: 'Caixa', role: 'CASHIER', permDashboard: true } as any };
const ctxAdmin: CopilotCtx = { ...base, user: { id: 'u1', name: 'Admin', role: 'ADMIN' } as any };

async function main() {
  // 1. extractJson
  assert.deepStrictEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepStrictEqual(extractJson('texto antes [1,2,3] fim'), [1, 2, 3]);
  assert.throws(() => extractJson('sem json'));

  // 2. Registro: 23 ferramentas, nomes Ãºnicos, defs com name/description/parameters
  assert.strictEqual(TOOLS.length, 23);
  assert.ok(TOOLS.some(t => t.name === 'dre'));
  assert.ok(TOOLS.some(t => t.name === 'historico_financeiro'));
  assert.ok(TOOLS.some(t => t.name === 'historico_gerencial'));
  assert.ok(TOOLS.some(t => t.name === 'comparar_periodos'));
  assert.ok(TOOLS.some(t => t.name === 'alertas_gestao'));
  assert.ok(TOOLS.some(t => t.name === 'simular_cenario'));
  assert.ok(TOOLS.some(t => t.name === 'previsao_financeira'));
  assert.ok(TOOLS.some(t => t.name === 'recomendacoes_estrategicas'));
  assert.ok(TOOLS.some(t => t.name === 'precificacao_oportunidades'));
  assert.ok(TOOLS.some(t => t.name === 'simular_precificacao'));
  assert.ok(TOOLS.some(t => t.name === 'mix_receita'));
  assert.ok(TOOLS.some(t => t.name === 'conciliacao_estoque'));
  assert.ok(TOOLS.some(t => t.name === 'custos_centros'));
  assert.strictEqual(new Set(TOOLS.map(t => t.name)).size, TOOLS.length);
  const defs = getToolDefs();
  assert.strictEqual(defs.length, TOOLS.length);
  for (const d of defs) {
    assert.ok(typeof d.name === 'string' && d.name.length > 0);
    assert.ok(typeof d.description === 'string' && d.description.length > 0);
    assert.ok(d.parameters && typeof d.parameters === 'object');
  }

  // 3. Ferramenta desconhecida nunca lanÃ§a
  const unknown = await runTool(ctxAdmin, 'nao_existe', {});
  assert.strictEqual(unknown.ok, false);

  // 4. Sem permissÃ£o: deny antes de qualquer query (sem banco)
  const denied = await runTool(ctxNoPerm, 'faturamento', {});
  assert.strictEqual(denied.ok, false);
  assert.ok(String(denied.error).toLowerCase().includes('permiss'));

  // 5. Ferramentas com requiredPerm nulo exigem ADMIN (nenhuma Ã© nula hoje)
  for (const t of TOOLS) {
    assert.ok(t.requiredPerm !== null, `ferramenta ${t.name} deveria exigir permissÃ£o`);
  }

  console.log(`Smoke OK â€” ${TOOLS.length} ferramentas, gate e extractJson validados.`);
}

main().catch(e => {
  console.error('FALHOU:', e);
  process.exit(1);
});
