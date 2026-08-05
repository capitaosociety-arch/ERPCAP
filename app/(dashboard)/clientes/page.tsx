import { prisma } from "../../../lib/prisma";
import ClientesClient from "./ClientesClient";

export default async function ClientesRoute() {
  const [customers, payments] = await Promise.all([
    prisma.customer.findMany({
      include: {
        subscription: { include: { payments: { orderBy: { paymentDate: 'desc' }} } },
        rentals: { orderBy: { startTime: 'desc' } }
      },
      orderBy: { name: 'asc' }
    }),
    prisma.payment.findMany({
      select: {
        orderId: true,
        date: true,
        amount: true,
        order: {
          select: {
            total: true,
            discount: true,
            items: {
              where: { status: 'ACTIVE' },
              select: {
                quantity: true,
                subtotal: true,
                serviceId: true,
                product: { select: { name: true, category: { select: { name: true } } } },
                service: { select: { name: true } }
              }
            }
          }
        }
      }
    })
  ]);

  // Lançamentos de aluguéis de campo registrados nas sessões de caixa (PDV/comandas).
  // Fonte da verdade para a contagem de jogos FUT5/FUT7, igual ao módulo Financeiro.
  // Pagamento parcial: jogo pago pela metade conta como meio jogo (proporção pago/a pagar).
  const fieldRentalLancamentos: { day: string; name: string; qty: number; amount: number }[] = [];
  const paidByOrder: Record<string, number> = {};
  payments.forEach(p => { if (p.orderId) paidByOrder[p.orderId] = (paidByOrder[p.orderId] || 0) + (p.amount || 0); });

  const processedOrders = new Set<string>();
  const paymentsSorted = [...payments].sort((a, b) => a.date.getTime() - b.date.getTime());
  paymentsSorted.forEach(p => {
    if (!p.orderId || processedOrders.has(p.orderId)) return;
    processedOrders.add(p.orderId);

    const order = p.order;
    if (!order) return;
    const payable = (order.total || 0) - (order.discount || 0);
    const paid = paidByOrder[p.orderId] || 0;
    const ratio = payable > 0 ? Math.min(1, paid / payable) : 1;

    const day = p.date.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' });
    (order.items || []).forEach(item => {
      const prodName = item.product?.name?.toLowerCase() || '';
      const catName = item.product?.category?.name?.toLowerCase() || '';
      const svcName = item.service?.name?.toLowerCase() || '';
      const isRental = !!item.serviceId || catName.includes('aluguel') || catName.includes('campo') ||
                       prodName.includes('aluguel') || prodName.includes('campo') ||
                       svcName.includes('aluguel') || svcName.includes('campo');
      if (!isRental) return;
      fieldRentalLancamentos.push({
        day,
        name: `${item.product?.name || ''} ${item.service?.name || ''}`.trim(),
        qty: (item.quantity || 0) * ratio,
        amount: item.subtotal
      });
    });
  });

  return <ClientesClient initialCustomers={customers} fieldRentalLancamentos={fieldRentalLancamentos} />;
}
