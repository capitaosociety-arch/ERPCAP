export type InventoryLocation = 'BALCAO' | 'DEPOT';

export function roundCost(value: number): number {
  return Number(Number(value || 0).toFixed(6));
}

export function weightedAverageCost(
  currentQuantity: number,
  currentAverageCost: number,
  incomingQuantity: number,
  incomingUnitCost: number
): number {
  const currentQty = Number(currentQuantity) || 0;
  const incomingQty = Number(incomingQuantity) || 0;
  const currentAvg = Number(currentAverageCost) || 0;
  const incomingCost = Number(incomingUnitCost) || 0;

  if (incomingQty <= 0) return roundCost(currentAvg);
  if (currentQty <= 0) return roundCost(incomingCost);

  const totalQty = currentQty + incomingQty;
  if (totalQty <= 0) return 0;

  return roundCost(((currentQty * currentAvg) + (incomingQty * incomingCost)) / totalQty);
}

export function effectiveAverageCost(
  averageCost: number | null | undefined,
  fallbackCost: number | null | undefined,
  quantity: number
): number {
  const avg = Number(averageCost) || 0;
  if (avg > 0) return roundCost(avg);
  const fallback = Number(fallbackCost) || 0;
  return quantity > 0 ? roundCost(fallback) : roundCost(fallback);
}

type LedgerInput = {
  productId: string;
  location: InventoryLocation;
  movementType: string;
  quantity: number;
  unitCost: number;
  balanceQty: number;
  balanceAvgCost: number;
  referenceId?: string | null;
  notes?: string | null;
};

export async function recordInventoryCost(tx: any, input: LedgerInput) {
  const quantity = Number(input.quantity) || 0;
  const unitCost = Number(input.unitCost) || 0;
  await tx.inventoryCostLedger.create({
    data: {
      productId: input.productId,
      location: input.location,
      movementType: input.movementType,
      quantity,
      unitCost: roundCost(unitCost),
      totalCost: roundCost(quantity * unitCost),
      balanceQty: roundCost(input.balanceQty),
      balanceAvgCost: roundCost(input.balanceAvgCost),
      referenceId: input.referenceId || null,
      notes: input.notes || null,
    },
  });
}
