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
        date: true,
        order: {
          select: {
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
  const fieldRentalLancamentos: { day: string; name: string; qty: number; amount: number }[] = [];
  payments.forEach(p => {
    p.order?.items.forEach(item => {
      const prodName = item.product?.name?.toLowerCase() || '';
      const catName = item.product?.category?.name?.toLowerCase() || '';
      const svcName = item.service?.name?.toLowerCase() || '';
      const isRental = !!item.serviceId || catName.includes('aluguel') || catName.includes('campo') ||
                       prodName.includes('aluguel') || prodName.includes('campo') ||
                       svcName.includes('aluguel') || svcName.includes('campo');
      if (!isRental) return;
      fieldRentalLancamentos.push({
        day: p.date.toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' }),
        name: `${item.product?.name || ''} ${item.service?.name || ''}`.trim(),
        qty: item.quantity,
        amount: item.subtotal
      });
    });
  });

  return <ClientesClient initialCustomers={customers} fieldRentalLancamentos={fieldRentalLancamentos} />;
}
