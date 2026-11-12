'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { prisma } from '../../lib/prisma';
import {
  getManagementComparisonCached,
  getManagementHistoryCached,
  type ManagementComparison,
  type ManagementHistory,
} from '../../lib/management-analytics';
import type { FinancialRegime } from '../../lib/official-financials';
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

export async function getManagementReport(
  endPeriod: string,
  months = 6,
  regime: FinancialRegime = 'competence',
  forceRefresh = false
): Promise<{ success: boolean; error?: string; data?: ManagementHistory }> {
  try {
    const user = await requireIntelligenceUser();
    if (!user) return { success: false, error: 'Sem permissão para acessar o histórico gerencial.' };
    if (forceRefresh) invalidateCache('management-history:');
    const data = await getManagementHistoryCached(endPeriod, months, parseRegime(regime), forceRefresh);
    return { success: true, data };
  } catch (error: any) {
    console.error('ERRO_MANAGEMENT_HISTORY:', error);
    return { success: false, error: error?.message || 'Falha ao carregar histórico gerencial.' };
  }
}

export async function getManagementComparisonAction(
  currentPeriod: string,
  previousPeriod: string,
  regime: FinancialRegime = 'competence',
  forceRefresh = false
): Promise<{ success: boolean; error?: string; data?: ManagementComparison }> {
  try {
    const user = await requireIntelligenceUser();
    if (!user) return { success: false, error: 'Sem permissão para acessar a comparação gerencial.' };
    if (forceRefresh) invalidateCache('management-comparison:');
    const data = await getManagementComparisonCached(currentPeriod, previousPeriod, parseRegime(regime), forceRefresh);
    return { success: true, data };
  } catch (error: any) {
    console.error('ERRO_MANAGEMENT_COMPARISON:', error);
    return { success: false, error: error?.message || 'Falha ao comparar períodos.' };
  }
}
