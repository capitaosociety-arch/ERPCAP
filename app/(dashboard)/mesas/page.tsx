import { prisma } from "../../../lib/prisma";
import { requirePagePermission } from "../../../lib/auth-guard";
import { buildDisplayedPayments } from "../../../lib/payment-display";
import { loadPaymentDisplayData } from "../../../lib/payment-display-server";
import ComandaBoard from "./ComandaBoard";

export default async function MesasRoute() {
  await requirePagePermission("permComandas");

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
        },
        customer: {
          select: { id: true, name: true }
        }
      }
    }),
    prisma.product.findMany({
      where: { isActive: true },
      include: { stock: true },
      orderBy: { name: 'asc' }
    }),
    prisma.cashRegister.findFirst({ where: { status: 'OPEN' } }),
    prisma.customer.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, phone: true }
    })
  ]);

  const { payments: displayPaymentRows, links: displayPaymentLinks } = await loadPaymentDisplayData(
    openOrders.map((order) => order.id),
  );
  const openOrdersForClient = openOrders.map((order) => {
    const orderPayments = displayPaymentRows.filter((payment) => payment.orderId === order.id);
    const orderLinks = displayPaymentLinks.filter((link) => link.orderId === order.id);
    return {
      ...order,
      displayPayments: buildDisplayedPayments(orderPayments, orderLinks),
    };
  });

  return (
    <div className="animate-in fade-in duration-500">
      <ComandaBoard openOrders={openOrdersForClient} products={products} openRegister={openRegister} customers={customers} />
    </div>
  );
}
