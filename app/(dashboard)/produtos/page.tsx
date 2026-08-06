import { prisma } from "../../../lib/prisma";
import ProductsClient from "./ProductsClient";

export default async function ProductsRoute() {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      include: { 
          category: true, 
          stock: true,
          depotStock: true,
          stockCounts: { orderBy: { date: 'desc' } },
          priceHistories: { orderBy: { date: 'desc' } }
      },
      orderBy: { category: { name: 'asc' } }
    }),
    prisma.productCategory.findMany()
  ]);

  return <ProductsClient initialProducts={products} categories={categories} />;
}
