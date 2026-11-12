import { prisma } from './prisma';
import { monthKey, round2 } from './analytics';
import { evaluateCmvMovement } from './financial-cmv';
import { classifyDreExpense, isInventoryPurchaseEntry } from './financial-classification';
import { isNewRulesDate } from './effective-rules';

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

function finalizeDre(params: {
  from: Date;
  to: Date;
  receitasVendas: number;
  receitasOutras: number;
  cmv: number;
  despesas: Record<string, number>;
  despesasFinanceiras: number;
  impostos: number;
}): DreResultado {
  const totalReceitas = params.receitasVendas + params.receitasOutras;
  const totalDespesasOp = Object.values(params.despesas).reduce((a, v) => a + v, 0);
  const lucroBruto = totalReceitas - params.cmv;
  const ebitda = lucroBruto - totalDespesasOp;
  const resultadoLiquido = ebitda - params.impostos - params.despesasFinanceiras;

  return {
    from: monthKey(params.from),
    to: monthKey(params.to),
    receitasVendas: round2(params.receitasVendas),
    receitasOutras: round2(params.receitasOutras),
    totalReceitas: round2(totalReceitas),
    cmv: round2(params.cmv),
    lucroBruto: round2(lucroBruto),
    despesas: params.despesas,
    totalDespesasOp: round2(totalDespesasOp),
    despesasFinanceiras: round2(params.despesasFinanceiras),
    impostos: round2(params.impostos),
    ebitda: round2(ebitda),
    resultadoLiquido: round2(resultadoLiquido),
    margemBruta: totalReceitas > 0 ? round2((lucroBruto / totalReceitas) * 100) : 0,
    margemEbitda: totalReceitas > 0 ? round2((ebitda / totalReceitas) * 100) : 0,
    margemLiquida: totalReceitas > 0 ? round2((resultadoLiquido / totalReceitas) * 100) : 0,
  };
}

function isSaleMovement(m: any): boolean {
  return m.type === 'OUT_SALE' || m.movementKind === 'RETURN';
}

function saleCmv(m: any): number {
  const value = evaluateCmvMovement(m).value;
  return m.movementKind === 'RETURN' ? -value : value;
}

/** DRE de caixa calculado a partir de dados já carregados. */
export function buildDreCashFromData(
  payments: any[],
  stockMovements: any[],
  financialEntries: any[],
  from: Date,
  to: Date
): DreResultado {
  let receitasVendas = 0;
  payments.forEach((p) => {
    if (p.date < from || p.date > to) return;
    receitasVendas += Number(p.amount) || 0;
  });

  let cmv = 0;
  stockMovements.forEach((m) => {
    if (m.date < from || m.date > to || !isSaleMovement(m)) return;
    if (m.product?.isService === true && isNewRulesDate(m.date)) return;
    cmv += saleCmv(m);
  });

  let receitasOutras = 0;
  let despesasFinanceiras = 0;
  let impostos = 0;
  const despesas: Record<string, number> = {};

  financialEntries.forEach((entry) => {
    if (entry.status !== 'PAID') return;
    if (isInventoryPurchaseEntry(entry)) return;
    const paidAt = entry.paymentDate || entry.dueDate;
    if (paidAt < from || paidAt > to) return;

    if (entry.type === 'RECEIVABLE') {
      receitasOutras += entry.amount;
    } else {
      const kind = classifyDreExpense(entry);
      if (kind === 'tax') {
        impostos += entry.amount;
      } else if (kind === 'financial') {
        despesasFinanceiras += entry.amount;
      } else {
        const catName = entry.category || 'Diversos';
        despesas[catName] = (despesas[catName] || 0) + entry.amount;
      }
    }
  });

  return finalizeDre({ from, to, receitasVendas, receitasOutras, cmv, despesas, despesasFinanceiras, impostos });
}

/** DRE por competência calculado a partir de dados já carregados. */
export function buildDreAccrualFromData(
  orders: any[],
  stockMovements: any[],
  financialEntries: any[],
  from: Date,
  to: Date
): DreResultado {
  let receitasVendas = 0;
  orders.forEach((order) => {
    if (order.status === 'CANCELED' || order.openedAt < from || order.openedAt > to) return;
    receitasVendas += Number(order.total || 0) - Number(order.discount || 0);
  });

  let cmv = 0;
  stockMovements.forEach((m) => {
    if (m.date < from || m.date > to || !isSaleMovement(m)) return;
    if (m.product?.isService === true && isNewRulesDate(m.date)) return;
    cmv += saleCmv(m);
  });

  let receitasOutras = 0;
  let despesasFinanceiras = 0;
  let impostos = 0;
  const despesas: Record<string, number> = {};

  financialEntries.forEach((entry) => {
    if (entry.status === 'CANCELED') return;
    if (isInventoryPurchaseEntry(entry)) return;
    const competenceAt = entry.competenceDate || entry.dueDate;
    if (competenceAt < from || competenceAt > to) return;

    if (entry.type === 'RECEIVABLE') {
      receitasOutras += entry.amount;
    } else {
      const kind = classifyDreExpense(entry);
      if (kind === 'tax') {
        impostos += entry.amount;
      } else if (kind === 'financial') {
        despesasFinanceiras += entry.amount;
      } else {
        const catName = entry.category || 'Diversos';
        despesas[catName] = (despesas[catName] || 0) + entry.amount;
      }
    }
  });

  return finalizeDre({ from, to, receitasVendas, receitasOutras, cmv, despesas, despesasFinanceiras, impostos });
}

/** DRE por regime de caixa: recebimentos e pagamentos efetivos. */
export async function computeDre(from: Date, to: Date): Promise<DreResultado> {
  const [payments, stockMovements, financialEntries] = await Promise.all([
    prisma.payment.findMany({
      where: { date: { gte: from, lte: to } },
      select: { amount: true, date: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        date: { gte: from, lte: to },
        OR: [{ type: 'OUT_SALE' }, { movementKind: 'RETURN' }],
      },
      select: { quantity: true, unitCost: true, date: true, type: true, movementKind: true, product: { select: { price: true, isService: true } } },
    }),
    prisma.financialEntry.findMany({
      select: {
        type: true,
        amount: true,
        status: true,
        paymentDate: true,
        dueDate: true,
        category: true,
        entryKind: true,
        description: true,
        notes: true,
      },
    }),
  ]);

  return buildDreCashFromData(payments, stockMovements, financialEntries, from, to);
}

/**
 * DRE por competência:
 * - receita de vendas reconhecida pela abertura da ordem (data disponível no modelo);
 * - CMV pela data da movimentação de venda;
 * - despesas e outras receitas pela competenceDate, incluindo pendentes.
 */
export async function computeDreAccrual(from: Date, to: Date): Promise<DreResultado> {
  const [orders, stockMovements, financialEntries] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: { not: 'CANCELED' },
        openedAt: { gte: from, lte: to },
      },
      select: { total: true, discount: true, openedAt: true, status: true },
    }),
    prisma.stockMovement.findMany({
      where: {
        date: { gte: from, lte: to },
        OR: [{ type: 'OUT_SALE' }, { movementKind: 'RETURN' }],
      },
      select: { quantity: true, unitCost: true, date: true, type: true, movementKind: true, product: { select: { price: true, isService: true } } },
    }),
    prisma.financialEntry.findMany({
      where: { status: { not: 'CANCELED' } },
      select: {
        type: true,
        amount: true,
        status: true,
        paymentDate: true,
        dueDate: true,
        competenceDate: true,
        category: true,
        entryKind: true,
        description: true,
        notes: true,
      },
    }),
  ]);

  return buildDreAccrualFromData(orders, stockMovements, financialEntries, from, to);
}
