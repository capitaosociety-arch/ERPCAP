// ===========================================================================
// Ferramentas seguras do Copiloto de Gestão.
//
// IMPORTANTE:
//  - Reutilizam os cálculos oficiais (lib/dre.ts, lib/analytics.ts e as
//    agregações do módulo Financeiro/Inteligência) — nada é inventado.
//  - Só queries Prisma pré-definidas (sem SQL livre).
//  - Retornam agregados de negócio. Nunca expõem senhas, chaves, CPF,
//    notas pessoais ou campos sensíveis.
//  - Sempre trazem `meta { periodo, origem, nota }`.
// ===========================================================================

import { prisma } from '../prisma';
import { computeDre } from '../dre';
import { buildPeriods, isRentalItem, isFut5, isFut7, round2, fmtMoney } from '../analytics';
import type { CopilotTool, PeriodoArg, ToolResult } from './types';
import { isAdmin } from './types';

const dayMs = 24 * 60 * 60 * 1000;

const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR');

function parsePeriodo(args: Record<string, unknown>) {
  const raw = String(args.periodo || 'month') as PeriodoArg;
  const key: PeriodoArg = raw === '7d' || raw === '30d' || raw === '90d' ? raw : 'month';
  const P = buildPeriods(key);
  return {
    from: P.from,
    to: P.to,
    prevFrom: P.prevFrom,
    prevTo: P.prevTo,
    label: `${fmtDate(P.from)} a ${fmtDate(P.to)}`,
    key
  };
}

function ok(data: unknown, meta: ToolResult['meta']): ToolResult {
  return { ok: true, data, meta };
}

function deny(reason = 'Você não tem permissão para acessar estes dados.'): ToolResult {
  return { ok: false, error: reason };
}

// ---------------------------------------------------------------------------
// Carga compartilhada
// ---------------------------------------------------------------------------

async function loadPayments(from: Date, to: Date) {
  return prisma.payment.findMany({
    where: { date: { gte: from, lte: to } },
    include: {
      order: {
        include: {
          items: {
            where: { status: 'ACTIVE' },
            include: { product: { include: { category: true } }, service: true }
          }
        }
      }
    }
  });
}

/** Divide um pagamento em aluguel(FUT5/FUT7) vs bar, pela proporção da comanda. */
function splitPayment(p: any) {
  const items = p.order?.items || [];
  const rentItems = items.filter((it: any) => isRentalItem(it));
  const totalSub = items.reduce((a: number, it: any) => a + (it.subtotal || 0), 0);
  const rentSub = rentItems.reduce((a: number, it: any) => a + (it.subtotal || 0), 0);
  const ratio = totalSub > 0 ? Math.min(1, rentSub / totalSub) : 0;
  const paidRent = p.amount * ratio;

  let f5 = 0, f7 = 0;
  rentItems.forEach((it: any) => {
    const nm = `${it.product?.name || ''} ${it.service?.name || ''}`.trim().toLowerCase();
    if (isFut5(nm)) f5 += it.subtotal || 0;
    else if (isFut7(nm)) f7 += it.subtotal || 0;
  });

  return {
    bar: p.amount - paidRent,
    fut5: rentSub > 0 ? paidRent * (f5 / rentSub) : 0,
    fut7: rentSub > 0 ? paidRent * (f7 / rentSub) : 0
  };
}

// ---------------------------------------------------------------------------
// 1. faturamento
// ---------------------------------------------------------------------------

const faturamentoTool: CopilotTool = {
  name: 'faturamento',
  description: 'Faturamento bruto (vendas de comandas + mensalidades) em um período, com comparativo com o período anterior e divisão por campo (FUT5/FUT7) e bar.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', enum: ['month', '7d', '30d', '90d'], description: 'month = mês atual (padrão)' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const P = parsePeriodo(args);

    const [payments, subPayments] = await Promise.all([
      loadPayments(P.prevFrom, P.to),
      prisma.subscriptionPayment.findMany({
        where: { paymentDate: { gte: P.prevFrom, lte: P.to } },
        select: { amount: true, paymentDate: true }
      })
    ]);

    let vendasCur = 0, vendasPrev = 0;
    let fut5Cur = 0, fut7Cur = 0, barCur = 0;
    payments.forEach(p => {
      const amt = p.amount || 0;
      if (p.date >= P.from && p.date <= P.to) {
        vendasCur += amt;
        const s = splitPayment(p);
        fut5Cur += s.fut5;
        fut7Cur += s.fut7;
        barCur += s.bar;
      } else if (p.date >= P.prevFrom && p.date <= P.prevTo) {
        vendasPrev += amt;
      }
    });

    let mensalCur = 0, mensalPrev = 0;
    subPayments.forEach(sp => {
      if (sp.paymentDate >= P.from && sp.paymentDate <= P.to) mensalCur += sp.amount;
      else if (sp.paymentDate >= P.prevFrom && sp.paymentDate <= P.prevTo) mensalPrev += sp.amount;
    });

    const totalCur = round2(vendasCur + mensalCur);
    const totalPrev = round2(vendasPrev + mensalPrev);
    const variacao = totalPrev > 0 ? round2(((totalCur - totalPrev) / totalPrev) * 100) : null;

    return ok({
      periodo: P.label,
      receitaVendas: round2(vendasCur),
      receitaMensalidades: round2(mensalCur),
      total: totalCur,
      variacaoVsAnteriorPct: variacao,
      porSegmento: { fut5: round2(fut5Cur), fut7: round2(fut7Cur), bar: round2(barCur) }
    }, {
      periodo: P.label,
      origem: ['Payment', 'SubscriptionPayment'],
      nota: 'Regime de caixa. Faturamento por campo e bar proporcional ao conteúdo das comandas pagas; pagamento parcial conta proporcionalmente.'
    });
  }
};

// ---------------------------------------------------------------------------
// 2. dre (resultado + por que caiu)
// ---------------------------------------------------------------------------

const dreTool: CopilotTool = {
  name: 'dre',
  description: 'Resultado (DRE) do período em regime de caixa, comparado ao período anterior, com variações por componente (receitas, CMV, despesas) para explicar a queda ou alta do lucro.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', enum: ['month', '7d', '30d', '90d'], description: 'month = mês atual (padrão)' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const P = parsePeriodo(args);

    const [atual, anterior] = await Promise.all([computeDre(P.from, P.to), computeDre(P.prevFrom, P.prevTo)]);

    const delta = (a: number, b: number) => round2(a - b);
    const drivers: string[] = [];
    if (anterior.totalReceitas > 0) {
      const dRec = delta(atual.totalReceitas, anterior.totalReceitas);
      const dCmv = delta(atual.cmv, anterior.cmv);
      const dDesp = delta(atual.totalDespesasOp + atual.impostos + atual.despesasFinanceiras, anterior.totalDespesasOp + anterior.impostos + anterior.despesasFinanceiras);
      if (dRec !== 0) drivers.push(dRec > 0 ? `receitas subiram R$ ${fmtMoney(dRec)}` : `receitas caíram R$ ${fmtMoney(Math.abs(dRec))}`);
      if (dCmv !== 0) drivers.push(dCmv > 0 ? `CMV subiu R$ ${fmtMoney(dCmv)}` : `CMV caiu R$ ${fmtMoney(Math.abs(dCmv))}`);
      if (dDesp !== 0) drivers.push(dDesp > 0 ? `despesas subiram R$ ${fmtMoney(dDesp)}` : `despesas caíram R$ ${fmtMoney(Math.abs(dDesp))}`);
    }

    return ok({
      periodo: P.label,
      atual,
      anterior,
      variacoes: {
        receitasVendas: delta(atual.receitasVendas, anterior.receitasVendas),
        receitasOutras: delta(atual.receitasOutras, anterior.receitasOutras),
        cmv: delta(atual.cmv, anterior.cmv),
        despesasOperacionais: delta(atual.totalDespesasOp, anterior.totalDespesasOp),
        impostos: delta(atual.impostos, anterior.impostos),
        despesasFinanceiras: delta(atual.despesasFinanceiras, anterior.despesasFinanceiras),
        resultadoLiquido: delta(atual.resultadoLiquido, anterior.resultadoLiquido),
        margemLiquida: round2(atual.margemLiquida - anterior.margemLiquida)
      },
      drivers
    }, {
      periodo: P.label,
      origem: ['Payment', 'StockMovement (OUT_SALE)', 'FinancialEntry'],
      nota: 'Regime de caixa: despesas entram quando pagas; CMV pelo custo de saída de estoque.'
    });
  }
};

// ---------------------------------------------------------------------------
// 3. campos_rentabilidade
// ---------------------------------------------------------------------------

const camposTool: CopilotTool = {
  name: 'campos_rentabilidade',
  description: 'Rentabilidade por campo (FUT5 e FUT7): receita gerada, reservas e ocupação no período. Útil para saber qual campo rende mais.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', enum: ['month', '7d', '30d', '90d'], description: 'month = mês atual (padrão)' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const P = parsePeriodo(args);
    const days = Math.round((P.to.getTime() - P.from.getTime()) / dayMs) + 1;

    const [payments, rentals] = await Promise.all([
      loadPayments(P.from, P.to),
      prisma.rental.findMany({
        where: { startTime: { gte: P.from, lte: P.to }, status: { not: 'CANCELED' } },
        select: { startTime: true, endTime: true, resource: true }
      })
    ]);

    let revF5 = 0, revF7 = 0;
    payments.forEach(p => {
      const s = splitPayment(p);
      revF5 += s.fut5;
      revF7 += s.fut7;
    });

    let hrsF5 = 0, hrsF7 = 0, nF5 = 0, nF7 = 0;
    rentals.forEach(r => {
      const res = (r.resource || '').toLowerCase();
      const hrs = (r.endTime.getTime() - r.startTime.getTime()) / 3600000;
      if (isFut5(res)) { hrsF5 += hrs; nF5++; }
      else if (isFut7(res)) { hrsF7 += hrs; nF7++; }
    });

    const occupancy = (hrs: number) => (16 * days) > 0 ? round2((hrs / (16 * days)) * 100) : 0;

    const fut5 = { receita: round2(revF5), reservas: nF5, horasOcupadas: round2(hrsF5), ocupacaoPct: occupancy(hrsF5) };
    const fut7 = { receita: round2(revF7), reservas: nF7, horasOcupadas: round2(hrsF7), ocupacaoPct: occupancy(hrsF7) };

    return ok({
      periodo: P.label,
      fut5,
      fut7,
      maisRentavel: fut5.receita >= fut7.receita ? 'FUT5' : 'FUT7',
      receitaTotal: round2(revF5 + revF7)
    }, {
      periodo: P.label,
      origem: ['Payment', 'OrderItem', 'Rental'],
      nota: `Ocupação considerando até 16h úteis/dia por campo, ${days} dias no período. Receita por campo proporcional ao conteúdo das comandas.`
    });
  }
};

// ---------------------------------------------------------------------------
// 4. margens_produtos
// ---------------------------------------------------------------------------

const margensTool: CopilotTool = {
  name: 'margens_produtos',
  description: 'Ranking de margem bruta por produto vendido no período (margem = (preço − custo)/preço). Mostra produtos de maior e menor margem e os que mais faturaram.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', enum: ['month', '7d', '30d', '90d'], description: 'month = mês atual (padrão)' },
      topN: { type: 'number', description: 'Quantos itens trazer (padrão 10)' }
    }
  },
  requiredPerm: 'permStock',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permStock) return deny();
    const P = parsePeriodo(args);
    const topN = Math.min(50, Math.max(1, Number(args.topN) || 10));

    const items = await prisma.orderItem.findMany({
      where: { status: 'ACTIVE', order: { status: 'CLOSED', closedAt: { gte: P.from, lte: P.to } } },
      select: { quantity: true, subtotal: true, product: { select: { name: true, price: true, cost: true } } }
    });

    const agg: Record<string, { name: string; qty: number; revenue: number; margemPct: number }> = {};
    items.forEach(it => {
      if (!it.product) return;
      const name = it.product.name;
      const a = agg[name] || (agg[name] = { name, qty: 0, revenue: 0, margemPct: 0 });
      a.qty += it.quantity;
      a.revenue += it.subtotal;
      a.margemPct = it.product.price > 0 ? round2(((it.product.price - it.product.cost) / it.product.price) * 100) : 0;
    });

    const lista = Object.values(agg);
    const porReceita = [...lista].sort((a, b) => b.revenue - a.revenue).slice(0, topN);
    const menoresMargens = [...lista].filter(a => a.margemPct >= 0).sort((a, b) => a.margemPct - b.margemPct).slice(0, Math.min(5, topN));

    return ok({
      periodo: P.label,
      topPorReceita: porReceita,
      menoresMargens,
      totalItens: lista.length
    }, {
      periodo: P.label,
      origem: ['OrderItem', 'Product'],
      nota: 'Margem pela ficha de custo atual do produto (preço de venda atual × quantidade vendida).'
    });
  }
};

// ---------------------------------------------------------------------------
// 5. clientes_inativos
// ---------------------------------------------------------------------------

const inativosTool: CopilotTool = {
  name: 'clientes_inativos',
  description: 'Clientes inativos (sem reserva ou comanda vinculada há N dias) e inadimplentes (mensalidade vencida). Retorna apenas nomes e prazos — sem dados pessoais.',
  parameters: {
    type: 'object',
    properties: {
      dias: { type: 'number', description: 'Dias sem atividade para considerar inativo (padrão 60)' }
    }
  },
  requiredPerm: 'permCustomers',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permCustomers) return deny();
    const dias = Math.min(720, Math.max(7, Number(args.dias) || 60));
    const hoje = ctx.hoje;
    const corte = new Date(hoje.getTime() - dias * dayMs);

    const [customers, rentals, linkedOrders, subs] = await Promise.all([
      prisma.customer.findMany({ select: { id: true, name: true } }),
      prisma.rental.findMany({ where: { startTime: { gte: corte } }, select: { customerId: true, startTime: true } }),
      prisma.order.findMany({ where: { customerId: { not: null }, closedAt: { gte: corte } }, select: { customerId: true, closedAt: true } }),
      prisma.subscription.findMany({ include: { customer: { select: { name: true } } } })
    ]);

    const lastRental: Record<string, Date> = {};
    rentals.forEach(r => {
      if (r.customerId && (!lastRental[r.customerId] || r.startTime > lastRental[r.customerId])) lastRental[r.customerId] = r.startTime;
    });
    const lastOrder: Record<string, Date> = {};
    linkedOrders.forEach(o => {
      if (o.customerId && o.closedAt && (!lastOrder[o.customerId] || o.closedAt > lastOrder[o.customerId])) lastOrder[o.customerId] = o.closedAt;
    });

    const inativos: { name: string; diasSemAtividade: number; ultimaAtividade: string }[] = [];
    customers.forEach(c => {
      const r = lastRental[c.id];
      const o = lastOrder[c.id];
      const ultima = r && o ? (r > o ? r : o) : (r || o);
      if (!ultima) {
        inativos.push({ name: c.name, diasSemAtividade: dias, ultimaAtividade: '—' });
        return;
      }
      const semAtividade = Math.floor((hoje.getTime() - ultima.getTime()) / dayMs);
      if (semAtividade >= dias) {
        inativos.push({ name: c.name, diasSemAtividade: semAtividade, ultimaAtividade: ultima.toLocaleDateString('pt-BR') });
      }
    });
    inativos.sort((a, b) => b.diasSemAtividade - a.diasSemAtividade);

    const inadimplentes = subs
      .filter(s => new Date(s.nextDueDate).getTime() < hoje.getTime())
      .map(s => ({ name: s.customer?.name || '—', valorMensalidade: s.amount, vencidoDesde: new Date(s.nextDueDate).toLocaleDateString('pt-BR') }));

    return ok({
      diasConsiderados: dias,
      inativos,
      inadimplentes,
      totalInativos: inativos.length,
      totalInadimplentes: inadimplentes.length
    }, {
      periodo: `atividade nos últimos ${dias} dias (referência ${fmtDate(hoje)})`,
      origem: ['Customer', 'Rental', 'Order', 'Subscription'],
      nota: 'Inatividade = sem reserva (Rental) e sem comanda vinculada fechada no período.'
    });
  }
};

// ---------------------------------------------------------------------------
// 6. horarios_ociosos
// ---------------------------------------------------------------------------

const horariosTool: CopilotTool = {
  name: 'horarios_ociosos',
  description: 'Ociosidade de horários por dia da semana no período, com base nas reservas de campos. Útil para decidir onde oferecer promoções.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', enum: ['month', '7d', '30d', '90d'], description: 'month = mês atual (padrão)' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const P = parsePeriodo(args);

    const rentals = await prisma.rental.findMany({
      where: { startTime: { gte: P.from, lte: P.to }, status: { not: 'CANCELED' } },
      select: { startTime: true, endTime: true }
    });

    // ocupação por dia da semana (0=dom, 6=sáb)
    const bookedByDow: Record<number, number> = {};
    const occurrencesByDow: Record<number, number> = {};
    for (let t = new Date(P.from); t <= P.to; t = new Date(t.getTime() + dayMs)) {
      const dow = t.getUTCDay();
      occurrencesByDow[dow] = (occurrencesByDow[dow] || 0) + 1;
    }
    rentals.forEach(r => {
      const dow = r.startTime.getUTCDay();
      bookedByDow[dow] = (bookedByDow[dow] || 0) + (r.endTime.getTime() - r.startTime.getTime()) / 3600000;
    });

    const DOW: Record<number, string> = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };
    const porDia = [0, 1, 2, 3, 4, 5, 6].map(dow => ({
      dia: DOW[dow],
      horasOcupadas: round2(bookedByDow[dow] || 0),
      disponivel: 16 * (occurrencesByDow[dow] || 0),
      ocupacaoPct: (occurrencesByDow[dow] || 0) > 0 ? round2(((bookedByDow[dow] || 0) / (16 * occurrencesByDow[dow])) * 100) : 0
    }));

    const maisOciosos = [...porDia].sort((a, b) => a.ocupacaoPct - b.ocupacaoPct).slice(0, 3);
    const pico = [...porDia].sort((a, b) => b.ocupacaoPct - a.ocupacaoPct).slice(0, 1)[0];

    return ok({
      periodo: P.label,
      porDia,
      diasMaisOciosos: maisOciosos,
      diaDePico: pico
    }, {
      periodo: P.label,
      origem: ['Rental'],
      nota: 'Ocupação por dia da semana, assumindo até 16h úteis/dia. Dica de promoção = dias com menor ocupação.'
    });
  }
};

// ---------------------------------------------------------------------------
// 7. contas_a_pagar
// ---------------------------------------------------------------------------

const contasTool: CopilotTool = {
  name: 'contas_a_pagar',
  description: 'Valor e lista de contas a pagar (FinancialEntry PAYABLE) pendentes: vencidas e a vencer.',
  parameters: { type: 'object', properties: {} },
  requiredPerm: 'permFinance',
  async execute(ctx) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const hoje = ctx.hoje;

    const entries = await prisma.financialEntry.findMany({
      where: { type: 'PAYABLE', status: 'PENDING' },
      select: { description: true, category: true, amount: true, dueDate: true, installmentNum: true, installmentTotal: true }
    });

    const vencidas = entries.filter(e => e.dueDate < hoje).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const aVencer = entries.filter(e => e.dueDate >= hoje).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    const map = (list: typeof entries) => list.map(e => ({
      descricao: e.description || (e.category || 'Conta'),
      categoria: e.category || 'Diversos',
      valor: e.amount,
      vencimento: e.dueDate.toLocaleDateString('pt-BR'),
      parcela: e.installmentTotal && e.installmentTotal > 1 ? `${e.installmentNum}/${e.installmentTotal}` : null
    }));

    const totalVencidas = round2(vencidas.reduce((a, e) => a + e.amount, 0));
    const totalAVencer = round2(aVencer.reduce((a, e) => a + e.amount, 0));

    return ok({
      totalPendente: round2(totalVencidas + totalAVencer),
      totalVencidas,
      vencidas: map(vencidas),
      totalAVencer,
      aVencer: map(aVencer)
    }, {
      periodo: 'saldo pendente em ' + fmtDate(hoje),
      origem: ['FinancialEntry'],
      nota: 'Apenas lançamentos PAYABLE com status PENDING.'
    });
  }
};

// ---------------------------------------------------------------------------
// 8. previsao_fechamento
// ---------------------------------------------------------------------------

const previsaoTool: CopilotTool = {
  name: 'previsao_fechamento',
  description: 'Previsão de fechamento do mês: realizado até hoje + pendências + projeção pela média diária. O resultado é uma ESTIMATIVA, sempre rotulada como tal.',
  parameters: { type: 'object', properties: {} },
  requiredPerm: 'permFinance',
  async execute(ctx) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();

    const hoje = ctx.hoje;
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const from = new Date(ano, mes, 1);
    const to = new Date(ano, mes + 1, 0, 23, 59, 59);
    const fimMes = new Date(ano, mes + 1, 0);

    const [payments, subPayments, financial] = await Promise.all([
      prisma.payment.findMany({ where: { date: { gte: from, lte: to } }, select: { amount: true, date: true } }),
      prisma.subscriptionPayment.findMany({ where: { paymentDate: { gte: from, lte: to } }, select: { amount: true, paymentDate: true } }),
      prisma.financialEntry.findMany({ where: { status: 'PENDING' }, select: { type: true, amount: true, dueDate: true } })
    ]);

    let realizadoVendas = 0;
    payments.forEach(p => { if (p.date <= hoje) realizadoVendas += p.amount; });
    let realizadoMensal = 0;
    subPayments.forEach(s => { if (s.paymentDate <= hoje) realizadoMensal += s.amount; });
    const realizado = realizadoVendas + realizadoMensal;

    let aReceber = 0, aPagar = 0;
    financial.forEach(f => {
      if (f.dueDate < from || f.dueDate > to) return;
      if (f.type === 'RECEIVABLE') aReceber += f.amount;
      else aPagar += f.amount;
    });

    const diaAtual = hoje.getDate();
    const diasTotais = fimMes.getDate();
    const diasRestantes = Math.max(0, diasTotais - diaAtual);
    const ritmoDiario = diaAtual > 0 ? realizado / diaAtual : 0;
    const projetadoPeloRitmo = realizado + ritmoDiario * diasRestantes;

    const saldoProjetado = round2(realizado + aReceber - aPagar);
    const projecaoComRitmo = round2(projetadoPeloRitmo + aReceber - aPagar);

    return ok({
      mes: `${String(mes + 1).padStart(2, '0')}/${ano}`,
      realizadoAteHoje: round2(realizado),
      diasDecorridos: diaAtual,
      diasTotais,
      aReceberNoMes: round2(aReceber),
      aPagarNoMes: round2(aPagar),
      saldoProjetado: saldoProjetado,
      projecaoComRitmo: projecaoComRitmo
    }, {
      periodo: `${fmtDate(from)} a ${fmtDate(hoje)} (referência)`,
      origem: ['Payment', 'SubscriptionPayment', 'FinancialEntry'],
      nota: 'ESTIMATIVA. "projecaoComRitmo" assume a média diária atual até o fim do mês; não é garantia de fechamento.'
    });
  }
};

// ---------------------------------------------------------------------------
// 9. resumo_operacional
// ---------------------------------------------------------------------------

const resumoTool: CopilotTool = {
  name: 'resumo_operacional',
  description: 'Resumo operacional do período: comandas pagas, ticket médio, top produtos vendidos, métodos de pagamento, mensalidades recebidas e total de reservas.',
  parameters: {
    type: 'object',
    properties: {
      periodo: { type: 'string', enum: ['month', '7d', '30d', '90d'], description: 'month = mês atual (padrão)' }
    }
  },
  requiredPerm: 'permFinance',
  async execute(ctx, args) {
    if (!isAdmin(ctx) && !ctx.user.permFinance) return deny();
    const P = parsePeriodo(args);

    const [payments, subPayments, orderItems, rentals] = await Promise.all([
      loadPayments(P.from, P.to),
      prisma.subscriptionPayment.findMany({ where: { paymentDate: { gte: P.from, lte: P.to } }, select: { amount: true, paymentDate: true } }),
      prisma.orderItem.findMany({
        where: { status: 'ACTIVE', order: { status: 'CLOSED', closedAt: { gte: P.from, lte: P.to } } },
        select: { quantity: true, subtotal: true, product: { select: { name: true } } }
      }),
      prisma.rental.findMany({ where: { startTime: { gte: P.from, lte: P.to }, status: { not: 'CANCELED' } }, select: { startTime: true, endTime: true } })
    ]);

    const comandasPagas = new Set(payments.filter(p => p.orderId).map(p => p.orderId)).size;
    const receitaVendas = payments.reduce((a, p) => a + (p.amount || 0), 0);
    const mensalidades = subPayments.reduce((a, s) => a + s.amount, 0);
    const ticket = comandasPagas > 0 ? round2(receitaVendas / comandasPagas) : 0;

    const methodMap: Record<string, string> = { CASH: 'Dinheiro', PIX: 'Pix', DEBIT: 'Débito', CREDIT: 'Crédito' };
    const methods: Record<string, number> = {};
    payments.forEach(p => {
      const label = methodMap[p.method] || p.method || 'Outros';
      methods[label] = round2((methods[label] || 0) + p.amount);
    });

    const prodAgg: Record<string, number> = {};
    orderItems.forEach(it => {
      if (!it.product) return;
      prodAgg[it.product.name] = (prodAgg[it.product.name] || 0) + it.quantity;
    });
    const topProdutos = Object.entries(prodAgg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, qtd]) => ({ nome, qtd }));

    const horasOcupadas = rentals.reduce((a, r) => a + (r.endTime.getTime() - r.startTime.getTime()) / 3600000, 0);

    return ok({
      periodo: P.label,
      comandasPagas,
      receitaVendas: round2(receitaVendas),
      receitaMensalidades: round2(mensalidades),
      ticketMedio: ticket,
      metodosPagamento: methods,
      topProdutos,
      totalReservas: rentals.length,
      horasReservadas: round2(horasOcupadas)
    }, {
      periodo: P.label,
      origem: ['Payment', 'OrderItem', 'SubscriptionPayment', 'Rental'],
      nota: 'Ticket médio = receita de vendas / comandas pagas no período.'
    });
  }
};

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

export const COPILOT_TOOLS: CopilotTool[] = [
  faturamentoTool,
  dreTool,
  camposTool,
  margensTool,
  inativosTool,
  horariosTool,
  contasTool,
  previsaoTool,
  resumoTool
];