export const STOCK_COUNT_MISSING = '—';

export type StockCountDifferenceTone = 'equal' | 'below' | 'above' | 'unknown';

export function calculateStockCountDifference(counted: unknown, systemQuantity: unknown): number | null {
  if (counted == null || systemQuantity == null) return null;
  const countedValue = Number(counted);
  const systemValue = Number(systemQuantity);
  if (!Number.isFinite(countedValue) || !Number.isFinite(systemValue)) return null;
  return countedValue - systemValue;
}

export function stockCountDifferenceTone(difference: number | null): StockCountDifferenceTone {
  if (difference == null || !Number.isFinite(difference)) return 'unknown';
  if (difference === 0) return 'equal';
  return difference < 0 ? 'below' : 'above';
}

export function formatStockQuantity(value: unknown): string {
  if (value == null) return STOCK_COUNT_MISSING;
  const number = Number(value);
  if (!Number.isFinite(number)) return STOCK_COUNT_MISSING;
  return number.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
