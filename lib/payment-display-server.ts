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
 * sessões de caixa, excluídos logicamente e marcadores reais de estorno).
 * A leitura é somente diagnóstica; nenhuma regra financeira é alterada.
 * Consumidores operacionais devem usar `buildDisplayedPayments`, que ignora
 * os excluídos. A trilha de exclusão fica disponível em `payments` para a
 * auditoria administrativa.
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
      deletedAt: true,
      deletedByUserId: true,
      deletionReason: true,
      deletedBy: { select: { name: true } },
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

  const paymentRows: PaymentDisplayRow[] = payments.map((payment) => ({
    id: payment.id,
    orderId: payment.orderId,
    cashRegisterId: payment.cashRegisterId,
    method: payment.method,
    amount: payment.amount,
    date: payment.date,
    userId: payment.userId,
    deletedAt: payment.deletedAt,
    deletedByUserId: payment.deletedByUserId,
    deletedByName: payment.deletedBy?.name || null,
    deletionReason: payment.deletionReason,
  }));

  return {
    payments: paymentRows,
    links: buildPaymentReversalLinks(paymentRows, markers),
  };
}
