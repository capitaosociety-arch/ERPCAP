export type RentalLinkedOrderSnapshot = {
  id: string;
  status: string;
  openedAt?: string | Date | null;
  closedAt?: string | Date | null;
};

export type RentalDeletionSnapshot = {
  found: boolean;
  status: string;
  linkedOrders: RentalLinkedOrderSnapshot[];
  hasValidRemainingPayment: boolean;
  hasChangeLog: boolean;
  periodClosed: boolean;
};

export type RentalEditingSnapshot = {
  found: boolean;
  linkedOrders: RentalLinkedOrderSnapshot[];
  hasValidRemainingPayment: boolean;
};

export type RentalDeletionCode =
  | 'NOT_FOUND'
  | 'PAID'
  | 'ACTIVE_ORDER'
  | 'VALID_PAYMENT'
  | 'CHANGE_LOG'
  | 'CLOSED_PERIOD';

export type RentalEditingCode = 'NOT_FOUND' | 'ACTIVE_ORDER' | 'VALID_PAYMENT';

export type RentalDeletionDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: RentalDeletionCode;
      blockingOrderId?: string | null;
      blockingOrderStatus?: string | null;
    };

export type RentalEditingDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: RentalEditingCode;
      blockingOrderId?: string | null;
      blockingOrderStatus?: string | null;
    };

function firstNonCanceledOrder(linkedOrders: RentalLinkedOrderSnapshot[]) {
  return linkedOrders.find((order) => String(order.status || '').toUpperCase() !== 'CANCELED') || null;
}

/**
 * Regra central de exclusão operacional de reservas.
 * Vínculos com comandas CANCELED são históricos e não bloqueiam por si só.
 * Pagamento válido remanescente é verificado por vínculos reais de estorno
 * no servidor, não apenas por saldo líquido.
 */
export function evaluateRentalDeletion(input: RentalDeletionSnapshot): RentalDeletionDecision {
  if (!input.found) return { allowed: false, code: 'NOT_FOUND' };

  if (String(input.status || '').toUpperCase() === 'PAID') {
    return { allowed: false, code: 'PAID' };
  }

  const activeOrder = firstNonCanceledOrder(input.linkedOrders);
  if (activeOrder) {
    return {
      allowed: false,
      code: 'ACTIVE_ORDER',
      blockingOrderId: activeOrder.id,
      blockingOrderStatus: activeOrder.status,
    };
  }

  if (input.hasValidRemainingPayment) {
    const order = input.linkedOrders[0] || null;
    return {
      allowed: false,
      code: 'VALID_PAYMENT',
      blockingOrderId: order?.id || null,
      blockingOrderStatus: order?.status || null,
    };
  }

  if (input.hasChangeLog) {
    return { allowed: false, code: 'CHANGE_LOG' };
  }

  if (input.periodClosed) {
    return { allowed: false, code: 'CLOSED_PERIOD' };
  }

  return { allowed: true };
}

/**
 * Regra central para alterações do dossiê. Mantém o bloqueio de vínculos
 * efetivamente ativos e de pagamentos válidos, mas ignora comandas canceladas
 * já regularizadas.
 */
export function evaluateRentalEditing(input: RentalEditingSnapshot): RentalEditingDecision {
  if (!input.found) return { allowed: false, code: 'NOT_FOUND' };

  const activeOrder = firstNonCanceledOrder(input.linkedOrders);
  if (activeOrder) {
    return {
      allowed: false,
      code: 'ACTIVE_ORDER',
      blockingOrderId: activeOrder.id,
      blockingOrderStatus: activeOrder.status,
    };
  }

  if (input.hasValidRemainingPayment) {
    const order = input.linkedOrders[0] || null;
    return {
      allowed: false,
      code: 'VALID_PAYMENT',
      blockingOrderId: order?.id || null,
      blockingOrderStatus: order?.status || null,
    };
  }

  return { allowed: true };
}
