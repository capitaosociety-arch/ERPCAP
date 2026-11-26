export const CASH_SESSION_CANCEL_REASON_REQUIRED =
  'Informe o motivo do cancelamento da sessão de caixa.';
export const CASH_SESSION_OPEN_CANNOT_CANCEL =
  'Feche o caixa antes de cancelar a sessão.';
export const CASH_SESSION_HAS_PAYMENTS =
  'Esta sessão possui pagamentos registrados e não pode ser cancelada. Preserve os registros financeiros.';
export const CASH_SESSION_HAS_DEPOSITS =
  'Esta sessão possui depósitos registrados e não pode ser cancelada.';
export const CASH_SESSION_CANCEL_FALLBACK =
  'Não foi possível cancelar a sessão de caixa. Tente novamente.';

export type CashSessionCancellationInput = {
  status?: string | null;
  paymentsCount?: number | null;
  depositsCount?: number | null;
  reason?: string | null;
};

export type CashSessionCancellationDecision =
  | { allowed: true; alreadyCanceled: boolean }
  | { allowed: false; error: string };

export function evaluateCashSessionCancellation(
  input: CashSessionCancellationInput,
): CashSessionCancellationDecision {
  if (input.status === 'CANCELED') {
    return { allowed: true, alreadyCanceled: true };
  }
  if (!input.reason || input.reason.trim().length < 5) {
    return { allowed: false, error: CASH_SESSION_CANCEL_REASON_REQUIRED };
  }
  if (input.status !== 'CLOSED') {
    return { allowed: false, error: CASH_SESSION_OPEN_CANNOT_CANCEL };
  }
  if ((Number(input.paymentsCount) || 0) > 0) {
    return { allowed: false, error: CASH_SESSION_HAS_PAYMENTS };
  }
  if ((Number(input.depositsCount) || 0) > 0) {
    return { allowed: false, error: CASH_SESSION_HAS_DEPOSITS };
  }
  return { allowed: true, alreadyCanceled: false };
}
