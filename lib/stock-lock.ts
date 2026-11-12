import type { Prisma } from '@prisma/client';

export async function lockStockRow(tx: Prisma.TransactionClient, productId: string) {
  await tx.$queryRaw`SELECT id FROM "Stock" WHERE "productId" = ${productId} FOR UPDATE`;
  return tx.stock.findUnique({ where: { productId } });
}

export async function lockOrderItemRow(tx: Prisma.TransactionClient, orderItemId: string) {
  await tx.$queryRaw`SELECT id FROM "OrderItem" WHERE id = ${orderItemId} FOR UPDATE`;
}
