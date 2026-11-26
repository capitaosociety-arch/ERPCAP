import type { Prisma } from '@prisma/client';

export async function lockStockRow(tx: Prisma.TransactionClient, productId: string) {
  await tx.$queryRaw`SELECT id FROM "Stock" WHERE "productId" = ${productId} FOR UPDATE`;
  return tx.stock.findUnique({ where: { productId } });
}

export async function lockStockRows(tx: Prisma.TransactionClient, productIds: string[]) {
  const locked = new Map<string, Awaited<ReturnType<typeof lockStockRow>>>();
  const unique = Array.from(new Set(productIds.filter(Boolean))).sort();
  for (const productId of unique) {
    locked.set(productId, await lockStockRow(tx, productId));
  }
  return locked;
}

export async function lockOrderItemRow(tx: Prisma.TransactionClient, orderItemId: string) {
  await tx.$queryRaw`SELECT id FROM "OrderItem" WHERE id = ${orderItemId} FOR UPDATE`;
}

export async function lockOrderRow(tx: Prisma.TransactionClient, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
}

export async function lockDepotStockRow(tx: Prisma.TransactionClient, productId: string) {
  await tx.$queryRaw`SELECT id FROM "DepotStock" WHERE "productId" = ${productId} FOR UPDATE`;
  return tx.depotStock.findUnique({ where: { productId } });
}

export async function lockTransferRequestRow(tx: Prisma.TransactionClient, requestId: string) {
  await tx.$queryRaw`SELECT id FROM "TransferRequest" WHERE id = ${requestId} FOR UPDATE`;
  return tx.transferRequest.findUnique({ where: { id: requestId } });
}

export async function lockCashRegisterRow(tx: Prisma.TransactionClient, registerId: string) {
  await tx.$queryRaw`SELECT id FROM "CashRegister" WHERE id = ${registerId} FOR UPDATE`;
  return tx.cashRegister.findUnique({ where: { id: registerId } });
}
