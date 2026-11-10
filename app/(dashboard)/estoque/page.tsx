import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { attachSignedInvoiceUrls } from "@/lib/storage";
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
      orderBy: { category: { name: 'asc' } },
      where: { isActive: true } // Oculta produtos de menu apagados da contagem padrao
    }),
    prisma.stockCount.findMany({
      where: { location: 'BALCAO' }
    })
  ]);

  const productsWithSignedImages = await Promise.all(
    products.map(async (product) => ({
      ...product,
      stockMovements: await attachSignedInvoiceUrls(product.stockMovements || [])
    }))
  );

  return <EstoqueClient initialProducts={productsWithSignedImages as any} initialStockCounts={stockCounts} />;
}
