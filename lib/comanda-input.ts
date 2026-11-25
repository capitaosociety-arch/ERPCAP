export type ComandaQuantityState = Record<string, number>;

export function uppercaseComandaIdentifier(value: unknown): string {
  return String(value ?? '').toUpperCase();
}

export function normalizeComandaIdentifier(value: unknown): string {
  return uppercaseComandaIdentifier(value).trim();
}

export function comandaProductQuantity(
  state: ComandaQuantityState,
  productId: string,
  fallback = 1
): number {
  const value = Number(state[productId]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function setComandaProductQuantity(
  state: ComandaQuantityState,
  productId: string,
  quantity: number
): ComandaQuantityState {
  const value = Number(quantity);
  const safe = Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 1;
  return { ...state, [productId]: safe };
}

export function adjustComandaProductQuantity(
  state: ComandaQuantityState,
  productId: string,
  delta: number,
  step = 0.5,
  minimum = step
): ComandaQuantityState {
  const current = comandaProductQuantity(state, productId);
  const next = Math.round((current + delta * step) * 100) / 100;
  return setComandaProductQuantity({ ...state }, productId, Math.max(minimum, next));
}

export function resetComandaProductQuantity(
  state: ComandaQuantityState,
  productId: string
): ComandaQuantityState {
  const next = { ...state };
  delete next[productId];
  return next;
}

export function comandaCustomerLink(
  customerId: unknown,
  customerName: unknown
): { linked: boolean; label: string } {
  const id = String(customerId ?? '').trim();
  const name = String(customerName ?? '').trim();
  if (id && name) {
    return { linked: true, label: `Cliente vinculado: ${name}` };
  }
  return { linked: false, label: 'Sem cliente vinculado' };
}
