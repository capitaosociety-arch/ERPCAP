export type PaymentDisplayRow = {
  id: string;
  orderId: string;
  cashRegisterId?: string | null;
  method: string;
  amount: number;
  date: string | Date;
  userId?: string | null;
};

export type PaymentVoidMarker = {
  originalPaymentId: string;
  actorUserId?: string | null;
  timestamp: string | Date;
};

export type PaymentReversalLink = {
  orderId: string;
  originalPaymentId: string;
  reversalPaymentIds: string[];
  originalAmount: number;
  reversedAmount: number;
  netAmount: number;
  fullyReversed: boolean;
  partiallyReversed: boolean;
  overReversed: boolean;
  sessionIds: string[];
  hasCrossSession: boolean;
};

export type DisplayedPayment = {
  id: string;
  orderId: string;
  paymentIds: string[];
  method: string;
  amount: number;
  originalAmount: number;
  reversedAmount: number;
  date: string | Date;
  status: 'VALID' | 'PARTIALLY_REVERSED' | 'OVER_REVERSED' | 'UNLINKED_REVERSAL';
  canVoid: boolean;
  sessionIds: string[];
  hasCrossSession: boolean;
};

const PAYMENT_VOID_MARKER_PREFIX = 'payment-void:';
const MATCH_WINDOW_MS = 120_000;
const MONEY_EPSILON = 0.005;

export function parsePaymentVoidMarker(details: string | null | undefined): string | null {
  if (!details) return null;
  const normalized = details.trim();
  if (!normalized.startsWith(PAYMENT_VOID_MARKER_PREFIX)) return null;
  const id = normalized.slice(PAYMENT_VOID_MARKER_PREFIX.length).trim();
  return id || null;
}

export function paymentMethodLabel(method: string): string {
  const normalized = String(method || '').trim().toUpperCase();
  const labels: Record<string, string> = {
    CASH: 'Dinheiro',
    PIX: 'PIX',
    CREDIT: 'Crédito',
    DEBIT: 'Débito',
  };
  return labels[normalized] || normalized || 'Pagamento';
}

function toMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function roundMoney(value: number): number {
  return Number((Number(value) || 0).toFixed(2));
}

function withinWindow(paymentDate: string | Date, markerTimestamp: string | Date): boolean {
  const paymentMs = toMs(paymentDate);
  const markerMs = toMs(markerTimestamp);
  if (!Number.isFinite(paymentMs) || !Number.isFinite(markerMs)) return false;
  return Math.abs(markerMs - paymentMs) <= MATCH_WINDOW_MS;
}

function uniqueSessionIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value)));
}

/**
 * Liga cada marcador persistente `PaymentVoidIdempotency` ao pagamento negativo
 * criado na mesma operação. A ligação usa o ID original, o ator e a janela
 * temporal da transação; não usa apenas igualdade de valor/método.
 * Casos ambíguos ou legados sem marcador permanecem sem vínculo e visíveis.
 */
export function buildPaymentReversalLinks(
  payments: PaymentDisplayRow[],
  markers: PaymentVoidMarker[],
): PaymentReversalLink[] {
  const byId = new Map(payments.map((payment) => [payment.id, payment]));
  const markersByOriginal = new Map<string, PaymentVoidMarker[]>();

  for (const marker of markers) {
    if (!marker.originalPaymentId || !byId.has(marker.originalPaymentId)) continue;
    const current = markersByOriginal.get(marker.originalPaymentId) || [];
    current.push(marker);
    markersByOriginal.set(marker.originalPaymentId, current);
  }

  const usedReversals = new Set<string>();
  const links: PaymentReversalLink[] = [];

  for (const [originalPaymentId, originalMarkers] of markersByOriginal) {
    const original = byId.get(originalPaymentId);
    if (!original || original.amount <= 0) continue;

    const sortedMarkers = [...originalMarkers].sort((a, b) => toMs(a.timestamp) - toMs(b.timestamp));
    const linkedReversalIds: string[] = [];
    let ambiguous = false;

    for (const marker of sortedMarkers) {
      const candidates = payments
        .filter((payment) => {
          if (payment.amount >= 0) return false;
          if (payment.orderId !== original.orderId) return false;
          if (payment.method !== original.method) return false;
          if (usedReversals.has(payment.id)) return false;
          if (String(payment.userId || '') !== String(marker.actorUserId || '')) return false;
          if (!withinWindow(payment.date, marker.timestamp)) return false;
          return Math.abs(Number(payment.amount)) <= Math.abs(Number(original.amount)) + MONEY_EPSILON;
        })
        .map((payment) => ({
          payment,
          distance: Math.abs(toMs(marker.timestamp) - toMs(payment.date)),
        }));

      if (candidates.length === 0) {
        ambiguous = true;
        continue;
      }

      const closestDistance = Math.min(...candidates.map((candidate) => candidate.distance));
      const closest = candidates.filter((candidate) => candidate.distance - closestDistance < 1);
      if (closest.length !== 1) {
        ambiguous = true;
        continue;
      }

      const chosen = closest[0].payment;
      linkedReversalIds.push(chosen.id);
      usedReversals.add(chosen.id);
    }

    if (ambiguous || linkedReversalIds.length === 0) {
      // Sem vínculo seguro: preserva os registros na visualização.
      continue;
    }

    const reversals = linkedReversalIds
      .map((id) => byId.get(id))
      .filter((payment): payment is PaymentDisplayRow => !!payment);
    const reversedAmount = roundMoney(
      reversals.reduce((sum, payment) => sum + Math.abs(Number(payment.amount) || 0), 0),
    );
    const netAmount = roundMoney(Number(original.amount) - reversedAmount);
    const sessionIds = uniqueSessionIds([
      original.cashRegisterId,
      ...reversals.map((payment) => payment.cashRegisterId),
    ]);

    links.push({
      orderId: original.orderId,
      originalPaymentId: original.id,
      reversalPaymentIds: linkedReversalIds,
      originalAmount: roundMoney(Number(original.amount)),
      reversedAmount,
      netAmount,
      fullyReversed: Math.abs(netAmount) <= MONEY_EPSILON,
      partiallyReversed: netAmount > MONEY_EPSILON,
      overReversed: netAmount < -MONEY_EPSILON,
      sessionIds,
      hasCrossSession: sessionIds.length > 1,
    });
  }

  return links;
}

/**
 * Gera a lista operacional padrão: pagamentos válidos e saldos líquidos.
 * Pares integralmente estornados são omitidos. Estornos ambíguos/legados
 * permanecem visíveis como UNLINKED_REVERSAL.
 */
export function buildDisplayedPayments(
  payments: PaymentDisplayRow[],
  links: PaymentReversalLink[],
): DisplayedPayment[] {
  const linkByOriginal = new Map(links.map((link) => [link.originalPaymentId, link]));
  const linkedReversalIds = new Set(links.flatMap((link) => link.reversalPaymentIds));
  const displayed: DisplayedPayment[] = [];

  for (const payment of payments) {
    if (linkedReversalIds.has(payment.id)) continue;

    const link = linkByOriginal.get(payment.id);
    if (link) {
      if (link.fullyReversed) continue;
      displayed.push({
        id: payment.id,
        orderId: payment.orderId,
        paymentIds: [payment.id, ...link.reversalPaymentIds],
        method: payment.method,
        amount: link.netAmount,
        originalAmount: link.originalAmount,
        reversedAmount: link.reversedAmount,
        date: payment.date,
        status: link.partiallyReversed ? 'PARTIALLY_REVERSED' : 'OVER_REVERSED',
        canVoid: false,
        sessionIds: link.sessionIds,
        hasCrossSession: link.hasCrossSession,
      });
      continue;
    }

    if (payment.amount < 0) {
      displayed.push({
        id: payment.id,
        orderId: payment.orderId,
        paymentIds: [payment.id],
        method: payment.method,
        amount: roundMoney(Number(payment.amount)),
        originalAmount: roundMoney(Number(payment.amount)),
        reversedAmount: roundMoney(Math.abs(Number(payment.amount))),
        date: payment.date,
        status: 'UNLINKED_REVERSAL',
        canVoid: false,
        sessionIds: uniqueSessionIds([payment.cashRegisterId]),
        hasCrossSession: false,
      });
      continue;
    }

    displayed.push({
      id: payment.id,
      orderId: payment.orderId,
      paymentIds: [payment.id],
      method: payment.method,
      amount: roundMoney(Number(payment.amount)),
      originalAmount: roundMoney(Number(payment.amount)),
      reversedAmount: 0,
      date: payment.date,
      status: 'VALID',
      canVoid: true,
      sessionIds: uniqueSessionIds([payment.cashRegisterId]),
      hasCrossSession: false,
    });
  }

  return displayed;
}

export function sumDisplayedPayments(payments: DisplayedPayment[]): number {
  return roundMoney(payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));
}
