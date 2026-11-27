import { prisma } from './prisma';
import {
  buildPaymentReversalLinks,
  parsePaymentVoidMarker,
  type PaymentDisplayRow,
  type PaymentReversalLink,
  type PaymentVoidMarker,
} from './payment-display';

export type PaymentDisplayData = {
  payments: PaymentDisplayRow[];
  links: PaymentReversalLink[];
};

/**
 * Carrega todos os pagamentos dos pedidos informados (inclusive de outras
 * sessões de caixa) e os marcadores reais de estorno. A leitura é somente
 * diagnóstica; nenhuma regra financeira é alterada.
 */
export async function loadPaymentDisplayData(orderIds: string[]): Promise<PaymentDisplayData> {
  const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)));
  if (uniqueOrderIds.length === 0) {
    return { payments: [], links: [] };
  }

  const payments = await prisma.payment.findMany({
    where: { orderId: { in: uniqueOrderIds } },
    select: {
      id: true,
      orderId: true,
      cashRegisterId: true,
      method: true,
      amount: true,
      date: true,
      userId: true,
    },
    orderBy: { date: 'asc' },
  });

  if (payments.length === 0) {
    return { payments: [], links: [] };
  }

  const markerRows = await prisma.auditLog.findMany({
    where: {
      action: 'PaymentVoidIdempotency',
      details: { in: payments.map((payment) => `payment-void:${payment.id}`) },
    },
    select: { details: true, userId: true, timestamp: true },
    orderBy: { timestamp: 'asc' },
  });

  const markers: PaymentVoidMarker[] = markerRows
    .map((row): PaymentVoidMarker | null => {
      const originalPaymentId = parsePaymentVoidMarker(row.details);
      if (!originalPaymentId) return null;
      return {
        originalPaymentId,
        actorUserId: row.userId,
        timestamp: row.timestamp,
      };
    })
    .filter((marker): marker is PaymentVoidMarker => marker !== null);

  return {
    payments,
    links: buildPaymentReversalLinks(payments, markers),
  };
}
