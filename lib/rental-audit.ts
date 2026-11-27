import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  detectRentalAuditOccurrences,
  RENTAL_AUDIT_MAX_ORDER_ITEMS,
  RENTAL_AUDIT_MAX_RENTALS,
  type AuditDetectionInput,
  type AuditLinkedItem,
  type AuditOccurrenceCandidate,
  type AuditOrder,
  type AuditPreviousRun,
  type AuditRental,
} from './rental-audit-rules';

export type AuditTrigger = 'MANUAL' | 'CRON';

export class RentalAuditBusyError extends Error {
  constructor() {
    super('Já existe uma auditoria de reservas em execução. Aguarde a conclusão.');
    this.name = 'RentalAuditBusyError';
  }
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function mapOrder(order: {
  id: string;
  status: string;
  total: number;
  discount: number;
  notes: string | null;
  openedAt: Date;
  closedAt: Date | null;
  customerId: string | null;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    date: Date;
    cashRegisterId: string;
    cashRegister: { id: string; status: string; openedAt: Date; closedAt: Date | null } | null;
  }>;
  items: Array<{
    id: string;
    subtotal: number;
    rentalId: string | null;
    product: { name: string } | null;
    service: { name: string } | null;
  }>;
}): AuditOrder {
  return {
    id: order.id,
    status: order.status,
    total: order.total,
    discount: order.discount,
    notes: order.notes,
    openedAt: order.openedAt.toISOString(),
    closedAt: iso(order.closedAt),
    customerId: order.customerId,
    payments: order.payments.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      date: payment.date.toISOString(),
      cashRegisterId: payment.cashRegisterId,
      cashRegister: payment.cashRegister
        ? {
            id: payment.cashRegister.id,
            status: payment.cashRegister.status,
            openedAt: payment.cashRegister.openedAt.toISOString(),
            closedAt: iso(payment.cashRegister.closedAt),
          }
        : null,
    })),
    items: order.items.map(item => ({
      id: item.id,
      subtotal: item.subtotal,
      rentalId: item.rentalId,
      productName: item.product?.name ?? null,
      serviceName: item.service?.name ?? null,
    })),
  };
}

export async function loadRentalAuditData(
  tx: Prisma.TransactionClient,
  previousRun: AuditPreviousRun | null
): Promise<AuditDetectionInput> {
  const rentalRows = await tx.rental.findMany({
    take: RENTAL_AUDIT_MAX_RENTALS + 1,
    select: {
      id: true,
      customerId: true,
      resource: true,
      startTime: true,
      endTime: true,
      totalAmount: true,
      status: true,
      source: true,
      timeConvention: true,
      cancelledAt: true,
      createdAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          subscription: { select: { isActive: true } },
        },
      },
      orderItems: {
        select: {
          id: true,
          orderId: true,
          status: true,
          subtotal: true,
          quantity: true,
          unitPrice: true,
          rentalId: true,
          product: { select: { name: true } },
          service: { select: { name: true } },
          order: {
            select: {
              id: true,
              status: true,
              total: true,
              discount: true,
              notes: true,
              openedAt: true,
              closedAt: true,
              customerId: true,
              payments: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  amount: true,
                  method: true,
                  date: true,
                  cashRegisterId: true,
                  cashRegister: { select: { id: true, status: true, openedAt: true, closedAt: true } },
                },
              },
              items: {
                select: {
                  id: true,
                  subtotal: true,
                  rentalId: true,
                  product: { select: { name: true } },
                  service: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (rentalRows.length > RENTAL_AUDIT_MAX_RENTALS) {
    throw new Error(`Auditoria excedeu o limite de ${RENTAL_AUDIT_MAX_RENTALS} reservas.`);
  }

  const orderCache = new Map<string, AuditOrder>();
  const rentals: AuditRental[] = rentalRows.map(rental => ({
    id: rental.id,
    customerId: rental.customerId,
    customerName: rental.customer?.name || '',
    isSubscriber: rental.customer?.subscription?.isActive === true,
    resource: rental.resource,
    startTime: rental.startTime,
    endTime: rental.endTime,
    totalAmount: rental.totalAmount,
    status: rental.status,
    source: rental.source,
    timeConvention: rental.timeConvention,
    cancelledAt: rental.cancelledAt,
    createdAt: rental.createdAt,
    orderItems: rental.orderItems
      .filter(item => item.rentalId === rental.id)
      .map((item): AuditLinkedItem => {
        let order = orderCache.get(item.order.id);
        if (!order) {
          order = mapOrder(item.order);
          orderCache.set(item.order.id, order);
        }
        return {
          id: item.id,
          orderId: item.orderId,
          status: item.status,
          subtotal: item.subtotal,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          rentalId: rental.id,
          productName: item.product?.name ?? null,
          serviceName: item.service?.name ?? null,
          order,
        };
      }),
  }));

  const unlinkedRows = await tx.orderItem.findMany({
    where: {
      rentalId: null,
      status: 'ACTIVE',
      order: { is: { status: { not: 'CANCELED' } } },
    },
    take: RENTAL_AUDIT_MAX_ORDER_ITEMS + 1,
    select: {
      id: true,
      orderId: true,
      quantity: true,
      subtotal: true,
      product: { select: { name: true } },
      service: { select: { name: true } },
      order: {
        select: {
          id: true,
          status: true,
          openedAt: true,
          customerId: true,
          customer: { select: { name: true } },
        },
      },
    },
  });

  if (unlinkedRows.length > RENTAL_AUDIT_MAX_ORDER_ITEMS) {
    throw new Error(`Auditoria excedeu o limite de ${RENTAL_AUDIT_MAX_ORDER_ITEMS} itens de comanda.`);
  }

  const changeLogs = await tx.rentalChangeLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 2000,
    select: {
      id: true,
      rentalId: true,
      orderId: true,
      changedByName: true,
      reason: true,
      beforeData: true,
      afterData: true,
      changedFields: true,
      requiresFinancialReview: true,
      financialDifference: true,
      createdAt: true,
      rental: {
        select: {
          id: true,
          customerId: true,
          resource: true,
          startTime: true,
          endTime: true,
          status: true,
          timeConvention: true,
          customer: { select: { name: true } },
        },
      },
    },
  });

  const auditLogSince = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const auditLogs = await tx.auditLog.findMany({
    where: {
      timestamp: { gte: auditLogSince },
      OR: [
        { action: { contains: 'Reserva', mode: 'insensitive' } },
        { action: { contains: 'Aluguel', mode: 'insensitive' } },
        { details: { contains: 'reserva', mode: 'insensitive' } },
        { details: { contains: 'aluguel', mode: 'insensitive' } },
      ],
    },
    orderBy: { timestamp: 'desc' },
    take: 5000,
    select: { id: true, action: true, details: true, timestamp: true, userId: true },
  });

  const orphanLinks = await tx.$queryRaw<Array<{ id: string; orderId: string; rentalId: string; status: string }>>`
    SELECT oi.id, oi."orderId", oi."rentalId", oi.status
    FROM "OrderItem" oi
    LEFT JOIN "Rental" r ON r.id = oi."rentalId"
    WHERE oi."rentalId" IS NOT NULL AND r.id IS NULL
    LIMIT 1000
  `;

  return {
    rentals,
    unlinkedRentalItems: unlinkedRows.map(item => ({
      id: item.id,
      orderId: item.orderId,
      quantity: item.quantity,
      subtotal: item.subtotal,
      productName: item.product?.name ?? null,
      serviceName: item.service?.name ?? null,
      order: {
        id: item.order.id,
        status: item.order.status,
        openedAt: item.order.openedAt.toISOString(),
        customerId: item.order.customerId,
        customerName: item.order.customer?.name ?? null,
      },
    })),
    changeLogs: changeLogs.map(log => ({
      id: log.id,
      rentalId: log.rentalId,
      orderId: log.orderId,
      changedByName: log.changedByName,
      reason: log.reason,
      beforeData: log.beforeData,
      afterData: log.afterData,
      changedFields: log.changedFields,
      requiresFinancialReview: log.requiresFinancialReview,
      financialDifference: log.financialDifference,
      createdAt: log.createdAt,
      rental: log.rental
        ? {
            id: log.rental.id,
            customerId: log.rental.customerId,
            customerName: log.rental.customer?.name ?? null,
            resource: log.rental.resource,
            startTime: log.rental.startTime,
            endTime: log.rental.endTime,
            status: log.rental.status,
            timeConvention: log.rental.timeConvention,
          }
        : null,
    })),
    auditLogs,
    orphanLinks,
    previousRun,
  };
}

async function persistAuditRun(
  tx: Prisma.TransactionClient,
  runId: string,
  startedAt: Date,
  detection: ReturnType<typeof detectRentalAuditOccurrences>
): Promise<{ occurrencesCleared: number }> {
  const existing = await tx.rentalAuditOccurrence.findMany({
    select: { id: true, fingerprint: true, status: true, technicalStatus: true },
  });
  const activeExisting = existing.filter(item => item.technicalStatus === 'ACTIVE');
  const existingByFingerprint = new Map(existing.map(item => [item.fingerprint, item]));
  const detected = new Set<string>();

  for (const occurrence of detection.occurrences) {
    detected.add(occurrence.fingerprint);
    const current = existingByFingerprint.get(occurrence.fingerprint);
    const evidence = occurrence.evidence
      ? (occurrence.evidence as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    if (!current) {
      const created = await tx.rentalAuditOccurrence.create({
        data: {
          fingerprint: occurrence.fingerprint,
          type: occurrence.type,
          severity: occurrence.severity,
          entityType: occurrence.entityType,
          entityId: occurrence.entityId,
          orderId: occurrence.orderId ?? null,
          rentalId: occurrence.rentalId ?? null,
          customerId: occurrence.customerId ?? null,
          customerName: occurrence.customerName ?? null,
          resource: occurrence.resource ?? null,
          rentalStartTime: occurrence.rentalStartTime ?? null,
          rentalEndTime: occurrence.rentalEndTime ?? null,
          title: occurrence.title,
          details: occurrence.details,
          evidence,
          status: 'OPEN',
          technicalStatus: 'ACTIVE',
          firstSeenAt: startedAt,
          lastSeenAt: startedAt,
          occurrenceCount: 1,
          lastRunId: runId,
        },
      });
      await tx.rentalAuditEvent.create({
        data: {
          occurrenceId: created.id,
          runId,
          action: 'DETECTED',
          note: 'Primeira detecção.',
        },
      });
      continue;
    }

    const reopened = current.technicalStatus === 'CLEARED';
    const updateData: Prisma.RentalAuditOccurrenceUncheckedUpdateInput = {
      type: occurrence.type,
      severity: occurrence.severity,
      entityType: occurrence.entityType,
      entityId: occurrence.entityId,
      orderId: occurrence.orderId ?? null,
      rentalId: occurrence.rentalId ?? null,
      customerId: occurrence.customerId ?? null,
      customerName: occurrence.customerName ?? null,
      resource: occurrence.resource ?? null,
      rentalStartTime: occurrence.rentalStartTime ?? null,
      rentalEndTime: occurrence.rentalEndTime ?? null,
      title: occurrence.title,
      details: occurrence.details,
      evidence,
      technicalStatus: 'ACTIVE',
      clearedAt: null,
      clearedRunId: null,
      lastSeenAt: startedAt,
      lastRunId: runId,
      occurrenceCount: { increment: 1 },
    };

    if (reopened && current.status === 'RESOLVED') {
      updateData.status = 'OPEN';
      updateData.resolvedAt = null;
      updateData.resolvedByUserId = null;
      updateData.resolvedByName = null;
      updateData.resolutionNote = null;
    }

    await tx.rentalAuditOccurrence.update({ where: { id: current.id }, data: updateData });

    if (reopened) {
      await tx.rentalAuditEvent.create({
        data: {
          occurrenceId: current.id,
          runId,
          action: 'REOPENED',
          note: 'Inconsistência voltou a ser detectada após eliminação técnica.',
        },
      });
    }
  }

  let occurrencesCleared = 0;
  for (const current of activeExisting) {
    if (detected.has(current.fingerprint)) continue;
    await tx.rentalAuditOccurrence.update({
      where: { id: current.id },
      data: {
        technicalStatus: 'CLEARED',
        clearedAt: startedAt,
        clearedRunId: runId,
      },
    });
    await tx.rentalAuditEvent.create({
      data: {
        occurrenceId: current.id,
        runId,
        action: 'CLEARED',
        note: 'Não detectada nesta execução.',
      },
    });
    occurrencesCleared += 1;
  }

  const bySeverity: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const occurrence of detection.occurrences) {
    bySeverity[occurrence.severity] = (bySeverity[occurrence.severity] || 0) + 1;
    byType[occurrence.type] = (byType[occurrence.type] || 0) + 1;
  }

  const summary = JSON.stringify({
    totalDetected: detection.occurrences.length,
    occurrencesCleared,
    totalRentals: detection.totalRentals,
    totalLinkedItems: detection.totalLinkedItems,
    checksRun: detection.checksRun,
    bySeverity,
    byType,
    durationMs: Date.now() - startedAt.getTime(),
  });

  await tx.rentalAuditRun.update({
    where: { id: runId },
    data: {
      status: 'SUCCESS',
      finishedAt: new Date(),
      totalRentals: detection.totalRentals,
      totalLinkedItems: detection.totalLinkedItems,
      checksRun: detection.checksRun,
      occurrencesFound: detection.occurrences.length,
      occurrencesCleared,
      summary,
    },
  });

  return { occurrencesCleared };
}

export async function runRentalAudit(trigger: AuditTrigger = 'MANUAL') {
  const startedAt = new Date();

  try {
    return await prisma.$transaction(async tx => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtext('erpcap:rental-audit:v2')) AS locked
      `;
      if (!lock[0]?.locked) throw new RentalAuditBusyError();

      const previous = await tx.rentalAuditRun.findFirst({
        where: { status: 'SUCCESS' },
        orderBy: { startedAt: 'desc' },
        select: { id: true, totalRentals: true, startedAt: true },
      });
      const previousRun: AuditPreviousRun | null = previous
        ? { id: previous.id, totalRentals: previous.totalRentals, startedAt: previous.startedAt }
        : null;

      const run = await tx.rentalAuditRun.create({
        data: {
          status: 'RUNNING',
          trigger,
          windowTo: startedAt,
        },
      });

      const input = await loadRentalAuditData(tx, previousRun);
      const detection = detectRentalAuditOccurrences(input);
      const persisted = await persistAuditRun(tx, run.id, startedAt, detection);

      return {
        runId: run.id,
        trigger,
        checksRun: detection.checksRun,
        occurrencesFound: detection.occurrences.length,
        occurrencesCleared: persisted.occurrencesCleared,
        totalRentals: detection.totalRentals,
        totalLinkedItems: detection.totalLinkedItems,
      };
    }, { maxWait: 15000, timeout: 120000 });
  } catch (error) {
    if (error instanceof RentalAuditBusyError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    await prisma.rentalAuditRun.create({
      data: {
        status: 'ERROR',
        trigger,
        finishedAt: new Date(),
        error: message.slice(0, 4000),
      },
    }).catch(() => {});
    throw error;
  }
}

export { sortOccurrencesBySeverity, severityRank } from './rental-audit-rules';
export type { AuditOccurrenceCandidate };
