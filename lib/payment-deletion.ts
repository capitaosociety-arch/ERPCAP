export const PAYMENT_DELETION_REASON_MIN_LENGTH = 5;
export const PAYMENT_DELETION_ACTION = 'Exclusão de Pagamento';

export const PAYMENT_DELETION_NOT_FOUND_MESSAGE = 'Pagamento não encontrado.';
export const PAYMENT_DELETION_ALREADY_DELETED_MESSAGE = 'Este lançamento já foi excluído.';
export const PAYMENT_DELETION_REVERSAL_RECORD_MESSAGE =
  'Este registro é um estorno e não pode ser excluído por este fluxo.';
export const PAYMENT_DELETION_HAS_REVERSAL_MESSAGE =
  'Este pagamento possui estorno vinculado. Utilize o fluxo de estorno para regularizar.';
export const PAYMENT_DELETION_ORDER_CANCELED_MESSAGE =
  'Comanda cancelada não permite exclusão de pagamento.';
export const PAYMENT_DELETION_SESSION_NOT_OPEN_MESSAGE =
  'Sessão de caixa encerrada: pagamentos consolidados exigem estorno formal.';
export const PAYMENT_DELETION_PERIOD_CLOSED_MESSAGE =
  'Período financeiro fechado: não é permitido excluir pagamentos.';
export const PAYMENT_DELETION_REASON_REQUIRED_MESSAGE =
  `Informe o motivo da exclusão (mínimo de ${PAYMENT_DELETION_REASON_MIN_LENGTH} caracteres).`;
export const PAYMENT_DELETION_FALLBACK_MESSAGE =
  'Não foi possível excluir o pagamento. Tente novamente.';

export type PaymentDeletionCode =
  | 'NOT_FOUND'
  | 'ALREADY_DELETED'
  | 'REVERSAL_RECORD'
  | 'HAS_REVERSAL'
  | 'ORDER_CANCELED'
  | 'SESSION_NOT_OPEN'
  | 'PERIOD_CLOSED'
  | 'REASON_REQUIRED';

export type PaymentDeletionInput = {
  found: boolean;
  amount?: number | null;
  deletedAt?: string | Date | null;
  orderStatus?: string | null;
  sessionStatus?: string | null;
  hasReversal?: boolean;
  periodClosed?: boolean;
  reason?: string | null;
};

export type PaymentDeletionDecision =
  | { allowed: true }
  | { allowed: false; code: PaymentDeletionCode; message: string };

/**
 * Regra central de exclusão operacional de um lançamento de pagamento.
 *
 * A exclusão corrige um lançamento incorreto e NÃO é estorno: não devolve
 * estoque, não gera crédito ao cliente e não movimenta banco. Por isso exige
 * sessão de caixa aberta e período financeiro aberto. Pagamentos já
 * consolidados (sessão encerrada) e reversões exigem o fluxo formal de estorno.
 */
export function evaluatePaymentDeletion(input: PaymentDeletionInput): PaymentDeletionDecision {
  if (!input.found) {
    return { allowed: false, code: 'NOT_FOUND', message: PAYMENT_DELETION_NOT_FOUND_MESSAGE };
  }
  if (input.deletedAt) {
    return { allowed: false, code: 'ALREADY_DELETED', message: PAYMENT_DELETION_ALREADY_DELETED_MESSAGE };
  }
  if ((Number(input.amount) || 0) <= 0) {
    return { allowed: false, code: 'REVERSAL_RECORD', message: PAYMENT_DELETION_REVERSAL_RECORD_MESSAGE };
  }
  if (input.hasReversal) {
    return { allowed: false, code: 'HAS_REVERSAL', message: PAYMENT_DELETION_HAS_REVERSAL_MESSAGE };
  }
  if (String(input.orderStatus || '').toUpperCase() === 'CANCELED') {
    return { allowed: false, code: 'ORDER_CANCELED', message: PAYMENT_DELETION_ORDER_CANCELED_MESSAGE };
  }
  if (String(input.sessionStatus || '').toUpperCase() !== 'OPEN') {
    return { allowed: false, code: 'SESSION_NOT_OPEN', message: PAYMENT_DELETION_SESSION_NOT_OPEN_MESSAGE };
  }
  if (input.periodClosed) {
    return { allowed: false, code: 'PERIOD_CLOSED', message: PAYMENT_DELETION_PERIOD_CLOSED_MESSAGE };
  }
  const reason = String(input.reason || '').trim();
  if (reason.length < PAYMENT_DELETION_REASON_MIN_LENGTH) {
    return { allowed: false, code: 'REASON_REQUIRED', message: PAYMENT_DELETION_REASON_REQUIRED_MESSAGE };
  }
  return { allowed: true };
}

export function normalizePaymentDeletionReason(reason: unknown): string {
  return String(reason || '').trim();
}

export function isPaymentDeletionReasonValid(reason: unknown): boolean {
  return normalizePaymentDeletionReason(reason).length >= PAYMENT_DELETION_REASON_MIN_LENGTH;
}

export function isActivePayment(payment: { deletedAt?: string | Date | null } | null | undefined): boolean {
  return !!payment && !payment.deletedAt;
}
