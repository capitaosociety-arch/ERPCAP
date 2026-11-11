import { prisma } from "../../../lib/prisma";
import { requirePagePermission } from "../../../lib/auth-guard";
import ProductsClient from "./ProductsClient";

export default async function ProductsRoute() {
  await requirePagePermission("permProducts");

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      include: { 
          category: true, 
          stock: true,
          stockCounts: { where: { location: 'BALCAO' }, orderBy: { date: 'desc' } },
          priceHistories: { orderBy: { date: 'desc' } }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.productCategory.findMany()
  ]);

  return <ProductsClient initialProducts={products} categories={categories} />;
}
