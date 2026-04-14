import { prisma } from "../../../lib/prisma";
import ComandaBoard from "./ComandaBoard";

export default async function MesasRoute() {
  const openOrders = await prisma.order.findMany({
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
  });

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { stock: true }
  });

  const openRegister = await prisma.cashRegister.findFirst({ where: { status: 'OPEN' } });

  return (
    <div className="animate-in fade-in duration-500">
      <ComandaBoard openOrders={openOrders} products={products} openRegister={openRegister} />
    </div>
  );
}
