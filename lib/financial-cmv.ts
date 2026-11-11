export type CmvMovementLike = {
  quantity?: number | null;
  unitCost?: number | null;
  product?: {
    price?: number | null;
    cost?: number | null;
  } | null;
};

export type CmvEvaluation = {
  quantity: number;
  unitCost: number | null;
  value: number;
  uncosted: boolean;
  suspect: boolean;
};

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Avalia uma saída de venda sem usar o custo atual do cadastro como substituto.
 * O DRE deve usar exclusivamente o snapshot gravado na movimentação; quando ele
 * não existe, a venda é sinalizada como sem custo em vez de ser recalculada
 * retroativamente com o custo atual do produto.
 */
export function evaluateCmvMovement(movement: CmvMovementLike): CmvEvaluation {
  const quantityRaw = finiteNumber(movement.quantity);
  const quantity = quantityRaw != null && quantityRaw > 0 ? quantityRaw : 0;

  const unitCostRaw = finiteNumber(movement.unitCost);
  const unitCost = unitCostRaw != null && unitCostRaw >= 0 ? unitCostRaw : null;
  const value = unitCost == null ? 0 : quantity * unitCost;

  const salePrice = finiteNumber(movement.product?.price);
  const suspect = unitCost != null && unitCost > 0 && salePrice != null && salePrice > 0 && unitCost > salePrice;

  return {
    quantity,
    unitCost,
    value,
    uncosted: unitCost == null,
    suspect,
  };
}
