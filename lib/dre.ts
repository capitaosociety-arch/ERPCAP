import { prisma } from './prisma';
import { monthKey, round2 } from './analytics';

export interface DreResultado {
  from: string;
  to: string;
  receitasVendas: number;
  receitasOutras: number;
  totalReceitas: number;
  cmv: number;
  lucroBruto: number;
  despesas: Record<string, number>;
  totalDespesasOp: number;
  despesasFinanceiras: number;
  impostos: number;
  ebitda: number;
  resultadoLiquido: number;
  margemBruta: number;
  margemEbitda: number;
  margemLiquida: number;
}

// Réplica da fórmula do DRE gerencial usado em /financeiro (regime de caixa).
// Nunca altera o módulo Financeiro: este helper é somente leitura e serve
// para a Central de Inteligência comparar os números com os do relatório.
export async function computeDre(from: Date, to: Date): Promise<DreResultado> {
  const [payments, stockMovements, financialEntries] = await Promise.all([
    prisma.payment.findMany({
      where: { date: { gte: from, lte: to } },
      select: { amount: true, date: true }
    }),
    prisma.stockMovement.findMany({
      where: { type: 'OUT_SALE', date: { gte: from, lte: to } },
      select: { quantity: true, unitCost: true, date: true, product: { select: { cost: true } } }
    }),
    prisma.financialEntry.findMany({ select: { type: true, amount: true, status: true, paymentDate: true, dueDate: true, category: true } })
  ]);

  let receitasVendas = 0;
  payments.forEach(p => { receitasVendas += p.amount; });

  let cmv = 0;
  stockMovements.forEach(m => { cmv += m.quantity * (m.unitCost ?? m.product?.cost ?? 0); });

  let receitasOutras = 0;
  let despesasFinanceiras = 0;
  let impostos = 0;
  const despesas: Record<string, number> = {};

  financialEntries.forEach(entry => {
    if (entry.status !== 'PAID') return;
    const paidAt = entry.paymentDate || entry.dueDate;
    if (paidAt < from || paidAt > to) return;

    if (entry.type === 'RECEIVABLE') {
      receitasOutras += entry.amount;
    } else {
      const cat = (entry.category || 'Diversos').toLowerCase();
      if (cat.includes('imposto') || cat.includes('taxa') || cat.includes('darf') || cat.includes('simples')) {
        impostos += entry.amount;
      } else if (cat.includes('juros') || cat.includes('multa') || cat.includes('financeiro') || cat.includes('tarifa')) {
        despesasFinanceiras += entry.amount;
      } else {
        const catName = entry.category || 'Diversos';
        despesas[catName] = (despesas[catName] || 0) + entry.amount;
      }
    }
  });

  const totalReceitas = receitasVendas + receitasOutras;
  const totalDespesasOp = Object.values(despesas).reduce((a, v) => a + v, 0);
  const lucroBruto = totalReceitas - cmv;
  const ebitda = lucroBruto - totalDespesasOp;
  const resultadoLiquido = ebitda - impostos - despesasFinanceiras;

  return {
    from: monthKey(from),
    to: monthKey(to),
    receitasVendas: round2(receitasVendas),
    receitasOutras: round2(receitasOutras),
    totalReceitas: round2(totalReceitas),
    cmv: round2(cmv),
    lucroBruto: round2(lucroBruto),
    despesas,
    totalDespesasOp: round2(totalDespesasOp),
    despesasFinanceiras: round2(despesasFinanceiras),
    impostos: round2(impostos),
    ebitda: round2(ebitda),
    resultadoLiquido: round2(resultadoLiquido),
    margemBruta: totalReceitas > 0 ? round2((lucroBruto / totalReceitas) * 100) : 0,
    margemEbitda: totalReceitas > 0 ? round2((ebitda / totalReceitas) * 100) : 0,
    margemLiquida: totalReceitas > 0 ? round2((resultadoLiquido / totalReceitas) * 100) : 0
  };
}
