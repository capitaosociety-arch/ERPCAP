export type SessionAuditItemInput = {
  subtotal: number;
  status?: string | null;
};

export type SessionAuditPaymentInput = {
  amount: number;
  cashRegisterId?: string | null;
  date?: string | Date | null;
};

export type SessionAuditOrderInput = {
  id: string;
  label?: string | null;
  status: string;
  discount?: number | null;
  items: SessionAuditItemInput[];
  payments: SessionAuditPaymentInput[];
};

export type SessionSalesAuditOrderResult = {
  id: string;
  label: string;
  status: string;
  canceled: boolean;
  open: boolean;
  crossSession: boolean;
  attributedElsewhere: boolean;
  itemsGross: number;
  discount: number;
  netSales: number;
  paymentsNet: number;
  difference: number;
  excess: number;
  shortage: number;
  pendingOpen: number;
};

export type SessionSalesAuditResult = {
  orders: SessionSalesAuditOrderResult[];
  validOrders: number;
  canceledOrders: number;
  openOrders: number;
  crossSessionOrders: number;
  grossValid: number;
  discountsValid: number;
  netSalesValid: number;
  paymentsValid: number;
  excess: number;
  shortage: number;
  netDifference: number;
  pendingOpen: number;
  canceledGross: number;
  canceledNetSales: number;
  canceledPaymentsNet: number;
};

const MONEY_EPSILON = 0.005;

export function roundAuditMoney(value: number): number {
  return Number((Number(value) || 0).toFixed(2));
}

function isActiveItem(item: SessionAuditItemInput): boolean {
  const status = String(item?.status || 'ACTIVE').toUpperCase();
  return status === 'ACTIVE';
}

function paymentTime(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Auditoria de vendas de uma sessão de caixa.
 *
 * Metodologia por venda:
 *   diferença = pagamentos líquidos válidos − valor líquido devido
 *
 * - Positivo = recebimento excedente (verde).
 * - Negativo = pagamento faltante (vermelho).
 * - Zero = venda corretamente liquidada (ÍNTEGRO).
 * - Descontos registrados reduzem o valor devido e não geram divergência.
 * - Comandas CANCELADAS não têm valor devido; se os pagamentos estiverem
 *   integralmente neutralizados (líquido zero), não geram divergência. Resíduos
 *   em canceladas são sinalizados.
 * - Comandas OPEN com pagamento parcial são “em aberto” e não entram como
 *   falta; excesso em aberto é sinalizado.
 * - Ordens com pagamentos em mais de uma sessão são atribuídas à sessão do
 *   pagamento mais recente, evitando dupla contabilização. Nas demais sessões
 *   elas são marcadas como atribuídas a outra sessão.
 * - Excedentes e faltas são somados separadamente; um nunca compensa o outro.
 */
export function computeSessionSalesAudit(
  orders: SessionAuditOrderInput[],
  sessionId?: string | null,
): SessionSalesAuditResult {
  const result: SessionSalesAuditResult = {
    orders: [],
    validOrders: 0,
    canceledOrders: 0,
    openOrders: 0,
    crossSessionOrders: 0,
    grossValid: 0,
    discountsValid: 0,
    netSalesValid: 0,
    paymentsValid: 0,
    excess: 0,
    shortage: 0,
    netDifference: 0,
    pendingOpen: 0,
    canceledGross: 0,
    canceledNetSales: 0,
    canceledPaymentsNet: 0,
  };

  for (const order of orders) {
    const status = String(order.status || '').toUpperCase();
    const canceled = status === 'CANCELED';
    const open = status === 'OPEN';

    const itemsGross = roundAuditMoney(
      (order.items || [])
        .filter(isActiveItem)
        .reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0),
    );
    const discount = roundAuditMoney(Math.max(0, Number(order.discount) || 0));
    const netSalesDue = roundAuditMoney(Math.max(0, itemsGross - discount));
    const netSales = canceled ? 0 : netSalesDue;

    const allPayments = order.payments || [];
    const sessionIds = Array.from(
      new Set(
        allPayments
          .map((payment) => payment.cashRegisterId)
          .filter((id): id is string => !!id),
      ),
    );
    const crossSession = sessionIds.length > 1;
    const lastPaymentSessionId = allPayments
      .slice()
      .sort((a, b) => paymentTime(a.date) - paymentTime(b.date))
      .reverse()
      .find((payment) => !!payment.cashRegisterId)?.cashRegisterId || null;
    const attributedElsewhere = !!(
      crossSession &&
      sessionId &&
      lastPaymentSessionId &&
      lastPaymentSessionId !== sessionId
    );

    const paymentsNet = roundAuditMoney(
      allPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
    );

    let difference = 0;
    let excess = 0;
    let shortage = 0;
    let pendingOpen = 0;

    if (!attributedElsewhere) {
      if (canceled) {
        difference = Math.abs(paymentsNet) <= MONEY_EPSILON ? 0 : paymentsNet;
        excess = roundAuditMoney(Math.max(0, difference));
        shortage = roundAuditMoney(Math.max(0, -difference));
      } else if (open) {
        excess = roundAuditMoney(Math.max(0, paymentsNet - netSales));
        pendingOpen = roundAuditMoney(Math.max(0, netSales - paymentsNet));
        difference = excess;
      } else {
        difference = roundAuditMoney(paymentsNet - netSales);
        excess = roundAuditMoney(Math.max(0, difference));
        shortage = roundAuditMoney(Math.max(0, -difference));
      }
    }

    result.orders.push({
      id: order.id,
      label: order.label || '',
      status: order.status,
      canceled,
      open,
      crossSession,
      attributedElsewhere,
      itemsGross,
      discount,
      netSales,
      paymentsNet,
      difference,
      excess,
      shortage,
      pendingOpen,
    });

    if (canceled) {
      result.canceledOrders += 1;
      result.canceledGross = roundAuditMoney(result.canceledGross + itemsGross);
      result.canceledNetSales = roundAuditMoney(result.canceledNetSales + netSalesDue);
      result.canceledPaymentsNet = roundAuditMoney(result.canceledPaymentsNet + paymentsNet);
    } else {
      result.validOrders += 1;
      if (open) result.openOrders += 1;
      result.grossValid = roundAuditMoney(result.grossValid + itemsGross);
      result.discountsValid = roundAuditMoney(result.discountsValid + discount);
      result.netSalesValid = roundAuditMoney(result.netSalesValid + netSales);
      result.paymentsValid = roundAuditMoney(result.paymentsValid + paymentsNet);
    }

    if (crossSession) result.crossSessionOrders += 1;
    if (attributedElsewhere) continue;

    result.excess = roundAuditMoney(result.excess + excess);
    result.shortage = roundAuditMoney(result.shortage + shortage);
    result.pendingOpen = roundAuditMoney(result.pendingOpen + pendingOpen);
  }

  result.netDifference = roundAuditMoney(result.excess - result.shortage);
  return result;
}

export function hasSalesAuditDifference(audit: SessionSalesAuditResult): boolean {
  return audit.excess > MONEY_EPSILON || audit.shortage > MONEY_EPSILON;
}

export function salesAuditStatusLabel(audit: SessionSalesAuditResult): string {
  const hasExcess = audit.excess > MONEY_EPSILON;
  const hasShortage = audit.shortage > MONEY_EPSILON;
  if (hasExcess && hasShortage) return 'Excedente e falta';
  if (hasExcess) return 'Recebimento excedente';
  if (hasShortage) return 'Pagamento faltante';
  return 'ÍNTEGRO';
}

/**
 * Adapta a lista plana de pagamentos de uma sessão (com a ordem embutida)
 * para a entrada da auditoria. Quando `order.payments` está disponível, usa
 * todos os pagamentos da ordem para detectar pagamentos em outras sessões.
 */
export function buildAuditOrdersFromSessionPayments(
  sessionPayments: Array<{
    amount: number;
    orderId?: string | null;
    order?: {
      id: string;
      status: string;
      discount?: number | null;
      notes?: string | null;
      items?: Array<{ subtotal: number; status?: string | null }>;
      payments?: Array<{
        amount: number;
        cashRegisterId?: string | null;
        date?: string | Date | null;
      }>;
    } | null;
  }>,
  sessionId?: string | null,
): SessionAuditOrderInput[] {
  const byOrder = new Map<string, SessionAuditOrderInput>();

  for (const payment of sessionPayments || []) {
    const order = payment.order;
    if (!order) continue;
    const key = order.id;
    let entry = byOrder.get(key);
    if (!entry) {
      const allPayments = (order.payments && order.payments.length > 0)
        ? order.payments.map((item) => ({
            amount: Number(item.amount) || 0,
            cashRegisterId: item.cashRegisterId || sessionId || null,
            date: item.date || null,
          }))
        : [];
      entry = {
        id: order.id,
        label: order.notes || '',
        status: order.status,
        discount: order.discount || 0,
        items: (order.items || []).map((item) => ({
          subtotal: Number(item.subtotal) || 0,
          status: item.status || 'ACTIVE',
        })),
        payments: allPayments.length > 0
          ? allPayments
          : [{ amount: Number(payment.amount) || 0, cashRegisterId: sessionId || null, date: null }],
      };
      byOrder.set(key, entry);
    }
  }

  return Array.from(byOrder.values());
}
