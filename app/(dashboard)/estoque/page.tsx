import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import EstoqueClient from "./EstoqueClient";

export default async function EstoqueRoute() {
  await requirePagePermission("permStock");

  const [products, stockCounts] = await Promise.all([
    prisma.product.findMany({
      include: { 
          category: true, 
          stock: true,
          stockMovements: { 
              orderBy: { date: 'desc' },
              take: 10 
          }
      },
      orderBy: { name: 'asc' },
      where: { isActive: true } // Oculta produtos de menu apagados da contagem padrao
    }),
    prisma.stockCount.findMany({
      where: { location: 'BALCAO' }
    })
  ]);

  const productsForClient = products.map((product) => ({
    ...product,
    stockMovements: (product.stockMovements || []).map((movement) => {
      const { imageUrl, ...movementData } = movement;
      return {
        ...movementData,
        hasInvoiceImage: Boolean(imageUrl)
      };
    })
  }));

  return <EstoqueClient initialProducts={productsForClient as any} initialStockCounts={stockCounts} />;
}
