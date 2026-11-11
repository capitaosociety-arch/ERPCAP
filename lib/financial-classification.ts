export type FinancialEntryLike = {
  type?: string | null;
  category?: string | null;
  description?: string | null;
  notes?: string | null;
  entryKind?: string | null;
};

export type DreExpenseKind = 'inventory' | 'financial' | 'tax' | 'operating';

function text(entry: FinancialEntryLike): string {
  return `${entry.description || ''} ${entry.notes || ''} ${entry.category || ''}`
    .trim()
    .toLowerCase();
}

/**
 * Compras de estoque não são despesa operacional no DRE: o custo é
 * reconhecido como CMV quando o produto é vendido. O campo entryKind é a
 * classificação definitiva; os padrões abaixo cobrem os dados históricos.
 */
export function isInventoryPurchaseEntry(entry: FinancialEntryLike): boolean {
  if (entry.type !== 'PAYABLE') return false;
  if (entry.entryKind) return entry.entryKind === 'INVENTORY_PURCHASE';

  const category = (entry.category || '').toLowerCase();
  if (category.includes('fornecedor')) return true;

  const value = text(entry);
  return /(^|\s)(produtos?|coca|ambev|embev|eldorado|salgadinho|mercez)\b/.test(value);
}

export function classifyDreExpense(entry: FinancialEntryLike): DreExpenseKind {
  if (isInventoryPurchaseEntry(entry)) return 'inventory';

  if (entry.entryKind === 'FINANCIAL') return 'financial';
  if (entry.entryKind === 'TAX') return 'tax';
  if (entry.entryKind === 'OPERATING') return 'operating';

  const value = text(entry);
  if (/juros|multa|tarifa|financeir|cart[aã]o de cr[eé]dito/.test(value)) return 'financial';
  if (/imposto|darf|simples nacional|icms|\bpis\b|cofins|tribut/.test(value)) return 'tax';
  return 'operating';
}

export function inferFinancialEntryKind(entry: FinancialEntryLike): string {
  if (entry.type === 'RECEIVABLE') return 'OTHER_REVENUE';
  if (isInventoryPurchaseEntry(entry)) return 'INVENTORY_PURCHASE';
  return classifyDreExpense(entry) === 'financial'
    ? 'FINANCIAL'
    : classifyDreExpense(entry) === 'tax'
      ? 'TAX'
      : 'OPERATING';
}
