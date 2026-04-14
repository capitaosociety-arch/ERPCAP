import { prisma } from "../../../lib/prisma";
import ClientesClient from "./ClientesClient";

export default async function ClientesRoute() {
  const customers = await prisma.customer.findMany({
    include: {
      subscription: { include: { payments: { orderBy: { paymentDate: 'desc' }} } },
      rentals: { orderBy: { startTime: 'desc' } }
    },
    orderBy: { name: 'asc' }
  });

  return <ClientesClient initialCustomers={customers} />;
}
