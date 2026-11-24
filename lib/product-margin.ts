export function calculateMarginPercent(price: unknown, cost: unknown): number | null {
  const sale = Number(price);
  const base = Number(cost);
  if (!Number.isFinite(sale) || !Number.isFinite(base)) return null;
  if (sale <= 0 || base <= 0) return null;
  return ((sale - base) / sale) * 100;
}

export function formatMarginPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2).replace('.', ',')}%`;
}
