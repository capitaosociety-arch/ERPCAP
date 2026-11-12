'use server';

import { randomUUID } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { prisma } from '../../lib/prisma';
import { createAuditLog } from './audit';
import { invalidateCache } from '../../lib/intelligence-cache';
import {
  getRentalSchedule,
  validateSchedule,
  type RentalScheduleBlock,
  type RentalScheduleConfig,
} from '../../lib/rental-schedule';

async function requireReader() {
  const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
  if (!session?.user?.id) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || (dbUser.role !== 'ADMIN' && !dbUser.permInteligencia && !dbUser.permFinance)) return null;
  return dbUser;
}

export async function getRentalScheduleAction(): Promise<{
  success: boolean;
  error?: string;
  data?: RentalScheduleConfig;
  canEdit?: boolean;
  migrationPending?: boolean;
}> {
  const user = await requireReader();
  if (!user) return { success: false, error: 'Sem permissão para consultar a grade operacional.' };
  const data = await getRentalSchedule();
  return {
    success: true,
    data,
    canEdit: user.role === 'ADMIN',
    migrationPending: data.source === 'default',
  };
}

export async function saveRentalScheduleAction(
  entries: RentalScheduleBlock[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions) as { user?: { id?: string } } | null;
    if (!session?.user?.id) return { success: false, error: 'Não autenticado.' };
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user || user.role !== 'ADMIN') return { success: false, error: 'Apenas ADMIN pode editar a grade operacional.' };

    const clean = validateSchedule(entries);
    if (clean.length === 0) return { success: false, error: 'Informe ao menos uma faixa operacional válida.' };

    await prisma.$transaction(async tx => {
      await tx.rentalOperatingHour.deleteMany({});
      await tx.rentalOperatingHour.createMany({
        data: clean.map(e => ({
          id: randomUUID(),
          weekday: e.weekday,
          field: e.field,
          startMinute: e.startMinute,
          endMinute: e.endMinute,
          demandWeight: e.demandWeight,
          isActive: e.isActive,
        })),
      });
    });

    await createAuditLog(
      'Grade operacional de quadras',
      `Atualizou ${clean.length} faixa(s) regular(es) de quadras.`
    ).catch(() => {});
    invalidateCache('pricing-report:');
    invalidateCache('management-');
    invalidateCache('strategy-');

    return { success: true };
  } catch (error: any) {
    console.error('ERRO_SAVE_RENTAL_SCHEDULE:', error);
    return {
      success: false,
      error: 'Não foi possível salvar a grade. Verifique se a migração RentalOperatingHour foi aplicada em produção.',
    };
  }
}
