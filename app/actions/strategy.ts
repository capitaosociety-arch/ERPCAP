'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { prisma } from '../../lib/prisma';
import type { FinancialRegime } from '../../lib/official-financials';
import {
  getForecastReportCached,
  getScenario,
  getStrategicRecommendationsCached,
  type ForecastReport,
  type RecommendationsReport,
  type ScenarioInput,
  type ScenarioResult,
} from '../../lib/strategic-analytics';
import { invalidateCache } from '../../lib/intelligence-cache';

async function requireIntelligenceUser() {
  const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
  if (!session?.user?.id) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permInteligencia)) return null;
  return dbUser;
}

function parseRegime(value: unknown): FinancialRegime {
  return value === 'cash' ? 'cash' : 'competence';
}

export async function getStrategyForecast(
  regime: FinancialRegime = 'competence',
  forceRefresh = false
): Promise<{ success: boolean; error?: string; data?: ForecastReport }> {
  try {
    const user = await requireIntelligenceUser();
    if (!user) return { success: false, error: 'Sem permissão para acessar previsões.' };
    if (forceRefresh) invalidateCache('strategy-forecast:');
    return { success: true, data: await getForecastReportCached(parseRegime(regime), forceRefresh) };
  } catch (error: any) {
    console.error('ERRO_STRATEGY_FORECAST:', error);
    return { success: false, error: error?.message || 'Falha ao gerar previsão.' };
  }
}

export async function getStrategyRecommendations(
  period: string,
  regime: FinancialRegime = 'competence',
  forceRefresh = false
): Promise<{ success: boolean; error?: string; data?: RecommendationsReport }> {
  try {
    const user = await requireIntelligenceUser();
    if (!user) return { success: false, error: 'Sem permissão para acessar recomendações.' };
    if (forceRefresh) invalidateCache('strategy-recommendations:');
    return { success: true, data: await getStrategicRecommendationsCached(period, parseRegime(regime), forceRefresh) };
  } catch (error: any) {
    console.error('ERRO_STRATEGY_RECOMMENDATIONS:', error);
    return { success: false, error: error?.message || 'Falha ao gerar recomendações.' };
  }
}

export async function simulateStrategyScenario(
  period: string,
  input: ScenarioInput
): Promise<{ success: boolean; error?: string; data?: ScenarioResult }> {
  try {
    const user = await requireIntelligenceUser();
    if (!user) return { success: false, error: 'Sem permissão para simular cenários.' };
    const clean: ScenarioInput = {
      rentalPriceChangePct: Math.max(-100, Math.min(200, Number(input.rentalPriceChangePct) || 0)),
      occupancyChangePp: Math.max(-100, Math.min(100, Number(input.occupancyChangePp) || 0)),
      productPriceChangePct: Math.max(-100, Math.min(200, Number(input.productPriceChangePct) || 0)),
      productCostChangePct: Math.max(-100, Math.min(200, Number(input.productCostChangePct) || 0)),
    };
    return { success: true, data: await getScenario(period, clean) };
  } catch (error: any) {
    console.error('ERRO_STRATEGY_SCENARIO:', error);
    return { success: false, error: error?.message || 'Falha ao simular cenário.' };
  }
}
