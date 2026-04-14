import { prisma } from "../../../lib/prisma";
import EstoqueClient from "./EstoqueClient";

export default async function EstoqueRoute() {
  const products = await prisma.product.findMany({
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
  });

  return <EstoqueClient initialProducts={products} />;
}
