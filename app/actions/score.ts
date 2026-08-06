'use server'

import { prisma } from '../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { isRentalItem, getCuiabaDateStr } from '../../lib/analytics';
import {
  computeScore,
  DEFAULT_PESOS,
  DEFAULT_LIMIARES,
  classificar,
  recomendacao,
  type ScorePesos,
  type ScoreLimiares,
  type FatorScore
} from '../../lib/score';

const dayMs = 24 * 60 * 60 * 1000;

export interface ScoreCliente {
  id: string;
  name: string;
  phone: string | null;
  score: number;
  classificacao: string;
  recomendacao: string;
  flagInadimplente: boolean;
  fatores: FatorScore[];
  frequencia: number;
  gastoAcumulado: number;
  ticketMedio: number;
  ticketBar: number;
  ultimaReserva: string | null;
  diasSemReservar: number | null;
  totalReservas: number;
  canceladosForaPrazo: number;
  faltas: number;
  mensalidade: { planName: string; amount: number; vencida: boolean; semPagamentoRecente: boolean } | null;
}

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado');
  return session.user.id as string;
}

export async function getScoreConfig() {
  await requireSession();
  const cfg = await prisma.scoreConfig.findUnique({ where: { id: 1 } });
  return {
    success: true,
    pesos: (cfg?.pesos as unknown as ScorePesos) || DEFAULT_PESOS,
    limiares: (cfg?.limiares as unknown as ScoreLimiares) || DEFAULT_LIMIARES
  };
}

export async function saveScoreConfig(pesos: ScorePesos, limiares: ScoreLimiares) {
  const userId = await requireSession();
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser || dbUser.role !== 'ADMIN') {
    return { success: false, error: 'Somente administradores podem alterar os pesos do score.' };
  }

  const soma = Object.values(pesos).reduce((a, b) => a + (b || 0), 0);
  if (Math.abs(soma - 100) > 0.01) return { success: false, error: 'A soma dos pesos deve ser exatamente 100.' };
  if (Object.values(pesos).some(v => (v || 0) < 0)) return { success: false, error: 'Pesos não podem ser negativos.' };
  if (Object.values(limiares).some(v => (v || 0) <= 0)) return { success: false, error: 'Limiares devem ser maiores que zero.' };

  await prisma.scoreConfig.upsert({
    where: { id: 1 },
    update: { pesos: pesos as any, limiares: limiares as any },
    create: { id: 1, pesos: pesos as any, limiares: limiares as any }
  });

  await recalcAllScores();
  return { success: true };
}

export async function getScoreHistory(customerId: string) {
  await requireSession();
  const rows = await prisma.customerScoreHistory.findMany({
    where: { customerId },
    orderBy: { snapshotAt: 'desc' },
    take: 12
  });
  return {
    success: true,
    history: rows.map(r => ({
      score: r.score,
      classificacao: r.classificacao,
      snapshotAt: r.snapshotAt.toISOString()
    }))
  };
}

// ---------------------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------------------

interface Agg {
  hoje: Date;
  inicioJanela: Date;
  pesos: ScorePesos;
  limiares: ScoreLimiares;
}

async function loadAgg(hoje: Date, limiares: ScoreLimiares): Promise<Agg> {
  const inicioJanela = new Date(hoje.getTime());
  inicioJanela.setMonth(inicioJanela.getMonth() - limiares.mesesAnalise);
  const cfg = await prisma.scoreConfig.findUnique({ where: { id: 1 } });
  return {
    hoje,
    inicioJanela,
    pesos: (cfg?.pesos as unknown as ScorePesos) || DEFAULT_PESOS,
    limiares: (cfg?.limiares as unknown as ScoreLimiares) || DEFAULT_LIMIARES
  };
}

interface CustomerAgg {
  id: string;
  name: string;
  phone: string | null;
  rentals: any[];
  subscription: any | null;
  linkedOrders: any[];
}

function buildScoreCliente(c: CustomerAgg, agg: Agg): ScoreCliente {
  const { hoje, inicioJanela, pesos, limiares } = agg;
  const diaMs = dayMs;

  const validos = c.rentals.filter(r => r.status !== 'CANCELED' && r.status !== 'NO_SHOW');
  const noPeriodo = validos.filter(r => r.startTime >= inicioJanela && r.startTime <= hoje);

  const reservasPeriodo = noPeriodo.length;
  const gastoAluguel = noPeriodo.reduce((a, r) => a + (r.totalAmount || 0), 0);
  const mesesAtivos = new Set(noPeriodo.map(r => `${r.startTime.getFullYear()}-${r.startTime.getMonth()}`)).size;

  const comandasPeriodo = c.linkedOrders.filter(o => {
    const dt = o.closedAt || o.openedAt;
    return dt && dt >= inicioJanela && dt <= hoje && o.status !== 'CANCELED';
  });
  let consumoBar = 0;
  comandasPeriodo.forEach(o => {
    (o.items || []).forEach((it: any) => {
      if (!isRentalItem(it)) consumoBar += it.subtotal || 0;
    });
  });

  const payments = (c.subscription?.payments || []).map((p: any) => ({
    paymentDate: new Date(p.paymentDate),
    referenceMonth: new Date(p.referenceMonth)
  }));
  const temMensalidade = !!c.subscription;
  const mensalidadeVencida = !!c.subscription && new Date(c.subscription.nextDueDate).getTime() < hoje.getTime();
  const lastPayment = payments.length > 0 ? payments[0].paymentDate : null;
  const semPagamentoRecente = temMensalidade && (!lastPayment || lastPayment.getTime() < hoje.getTime() - 60 * diaMs);

  let ultimaReserva: Date | null = null;
  for (const r of c.rentals) {
    const t = new Date(r.startTime);
    if (!ultimaReserva || t > ultimaReserva) ultimaReserva = t;
  }

  const canceladosForaPrazo = c.rentals.filter(r => {
    if (r.status !== 'CANCELED') return false;
    if (!r.cancelledAt) return true;
    return (r.startTime.getTime() - new Date(r.cancelledAt).getTime()) < limiares.prazoCancelamentoHoras * 3600000;
  }).length;

  const faltas = c.rentals.filter(r => r.status === 'NO_SHOW').length;

  const result = computeScore(
    {
      hoje,
      inicioJanela,
      reservasPeriodo,
      mesesAtivos,
      gastoAluguel,
      consumoBar,
      pagamentosMensalidade: payments,
      temMensalidade,
      mensalidadeVencida,
      semPagamentoRecente,
      ultimaReserva,
      canceladosForaPrazo,
      faltas
    },
    pesos,
    limiares
  );

  const diasSemReservar = ultimaReserva ? Math.max(0, Math.floor((hoje.getTime() - ultimaReserva.getTime()) / diaMs)) : null;
  const gastoTotal = c.rentals.filter(r => r.status !== 'CANCELED' && r.status !== 'NO_SHOW')
    .reduce((a, r) => a + (r.totalAmount || 0), 0) + c.linkedOrders
      .filter(o => o.status !== 'CANCELED')
      .reduce((a, o) => a + (o.items || []).filter((it: any) => !isRentalItem(it)).reduce((s: number, it: any) => s + (it.subtotal || 0), 0), 0);

  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    score: result.score,
    classificacao: result.classificacao,
    recomendacao: result.recomendacao,
    flagInadimplente: result.flagInadimplente,
    fatores: result.fatores,
    frequencia: reservasPeriodo,
    gastoAcumulado: gastoTotal,
    ticketMedio: reservasPeriodo > 0 ? gastoAluguel / reservasPeriodo : 0,
    ticketBar: comandasPeriodo.length > 0 ? consumoBar / comandasPeriodo.length : 0,
    ultimaReserva: ultimaReserva ? ultimaReserva.toISOString() : null,
    diasSemReservar,
    totalReservas: validos.length,
    canceladosForaPrazo,
    faltas,
    mensalidade: temMensalidade ? {
      planName: c.subscription.planName,
      amount: c.subscription.amount,
      vencida: mensalidadeVencida,
      semPagamentoRecente
    } : null
  };
}

async function persistScore(c: CustomerAgg, agg: Agg) {
  const sc = buildScoreCliente(c, agg);
  await prisma.customerScore.upsert({
    where: { customerId: c.id },
    update: {
      score: sc.score,
      classificacao: sc.classificacao,
      componentes: Object.fromEntries(sc.fatores.map(f => [f.fator, f])) as any,
      recomendacao: sc.recomendacao
    },
    create: {
      customerId: c.id,
      score: sc.score,
      classificacao: sc.classificacao,
      componentes: Object.fromEntries(sc.fatores.map(f => [f.fator, f])) as any,
      recomendacao: sc.recomendacao
    }
  });

  const last = await prisma.customerScoreHistory.findFirst({
    where: { customerId: c.id },
    orderBy: { snapshotAt: 'desc' }
  });
  const shouldSnapshot = !last ||
    last.score !== sc.score ||
    (agg.hoje.getTime() - last.snapshotAt.getTime()) > 12 * 3600000;

  if (shouldSnapshot) {
    await prisma.customerScoreHistory.create({
      data: {
        customerId: c.id,
        score: sc.score,
        classificacao: sc.classificacao,
        componentes: Object.fromEntries(sc.fatores.map(f => [f.fator, f])) as any
      }
    });
  }

  // Mantém no máximo os 60 snapshots mais recentes por cliente
  const older = await prisma.customerScoreHistory.findMany({
    where: { customerId: c.id },
    orderBy: { snapshotAt: 'desc' },
    skip: 60,
    select: { id: true }
  });
  if (older.length > 0) {
    await prisma.customerScoreHistory.deleteMany({ where: { id: { in: older.map(o => o.id) } } });
  }
}

// Calcula (e persiste) o score de todos os clientes. Usado na carga da tela e
// nos ganchos de recálculo. Retorna a lista serializável para o cliente.
export async function computeCustomerScores(): Promise<ScoreCliente[]> {
  const hojeStr = getCuiabaDateStr();
  const hoje = new Date(`${hojeStr}T00:00:00-04:00`);

  const [customers, cfg, linkedOrders] = await Promise.all([
    prisma.customer.findMany({
      include: {
        subscription: { include: { payments: { orderBy: { paymentDate: 'desc' } } } },
        rentals: true
      },
      orderBy: { name: 'asc' }
    }),
    prisma.scoreConfig.findUnique({ where: { id: 1 } }),
    prisma.order.findMany({
      where: { customerId: { not: null } },
      include: {
        items: {
          where: { status: 'ACTIVE' },
          include: { product: { include: { category: true } }, service: true }
        }
      }
    })
  ]);

  const limiares = (cfg?.limiares as unknown as ScoreLimiares) || DEFAULT_LIMIARES;
  const pesos = (cfg?.pesos as unknown as ScorePesos) || DEFAULT_PESOS;
  const agg: Agg = {
    hoje,
    inicioJanela: (() => { const d = new Date(hoje.getTime()); d.setMonth(d.getMonth() - limiares.mesesAnalise); return d; })(),
    pesos,
    limiares
  };

  const byCustomer = new Map<string, any[]>();
  linkedOrders.forEach(o => {
    if (!o.customerId) return;
    const arr = byCustomer.get(o.customerId) || [];
    arr.push(o);
    byCustomer.set(o.customerId, arr);
  });

  const out: ScoreCliente[] = [];
  for (const c of customers) {
    const custAgg: CustomerAgg = {
      id: c.id,
      name: c.name,
      phone: c.phone,
      rentals: c.rentals,
      subscription: c.subscription,
      linkedOrders: byCustomer.get(c.id) || []
    };
    await persistScore(custAgg, agg);
    out.push(buildScoreCliente(custAgg, agg));
  }

  return out;
}

export async function recalcAllScores() {
  await computeCustomerScores();
  return { success: true };
}

export async function recalcScore(customerId: string) {
  await requireSession();
  const hojeStr = getCuiabaDateStr();
  const hoje = new Date(`${hojeStr}T00:00:00-04:00`);
  const agg = await loadAgg(hoje, DEFAULT_LIMIARES);

  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      subscription: { include: { payments: { orderBy: { paymentDate: 'desc' } } } },
      rentals: true
    }
  });
  if (!c) return { success: false, error: 'Cliente não encontrado.' };

  const linkedOrders = await prisma.order.findMany({
    where: { customerId },
    include: {
      items: {
        where: { status: 'ACTIVE' },
        include: { product: { include: { category: true } }, service: true }
      }
    }
  });

  const custAgg: CustomerAgg = { id: c.id, name: c.name, phone: c.phone, rentals: c.rentals, subscription: c.subscription, linkedOrders };
  await persistScore(custAgg, agg);
  return { success: true, cliente: buildScoreCliente(custAgg, agg) };
}

export async function getScores() {
  await requireSession();
  const scores = await computeCustomerScores();
  return { success: true, scores };
}

export { classificar, recomendacao };
