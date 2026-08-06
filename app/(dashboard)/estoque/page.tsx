import { prisma } from "@/lib/prisma";
import EstoqueClient from "./EstoqueClient";

export default async function EstoqueRoute() {
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
      orderBy: { category: { name: 'asc' } },
      where: { isActive: true } // Oculta produtos de menu apagados da contagem padrao
    }),
    prisma.stockCount.findMany({
      where: { location: 'BALCAO' }
    })
  ]);

  return <EstoqueClient initialProducts={products as any} initialStockCounts={stockCounts} />;
}
