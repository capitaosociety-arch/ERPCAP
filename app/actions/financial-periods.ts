'use server'

import { prisma } from '../../lib/prisma';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '../../lib/auth-guard';
import { computeDre, computeDreAccrual } from '../../lib/dre';
import { createAuditLog } from './audit';

function periodFromDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cuiaba',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  if (!year || !month) throw new Error('Data inválida para período financeiro.');
  return `${year}-${month}`;
}

function periodRange(period: string): { from: Date; to: Date } {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Período inválido. Use YYYY-MM.');
  const [year, month] = period.split('-').map(Number);
  const from = new Date(`${period}-01T00:00:00-04:00`);
  const next = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  const nextPeriod = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  const to = new Date(new Date(`${nextPeriod}-01T00:00:00-04:00`).getTime() - 1);
  return { from, to };
}

export async function assertFinancialPeriodOpen(date: Date | string): Promise<void> {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return;
  const period = periodFromDate(parsed);
  const close = await prisma.financialPeriodClose.findUnique({ where: { period } });
  if (close?.status === 'CLOSED') {
    throw new Error(`O período ${period} está fechado. Reabra o mês no DRE antes de alterar lançamentos.`);
  }
}

export async function closeFinancialPeriod(period: string) {
  const user = await requirePermission('permFinance');
  if (user.role !== 'ADMIN') throw new Error('Apenas administradores podem fechar períodos.');

  const currentPeriod = periodFromDate(new Date());
  if (period >= currentPeriod) {
    throw new Error('O mês corrente permanece aberto. Feche apenas meses anteriores.');
  }

  const existing = await prisma.financialPeriodClose.findUnique({ where: { period } });
  if (existing?.status === 'CLOSED') throw new Error('Este período já está fechado.');

  const { from, to } = periodRange(period);
  const [cashDre, competenceDre] = await Promise.all([
    computeDre(from, to),
    computeDreAccrual(from, to),
  ]);
  const expenses = competenceDre.totalDespesasOp + competenceDre.despesasFinanceiras + competenceDre.impostos;
  const version = (existing?.version || 0) + 1;
  const snapshot = {
    key: period,
    periodStatus: 'CLOSED',
    primaryRegime: 'competence',
    regimes: {
      competence: competenceDre,
      cash: cashDre,
    },
    closedAt: new Date().toISOString(),
    version,
  };

  const saved = existing
    ? await prisma.financialPeriodClose.update({
        where: { period },
        data: {
          status: 'CLOSED',
          snapshot: snapshot as any,
          revenue: competenceDre.totalReceitas,
          cmv: competenceDre.cmv,
          expenses,
          result: competenceDre.resultadoLiquido,
          version,
          closedAt: new Date(),
          closedById: user.id,
          reopenedAt: null,
          reopenedById: null,
          reopenReason: null,
        },
      })
    : await prisma.financialPeriodClose.create({
        data: {
          period,
          status: 'CLOSED',
          snapshot: snapshot as any,
          revenue: competenceDre.totalReceitas,
          cmv: competenceDre.cmv,
          expenses,
          result: competenceDre.resultadoLiquido,
          version,
          closedAt: new Date(),
          closedById: user.id,
        },
      });

  await prisma.financialPeriodAudit.create({
    data: {
      period,
      action: 'CLOSE',
      userId: user.id,
      reason: version > 1 ? 'Refechamento após reabertura' : 'Fechamento mensal',
      before: existing?.snapshot ?? undefined,
      after: snapshot as any,
    },
  });

  await createAuditLog(
    'Fechamento DRE',
    `Fechou o período ${period} (versão ${version}). Competência: receita R$ ${competenceDre.totalReceitas.toFixed(2)}, CMV R$ ${competenceDre.cmv.toFixed(2)}, resultado R$ ${competenceDre.resultadoLiquido.toFixed(2)}. Caixa: receita R$ ${cashDre.totalReceitas.toFixed(2)}, CMV R$ ${cashDre.cmv.toFixed(2)}, resultado R$ ${cashDre.resultadoLiquido.toFixed(2)}.`
  );

  revalidatePath('/financeiro');
  return { success: true, close: saved };
}

export async function reopenFinancialPeriod(period: string, reason: string) {
  const user = await requirePermission('permFinance');
  if (user.role !== 'ADMIN') throw new Error('Apenas administradores podem reabrir períodos.');
  if (!reason || !reason.trim()) throw new Error('Informe a justificativa da reabertura.');

  const existing = await prisma.financialPeriodClose.findUnique({ where: { period } });
  if (!existing || existing.status !== 'CLOSED') throw new Error('Período não está fechado.');

  const before = existing.snapshot as any;
  const after = {
    ...(existing.snapshot as any),
    periodStatus: 'OPEN',
    reopenedAt: new Date().toISOString(),
    reopenedById: user.id,
    reopenReason: reason.trim(),
  };

  const saved = await prisma.financialPeriodClose.update({
    where: { period },
    data: {
      status: 'OPEN',
      reopenedAt: new Date(),
      reopenedById: user.id,
      reopenReason: reason.trim(),
      snapshot: after,
    },
  });

  await prisma.financialPeriodAudit.create({
    data: {
      period,
      action: 'REOPEN',
      userId: user.id,
      reason: reason.trim(),
      before: before as any,
      after: after as any,
    },
  });

  await createAuditLog('Reabertura DRE', `Reabriu o período ${period}. Justificativa: ${reason.trim()}`);

  revalidatePath('/financeiro');
  return { success: true, close: saved };
}
