// Smoke test da camada do Copiloto — sem rede e sem banco.
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

  // 2. Registro: 9 ferramentas, nomes únicos, defs com name/description/parameters
  assert.strictEqual(TOOLS.length, 9);
  assert.strictEqual(new Set(TOOLS.map(t => t.name)).size, TOOLS.length);
  const defs = getToolDefs();
  assert.strictEqual(defs.length, TOOLS.length);
  for (const d of defs) {
    assert.ok(typeof d.name === 'string' && d.name.length > 0);
    assert.ok(typeof d.description === 'string' && d.description.length > 0);
    assert.ok(d.parameters && typeof d.parameters === 'object');
  }

  // 3. Ferramenta desconhecida nunca lança
  const unknown = await runTool(ctxAdmin, 'nao_existe', {});
  assert.strictEqual(unknown.ok, false);

  // 4. Sem permissão: deny antes de qualquer query (sem banco)
  const denied = await runTool(ctxNoPerm, 'faturamento', {});
  assert.strictEqual(denied.ok, false);
  assert.ok(String(denied.error).toLowerCase().includes('permiss'));

  // 5. Ferramentas com requiredPerm nulo exigem ADMIN (nenhuma é nula hoje)
  for (const t of TOOLS) {
    assert.ok(t.requiredPerm !== null, `ferramenta ${t.name} deveria exigir permissão`);
  }

  console.log(`Smoke OK — ${TOOLS.length} ferramentas, gate e extractJson validados.`);
}

main().catch(e => {
  console.error('FALHOU:', e);
  process.exit(1);
});
