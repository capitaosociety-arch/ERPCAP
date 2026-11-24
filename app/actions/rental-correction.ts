'use server';

import { prisma } from '../../lib/prisma';
import { requirePermission, requireUser } from '../../lib/auth-guard';
import { createAuditLog } from './audit';
import { invalidateOperationalCaches } from '../../lib/intelligence-cache';
import { revalidatePath } from 'next/cache';
import { formatRentalPeriod } from '../../lib/rental-time';
import { findOperationalConflict, operationalInterval } from '../../lib/rental-conflicts';
import { NEW_RENTAL_TIME_CONVENTION, normalizeRentalTimeConvention, type RentalTimeConvention } from '../../lib/time-zone';
import {
  buildRentalCorrectionWindow,
  buildRentalSnapshot,
  diffRentalSnapshots,
  normalizeRentalCorrectionReason,
  type RentalChangeLogView,
  type RentalSnapshot,
} from '../../lib/rental-corrections';

export type CorrectRentalResult =
  | { success: true; log: RentalChangeLogView }
  | { success: false; error: string };

export async function correctRentalScheduleAction(input: {
  rentalId: string;
  date: string;
  start: string;
  end: string;
  field: string;
  reason: string;
  convertToCuiaba?: boolean;
}): Promise<CorrectRentalResult> {
  try {
    const user = await requireUser();
    if (user.role !== 'ADMIN') {
      return { success: false, error: 'Apenas administradores podem corrigir reservas.' };
    }

    const rentalId = String(input.rentalId || '').trim();
    if (!rentalId) return { success: false, error: 'Reserva inválida.' };
    const reason = normalizeRentalCorrectionReason(input.reason);

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.rental.findUnique({
        where: { id: rentalId },
        include: {
          orderItems: {
            where: { status: 'ACTIVE' },
            select: { id: true, orderId: true },
          },
        },
      });
      if (!current) throw new Error('Reserva não encontrada.');
      const currentConvention = normalizeRentalTimeConvention(current.timeConvention);
      const targetConvention: RentalTimeConvention = input.convertToCuiaba
        ? NEW_RENTAL_TIME_CONVENTION
        : currentConvention;
      const window = buildRentalCorrectionWindow(input, targetConvention);
      if (current.orderItems.length > 1) {
        throw new Error('A reserva possui múltiplos vínculos ativos. Corrija os vínculos antes de alterar horário ou campo.');
      }

      const orderId = current.orderItems[0]?.orderId || null;
      const lockResources = Array.from(new Set([
        String(current.resource || '').trim().toLowerCase(),
        window.field.toLowerCase(),
      ].filter(Boolean))).sort();
      for (const resource of lockResources) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${resource}))::text`;
      }

      const candidateFrom = new Date(window.startTime.getTime() - 2 * 60 * 60 * 1000);
      const candidateTo = new Date(window.endTime.getTime() + 2 * 60 * 60 * 1000);
      const candidates = await tx.rental.findMany({
        where: {
          id: { not: rentalId },
          resource: window.field,
          startTime: { lt: candidateTo },
          endTime: { gt: candidateFrom },
        },
        select: { id: true, resource: true, startTime: true, endTime: true, status: true, timeConvention: true },
      });
      const conflict = findOperationalConflict(candidates, {
        resource: window.field,
        startTime: window.startTime,
        endTime: window.endTime,
        timeConvention: targetConvention,
      });
      if (conflict) {
        const interval = operationalInterval(conflict);
        throw new Error(`Horário indisponível para ${window.field}: ${formatRentalPeriod(interval.startTime, interval.endTime, 'CUIABA')}.`);
      }

      const before = buildRentalSnapshot({
        id: current.id,
        customerId: current.customerId,
        orderId,
        resource: current.resource,
        startTime: current.startTime,
        endTime: current.endTime,
        totalAmount: current.totalAmount,
        status: current.status,
        source: current.source,
        timeConvention: currentConvention,
      });

      const updated = await tx.rental.update({
        where: { id: rentalId },
        data: {
          resource: window.field,
          startTime: window.startTime,
          endTime: window.endTime,
          timeConvention: targetConvention,
        },
      });

      const after = buildRentalSnapshot({
        id: updated.id,
        customerId: updated.customerId,
        orderId,
        resource: updated.resource,
        startTime: updated.startTime,
        endTime: updated.endTime,
        totalAmount: updated.totalAmount,
        status: updated.status,
        source: updated.source,
        timeConvention: targetConvention,
      });
      const diff = diffRentalSnapshots(before, after);
      if (diff.changedFields.length === 0) throw new Error('Nenhuma alteração operacional foi informada.');

      const log = await tx.rentalChangeLog.create({
        data: {
          rentalId,
          orderId,
          changedByUserId: user.id,
          changedByName: user.name,
          reason,
          beforeData: before as any,
          afterData: after as any,
          changedFields: diff.changedFields,
          requiresFinancialReview: diff.requiresFinancialReview,
          financialDifference: null,
        },
      });

      return { log, before, after };
    }, { timeout: 15000 });

    await createAuditLog(
      'Correção de Reserva',
      `Corrigiu a reserva ${rentalId}: ${result.before.date} ${result.before.start}-${result.before.end} ${result.before.resource} (${result.before.timeConvention}) para ${result.after.date} ${result.after.start}-${result.after.end} ${result.after.resource} (${result.after.timeConvention}). Justificativa: ${reason}`
    ).catch(() => {});

    invalidateOperationalCaches();
    revalidatePath('/agenda');
    revalidatePath('/dashboard');
    revalidatePath('/inteligencia');
    revalidatePath('/clientes');

    return {
      success: true,
      log: {
        id: result.log.id,
        rentalId: result.log.rentalId,
        orderId: result.log.orderId,
        changedByName: result.log.changedByName,
        reason: result.log.reason,
        beforeData: result.before,
        afterData: result.after,
        changedFields: result.log.changedFields,
        requiresFinancialReview: result.log.requiresFinancialReview,
        financialDifference: result.log.financialDifference,
        createdAt: result.log.createdAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error('ERRO_CORRIGIR_RESERVA:', error);
    return { success: false, error: error?.message || 'Não foi possível corrigir a reserva.' };
  }
}

export async function getRentalChangeLogsAction(rentalId: string): Promise<{
  success: true;
  logs: RentalChangeLogView[];
} | {
  success: false;
  error: string;
}> {
  try {
    await requirePermission('permAgenda');
    const id = String(rentalId || '').trim();
    if (!id) return { success: false, error: 'Reserva inválida.' };

    const logs = await prisma.rentalChangeLog.findMany({
      where: { rentalId: id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      logs: logs.map((log) => ({
        id: log.id,
        rentalId: log.rentalId,
        orderId: log.orderId,
        changedByName: log.changedByName,
        reason: log.reason,
        beforeData: log.beforeData as unknown as RentalSnapshot,
        afterData: log.afterData as unknown as RentalSnapshot,
        changedFields: log.changedFields,
        requiresFinancialReview: log.requiresFinancialReview,
        financialDifference: log.financialDifference,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  } catch (error: any) {
    console.error('ERRO_HISTORICO_CORRECAO_RESERVA:', error);
    return { success: false, error: error?.message || 'Não foi possível carregar o histórico.' };
  }
}
