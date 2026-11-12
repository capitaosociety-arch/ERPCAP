export function formatQuantityInput(value: number, allowFractional = false): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  const rounded = allowFractional ? Math.round(numeric * 100) / 100 : Math.round(numeric);
  return allowFractional ? String(rounded).replace('.', ',') : String(rounded);
}

export function parseQuantityInput(raw: string, allowFractional = false): number | null {
  const normalized = String(raw ?? '').trim().replace(',', '.');
  if (!normalized) return null;
  if (!allowFractional && !/^\d+$/.test(normalized)) return null;
  if (allowFractional && !/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (!allowFractional && !Number.isInteger(value)) return null;
  return allowFractional ? Math.round(value * 100) / 100 : value;
}

export function maxQuantityForExistingItem(currentQuantity: number, availableStock: number): number {
  const current = Math.max(0, Number(currentQuantity) || 0);
  const available = Math.max(0, Number(availableStock) || 0);
  return Math.round((current + available) * 100) / 100;
}

export function sanitizeQuantityDraft(raw: string, allowFractional = false): string {
  if (allowFractional) {
    const cleaned = String(raw ?? '').replace(/[^\d.,]/g, '').replace(/,/g, '.');
    const [whole, ...rest] = cleaned.split('.');
    if (rest.length === 0) return whole;
    return `${whole}.${rest.join('').slice(0, 2)}`;
  }
  return String(raw ?? '').replace(/\D/g, '');
}
