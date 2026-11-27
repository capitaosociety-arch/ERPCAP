import {
  buildDisplayedPayments,
  buildPaymentReversalLinks,
  parsePaymentVoidMarker,
  type PaymentDisplayRow,
  type PaymentVoidMarker,
} from './payment-display';
import {
  evaluateRentalDeletion,
  evaluateRentalEditing,
  type RentalDeletionDecision,
  type RentalEditingDecision,
  type RentalLinkedOrderSnapshot,
} from './rental-deletion';
import {
  APP_TIME_ZONE,
  formatCuiabaDateTime,
  formatDateKeyInZone,
  operationalRentalWindow,
} from './time-zone';

export type RentalCapabilityDecision =
  | { allowed: true; message: null }
  | { allowed: false; code: string; message: string };

export type RentalCapabilities = {
  deletion: RentalCapabilityDecision;
  editing: RentalCapabilityDecision;
  period: string | null;
  hasValidRemainingPayment: boolean;
  hasChangeLog: boolean;
  linkedOrderIds: string[];
};

type DbLike = {
  rental: { findMany: (args: any) => Promise<any[]> };
  payment: { findMany: (args: any) => Promise<any[]> };
  auditLog: { findMany: (args: any) => Promise<any[]> };
  financialPeriodClose: { findMany: (args: any) => Promise<any[]> };
};

function orderDescription(order: RentalLinkedOrderSnapshot | null): string {
  if (!order) return 'operação vinculada';
  const date = order.openedAt ? `, ${formatCuiabaDateTime(order.openedAt)}` : '';
  return `comanda [${order.id.slice(-6)}] (${order.status}${date})`;
}

function deletionMessage(
  rental: any,
  rentalLabel: string,
  decision: RentalDeletionDecision,
  linkedOrders: RentalLinkedOrderSnapshot[],
  period: string | null,
): string | null {
  if (decision.allowed) return null;
  const blockingOrder = decision.blockingOrderId
    ? linkedOrders.find((order) => order.id === decision.blockingOrderId) || null
    : null;
  const orderText = orderDescription(blockingOrder);

  switch (decision.code) {
    case 'PAID':
      return `A reserva ${rentalLabel} está marcada como PAGA e não pode ser excluída. Estorne/cancele o pagamento no módulo Financeiro e regularize a comanda antes de excluir a reserva.`;
    case 'ACTIVE_ORDER':
      return `A reserva ${rentalLabel} está vinculada à ${orderText} e não pode ser excluída. Cancele a comanda e estorne os pagamentos no módulo Comandas/PDV antes de excluir a reserva.`;
    case 'VALID_PAYMENT':
      return `A reserva ${rentalLabel} possui pagamento válido remanescente na ${orderText}. Estorne o valor no módulo Financeiro antes de excluir a reserva.`;
    case 'CHANGE_LOG':
      return `A reserva ${rentalLabel} possui histórico de correção administrativa (RentalChangeLog) e não pode ser excluída. Preserve o histórico e utilize a Agenda para correções administrativas.`;
    case 'CLOSED_PERIOD':
      return `A reserva ${rentalLabel} pertence ao período financeiro fechado ${period || 'consolidado'}. Reabra o período somente com autorização no módulo Financeiro antes de excluir a reserva.`;
    case 'NOT_FOUND':
    default:
      return `Reserva ${rental.resource || ''} não encontrada. Atualize a página e tente novamente.`;
  }
}

function editingMessage(
  rental: any,
  rentalLabel: string,
  decision: RentalEditingDecision,
  linkedOrders: RentalLinkedOrderSnapshot[],
): string | null {
  if (decision.allowed) return null;
  const blockingOrder = decision.blockingOrderId
    ? linkedOrders.find((order) => order.id === decision.blockingOrderId) || null
    : null;
  const orderText = orderDescription(blockingOrder);

  switch (decision.code) {
    case 'ACTIVE_ORDER':
      return `A reserva ${rentalLabel} está vinculada à ${orderText} e não pode ser alterada. Cancele a comanda e estorne os pagamentos no módulo Comandas/PDV antes de alterar a reserva.`;
    case 'VALID_PAYMENT':
      return `A reserva ${rentalLabel} possui pagamento válido remanescente na ${orderText}. Estorne o valor no módulo Financeiro antes de alterar a reserva.`;
    case 'NOT_FOUND':
    default:
      return `Reserva ${rental.resource || ''} não encontrada. Atualize a página e tente novamente.`;
  }
}

/**
 * Carrega a elegibilidade real de exclusão/edição para uma lista de reservas.
 * Pode receber tanto o cliente Prisma global quanto um TransactionClient.
 * Faz somente leitura.
 */
export async function loadRentalDeletionCapabilities(
  db: DbLike,
  rentalIds: string[],
): Promise<Map<string, RentalCapabilities>> {
  const ids = Array.from(new Set(rentalIds.filter(Boolean)));
  const result = new Map<string, RentalCapabilities>();
  if (ids.length === 0) return result;

  const rentals = await db.rental.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      resource: true,
      status: true,
      startTime: true,
      endTime: true,
      timeConvention: true,
      totalAmount: true,
      orderItems: {
        select: {
          id: true,
          status: true,
          orderId: true,
          order: {
            select: {
              id: true,
              status: true,
              openedAt: true,
              closedAt: true,
            },
          },
        },
      },
      changeLogs: {
        select: { id: true, requiresFinancialReview: true },
      },
    },
  });

  const orderIds = Array.from(new Set(
    rentals.flatMap((rental: any) =>
      (rental.orderItems || [])
        .map((item: any) => item.orderId)
        .filter((id: any): id is string => !!id)
    )
  ));

  const payments = orderIds.length > 0
    ? await db.payment.findMany({
        where: { orderId: { in: orderIds }, deletedAt: null },
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
      })
    : [];
  const markerDetails = (payments as any[]).map((payment) => `payment-void:${payment.id}`);

  const [markerRows, closedPeriodRows] = await Promise.all([
    markerDetails.length > 0
      ? db.auditLog.findMany({
          where: {
            action: 'PaymentVoidIdempotency',
            details: { in: markerDetails },
          },
          select: { details: true, userId: true, timestamp: true },
        })
      : Promise.resolve([]),
    db.financialPeriodClose.findMany({
      where: { status: 'CLOSED' },
      select: { period: true },
    }),
  ]);

  const markers: PaymentVoidMarker[] = (markerRows as any[])
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

  const paymentRows = payments as PaymentDisplayRow[];
  const links = buildPaymentReversalLinks(paymentRows, markers);
  const closedPeriods = new Set((closedPeriodRows as any[]).map((row) => String(row.period)));

  for (const rental of rentals as any[]) {
    const linkedOrders: RentalLinkedOrderSnapshot[] = Array.from(
      new Map(
        (rental.orderItems || [])
          .map((item: any) => item.order)
          .filter((order: any) => !!order)
          .map((order: any) => [
            order.id,
            {
              id: order.id,
              status: order.status,
              openedAt: order.openedAt,
              closedAt: order.closedAt,
            },
          ])
      ).values()
    ) as RentalLinkedOrderSnapshot[];

    const rentalOrderIds = new Set(linkedOrders.map((order) => order.id));
    const orderPayments = paymentRows.filter((payment) => rentalOrderIds.has(payment.orderId));
    const orderLinks = links.filter((link) => rentalOrderIds.has(link.orderId));
    const displayed = buildDisplayedPayments(orderPayments, orderLinks);
    const hasValidRemainingPayment = displayed.some(
      (payment) => Math.abs(Number(payment.amount) || 0) > 0.005
    );
    const hasChangeLog = (rental.changeLogs || []).length > 0;

    const window = operationalRentalWindow(
      rental.startTime,
      rental.endTime,
      rental.timeConvention,
    );
    const period = formatDateKeyInZone(window.startTime, APP_TIME_ZONE).slice(0, 7);
    const periodClosed = closedPeriods.has(period);
    const rentalLabel = `${rental.resource} em ${formatCuiabaDateTime(window.startTime)}`;

    const deletion = evaluateRentalDeletion({
      found: true,
      status: rental.status,
      linkedOrders,
      hasValidRemainingPayment,
      hasChangeLog,
      periodClosed,
    });
    const editing = evaluateRentalEditing({
      found: true,
      linkedOrders,
      hasValidRemainingPayment,
    });

    result.set(rental.id, {
      deletion: deletion.allowed
        ? { allowed: true, message: null }
        : {
            allowed: false,
            code: deletion.code,
            message: deletionMessage(rental, rentalLabel, deletion, linkedOrders, period) || 'Reserva bloqueada.',
          },
      editing: editing.allowed
        ? { allowed: true, message: null }
        : {
            allowed: false,
            code: editing.code,
            message: editingMessage(rental, rentalLabel, editing, linkedOrders) || 'Reserva bloqueada.',
          },
      period,
      hasValidRemainingPayment,
      hasChangeLog,
      linkedOrderIds: Array.from(rentalOrderIds),
    });
  }

  for (const id of ids) {
    if (!result.has(id)) {
      result.set(id, {
        deletion: { allowed: false, code: 'NOT_FOUND', message: 'Reserva não encontrada.' },
        editing: { allowed: false, code: 'NOT_FOUND', message: 'Reserva não encontrada.' },
        period: null,
        hasValidRemainingPayment: false,
        hasChangeLog: false,
        linkedOrderIds: [],
      });
    }
  }

  return result;
}
