import { prisma } from "../../../lib/prisma";
import ComandaBoard from "./ComandaBoard";

export default async function MesasRoute() {
  const [openOrders, products, openRegister, customers] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      include: {
        items: {
          include: { product: true }
        },
        payments: {
            orderBy: { date: 'desc' }
        }
      }
    }),
    prisma.product.findMany({
      where: { isActive: true },
      include: { stock: true }
    }),
    prisma.cashRegister.findFirst({ where: { status: 'OPEN' } }),
    prisma.customer.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, phone: true }
    })
  ]);

  return (
    <div className="animate-in fade-in duration-500">
      <ComandaBoard openOrders={openOrders} products={products} openRegister={openRegister} customers={customers} />
    </div>
  );
}
