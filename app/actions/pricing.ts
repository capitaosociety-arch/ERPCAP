'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { prisma } from '../../lib/prisma';
import { cacheWrap, managementTtlMs, invalidateCache } from '../../lib/intelligence-cache';
import { currentCuiabaMonth, isMonthKey } from '../../lib/official-financials';
import {
  getPricingReport,
  simulatePricingScenario,
  type PricingReport,
  type PricingScenarioInput,
  type PricingScenarioResult,
} from '../../lib/pricing-intelligence';

async function requireUser() {
  const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
  if (!session?.user?.id) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permInteligencia)) return null;
  return dbUser;
}

export async function getPricingReportAction(
  period: string,
  forceRefresh = false
): Promise<{ success: boolean; error?: string; data?: PricingReport }> {
  try {
    const user = await requireUser();
    if (!user) return { success: false, error: 'Sem permissão para acessar precificação.' };
    if (!isMonthKey(period)) return { success: false, error: 'Período inválido. Use AAAA-MM.' };
    const canSeeNames = user.role === 'ADMIN' || !!user.permCustomers;
    const key = `pricing-report:${period}:${canSeeNames ? 'names' : 'redacted'}`;
    if (forceRefresh) invalidateCache('pricing-report:');
    const data = await cacheWrap(key, managementTtlMs(period, currentCuiabaMonth()), () => getPricingReport(period, canSeeNames));
    return { success: true, data };
  } catch (error: any) {
    console.error('ERRO_PRICING_REPORT:', error);
    return { success: false, error: error?.message || 'Falha ao carregar precificação.' };
  }
}

export async function simulatePricingScenarioAction(
  period: string,
  input: PricingScenarioInput
): Promise<{ success: boolean; error?: string; data?: PricingScenarioResult }> {
  try {
    const user = await requireUser();
    if (!user) return { success: false, error: 'Sem permissão para simular precificação.' };
    if (!isMonthKey(period)) return { success: false, error: 'Período inválido. Use AAAA-MM.' };
    const report = await getPricingReport(period, user.role === 'ADMIN' || !!user.permCustomers);
    const clean: PricingScenarioInput = {
      scenario: input.scenario,
      discountPct: Math.max(0, Math.min(100, Number(input.discountPct) || 0)),
      priceChangePct: Math.max(-100, Math.min(200, Number(input.priceChangePct) || 0)),
      additionalBookings: Math.max(0, Math.min(10000, Number(input.additionalBookings) || 0)),
      targetSegment: input.targetSegment,
      migrationRiskPct: Math.max(0, Math.min(100, Number(input.migrationRiskPct) || 0)),
    };
    return { success: true, data: simulatePricingScenario(report, clean) };
  } catch (error: any) {
    console.error('ERRO_PRICING_SCENARIO:', error);
    return { success: false, error: error?.message || 'Falha ao simular precificação.' };
  }
}
