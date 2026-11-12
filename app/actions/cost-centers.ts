'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { revalidatePath } from 'next/cache';
import { prisma } from '../../lib/prisma';
import {
  getCostCenterAdminData,
  getCostCenterReport,
  type CostCenterAdminData,
  type CostCenterReport,
} from '../../lib/cost-centers';
import { isMonthKey } from '../../lib/official-financials';
import { NEW_RULES_EFFECTIVE_LABEL, NEW_RULES_EFFECTIVE_START, isNewRulesDate, isNewRulesPeriod } from '../../lib/effective-rules';
import { createAuditLog } from './audit';

function monthOf(value: Date): string {
  const iso = value.toISOString();
  return Number.isNaN(value.getTime()) ? '' : iso.slice(0, 7);
}

async function requireIntelligenceUser() {
  const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
  if (!session?.user?.id) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permInteligencia)) return null;
  return dbUser;
}

async function requireFinanceUser() {
  const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
  if (!session?.user?.id) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permFinance)) return null;
  return dbUser;
}

export async function getCostCenterReportAction(
  period: string
): Promise<{ success: boolean; error?: string; data?: CostCenterReport }> {
  try {
    const user = await requireIntelligenceUser();
    if (!user) return { success: false, error: 'Sem permissao para acessar custos por centro.' };
    const data = await getCostCenterReport(period);
    return { success: true, data };
  } catch (error: any) {
    console.error('ERRO_COST_CENTERS:', error);
    return { success: false, error: error?.message || 'Falha ao carregar custos por centro.' };
  }
}

export async function getCostCenterAdminDataAction(
  period: string
): Promise<{ success: boolean; error?: string; data?: CostCenterAdminData }> {
  try {
    const user = await requireFinanceUser();
    if (!user) return { success: false, error: 'Sem permissao para administrar alocacoes de custo.' };
    const data = await getCostCenterAdminData(period);
    return { success: true, data };
  } catch (error: any) {
    console.error('ERRO_COST_CENTER_ADMIN:', error);
    return { success: false, error: error?.message || 'Falha ao carregar dados administrativos.' };
  }
}

export async function upsertCostAllocationAction(input: {
  financialEntryId: string;
  costCenterId: string;
  period: string;
  amount: number;
  driver: string;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireFinanceUser();
    if (!user) return { success: false, error: 'Sem permissao para alocar custos.' };
    if (!isMonthKey(input.period)) return { success: false, error: 'Periodo invalido. Use YYYY-MM.' };
    if (!isNewRulesPeriod(input.period)) {
      return { success: false, error: `As regras de custos vigoram a partir de ${NEW_RULES_EFFECTIVE_LABEL}.` };
    }
    const amount = Number(input.amount);
    if (!input.financialEntryId || !input.costCenterId || !Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: 'Informe lancamento, centro de custo e valor positivo.' };
    }
    const allowedDrivers = ['HOURS_REGULAR', 'HOURS_EXTRA', 'HOURS_TOTAL', 'REVENUE', 'MANUAL', 'SHARED'];
    const driver = allowedDrivers.includes(input.driver) ? input.driver : 'MANUAL';

    const periodClose = await prisma.financialPeriodClose.findUnique({ where: { period: input.period }, select: { status: true } });
    if (periodClose?.status === 'CLOSED') {
      return { success: false, error: 'Periodo fechado: reabra com justificativa antes de alterar alocacoes.' };
    }

    const saved = await prisma.$transaction(async (tx) => {
      // Serializa operacoes do mesmo lancamento mesmo com administradores concorrentes.
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${input.financialEntryId})::bigint)) AS allocation_lock`;

      const entry = await tx.financialEntry.findUnique({
        where: { id: input.financialEntryId },
        select: { id: true, amount: true, type: true, status: true, description: true, dueDate: true, competenceDate: true },
      });
      const center = await tx.costCenter.findUnique({
        where: { id: input.costCenterId },
        select: { id: true, code: true, name: true },
      });
      if (!entry || entry.type !== 'PAYABLE') throw new Error('Lancamento financeiro invalido para alocacao de custo.');
      if (!center) throw new Error('Centro de custo invalido.');
      const entryPeriod = monthOf(entry.competenceDate || entry.dueDate);
      if (!entryPeriod || entryPeriod !== input.period) {
        throw new Error(`O lancamento pertence a competencia ${entryPeriod || 'nao identificada'}, diferente de ${input.period}.`);
      }

      const existing = await tx.costAllocation.findUnique({
        where: {
          financialEntryId_costCenterId_period: {
            financialEntryId: input.financialEntryId,
            costCenterId: input.costCenterId,
            period: input.period,
          },
        },
        select: { id: true, amount: true },
      });
      const others = await tx.costAllocation.aggregate({
        where: {
          financialEntryId: input.financialEntryId,
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        _sum: { amount: true },
      });
      const already = Number(others._sum.amount) || 0;
      if (already + amount > Number(entry.amount) + 0.001) {
        throw new Error('A soma das alocacoes ultrapassa o valor do lancamento.');
      }

      await tx.costAllocation.upsert({
        where: {
          financialEntryId_costCenterId_period: {
            financialEntryId: input.financialEntryId,
            costCenterId: input.costCenterId,
            period: input.period,
          },
        },
        update: { amount, driver, note: input.note },
        create: {
          financialEntryId: input.financialEntryId,
          costCenterId: input.costCenterId,
          period: input.period,
          amount,
          driver,
          note: input.note,
        },
      });

      return { entry, center, existing };
    });

    await createAuditLog(
      'Alocacao de custo',
      `${saved.existing ? 'Editou' : 'Criou'} alocacao de R$ ${amount.toFixed(2)} do lancamento "${saved.entry.description}" para ${saved.center.code} em ${input.period}.`
    );
    revalidatePath('/inteligencia');
    return { success: true };
  } catch (error: any) {
    console.error('ERRO_COST_ALLOCATION:', error);
    const message = String(error?.message || '');
    if (message.includes('CostAllocation total exceeds')) {
      return { success: false, error: 'A soma das alocacoes ultrapassa o valor do lancamento.' };
    }
    return { success: false, error: message || 'Falha ao salvar alocacao de custo.' };
  }
}

export async function upsertOperatingCostRuleAction(input: {
  id?: string;
  costCenterId: string;
  type: 'FIXED_MONTHLY' | 'VARIABLE_PER_HOUR' | 'SHARED';
  amount: number;
  ratePerHour?: number;
  driver?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireFinanceUser();
    if (!user) return { success: false, error: 'Sem permissao para configurar regras de custo.' };
    const center = await prisma.costCenter.findUnique({ where: { id: input.costCenterId }, select: { id: true, code: true } });
    if (!center) return { success: false, error: 'Centro de custo invalido.' };
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0) return { success: false, error: 'Valor da regra invalido.' };
    if (input.type === 'VARIABLE_PER_HOUR' && (!Number.isFinite(Number(input.ratePerHour)) || Number(input.ratePerHour) < 0)) {
      return { success: false, error: 'Informe custo por hora valido.' };
    }
    if (input.effectiveFrom && Number.isNaN(new Date(input.effectiveFrom).getTime())) {
      return { success: false, error: 'Data inicial invalida.' };
    }
    if (input.effectiveTo && Number.isNaN(new Date(input.effectiveTo).getTime())) {
      return { success: false, error: 'Data final invalida.' };
    }
    if (input.effectiveFrom && input.effectiveTo && new Date(input.effectiveFrom) > new Date(input.effectiveTo)) {
      return { success: false, error: 'Data final deve ser maior que a inicial.' };
    }
    if (input.effectiveFrom && !isNewRulesDate(input.effectiveFrom)) {
      return { success: false, error: `A regra nao pode vigorar antes de ${NEW_RULES_EFFECTIVE_LABEL}.` };
    }
    if (input.effectiveTo && !isNewRulesDate(input.effectiveTo)) {
      return { success: false, error: `A regra nao pode terminar antes de ${NEW_RULES_EFFECTIVE_LABEL}.` };
    }

    const data = {
      costCenterId: input.costCenterId,
      type: input.type,
      amount,
      ratePerHour: input.ratePerHour == null ? null : Number(input.ratePerHour),
      driver: input.driver || null,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : NEW_RULES_EFFECTIVE_START,
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      isActive: input.isActive !== false,
    };

    if (input.id) {
      const existing = await prisma.operatingCostRule.findUnique({ where: { id: input.id }, select: { id: true } });
      if (!existing) return { success: false, error: 'Regra de custo nao encontrada.' };
      await prisma.operatingCostRule.update({ where: { id: input.id }, data });
    } else {
      await prisma.operatingCostRule.create({ data });
    }

    await createAuditLog(
      input.id ? 'Edicao de regra de custo' : 'Nova regra de custo',
      `${input.id ? 'Editou' : 'Criou'} regra ${input.type} para ${center.code}.`
    );
    revalidatePath('/inteligencia');
    return { success: true };
  } catch (error: any) {
    console.error('ERRO_COST_RULE:', error);
    return { success: false, error: error?.message || 'Falha ao salvar regra de custo.' };
  }
}

export async function deleteCostAllocationAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireFinanceUser();
    if (!user) return { success: false, error: 'Sem permissao para excluir alocacoes.' };
    const existing = await prisma.costAllocation.findUnique({
      where: { id },
      select: { financialEntryId: true },
    });
    if (!existing) return { success: false, error: 'Alocacao nao encontrada.' };

    const allocation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${existing.financialEntryId})::bigint)) AS allocation_lock`;
      const current = await tx.costAllocation.findUnique({
        where: { id },
        include: { financialEntry: { select: { description: true } }, costCenter: { select: { code: true } } },
      });
      if (!current) throw new Error('Alocacao nao encontrada.');
      if (!isNewRulesPeriod(current.period)) {
        throw new Error(`As regras de custos vigoram a partir de ${NEW_RULES_EFFECTIVE_LABEL}.`);
      }
      const periodClose = await tx.financialPeriodClose.findUnique({ where: { period: current.period }, select: { status: true } });
      if (periodClose?.status === 'CLOSED') {
        throw new Error('Periodo fechado: reabra com justificativa antes de excluir alocacoes.');
      }
      await tx.costAllocation.delete({ where: { id } });
      return current;
    });

    await createAuditLog('Exclusao de alocacao de custo', `Excluiu R$ ${Number(allocation.amount).toFixed(2)} de ${allocation.costCenter.code} do lancamento "${allocation.financialEntry.description}" em ${allocation.period}.`);
    revalidatePath('/inteligencia');
    return { success: true };
  } catch (error: any) {
    console.error('ERRO_DELETE_COST_ALLOCATION:', error);
    return { success: false, error: error?.message || 'Falha ao excluir alocacao.' };
  }
}

export async function deleteOperatingCostRuleAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireFinanceUser();
    if (!user) return { success: false, error: 'Sem permissao para excluir regras de custo.' };
    const rule = await prisma.operatingCostRule.findUnique({ where: { id }, include: { costCenter: { select: { code: true } } } });
    if (!rule) return { success: false, error: 'Regra de custo nao encontrada.' };
    await prisma.operatingCostRule.delete({ where: { id } });
    await createAuditLog('Exclusao de regra de custo', `Excluiu regra ${rule.type} de ${rule.costCenter.code}.`);
    revalidatePath('/inteligencia');
    return { success: true };
  } catch (error: any) {
    console.error('ERRO_DELETE_COST_RULE:', error);
    return { success: false, error: error?.message || 'Falha ao excluir regra de custo.' };
  }
}
