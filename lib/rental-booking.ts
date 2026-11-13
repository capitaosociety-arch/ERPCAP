import { buildRentalWindow, formatRentalPeriod } from './rental-time';

export type RentalBookingInput = {
  customerId?: string | null;
  customerName?: string | null;
  resource: string;
  date: string;
  start: string;
  end: string;
  amount: number;
};

export function rentalBookingKey(input: RentalBookingInput): string {
  return [
    input.customerId || '',
    String(input.customerName || '').trim().toLowerCase(),
    String(input.resource || '').trim().toUpperCase(),
    input.date,
    input.start,
    input.end,
  ].join('|');
}

export function assertUniqueRentalBookings(bookings: RentalBookingInput[]): void {
  const seen = new Set<string>();
  for (const booking of bookings) {
    const key = rentalBookingKey(booking);
    if (seen.has(key)) throw new Error('A mesma reserva foi adicionada mais de uma vez.');
    seen.add(key);
  }
}

export async function resolveLinkedRental(tx: any, input: RentalBookingInput) {
  const resource = String(input.resource || '').trim();
  if (!resource) throw new Error('Informe o campo da reserva.');
  const { startTime, endTime } = buildRentalWindow(input.date, input.start, input.end);
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Valor da reserva invalido.');

  let customerId = input.customerId || null;
  if (!customerId) {
    const name = String(input.customerName || '').trim();
    if (!name) throw new Error('Informe o cliente do aluguel.');
    const existingCustomer = await tx.customer.findFirst({ where: { name }, select: { id: true } });
    customerId = existingCustomer?.id || (await tx.customer.create({
      data: { name, phone: '', notes: 'Cliente avulso de aluguel de campo' },
      select: { id: true },
    })).id;
  } else {
    const existingCustomer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!existingCustomer) throw new Error('Cliente da reserva nao encontrado.');
  }

  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${resource.toLowerCase()}))::text`;
  const existingRental = await tx.rental.findFirst({
    where: {
      customerId,
      resource,
      startTime,
      endTime,
      status: { in: ['PENDING', 'CONFIRMED'] },
      orderItems: { none: { status: 'ACTIVE' } },
    },
    select: { id: true },
  });
  if (existingRental) return { id: existingRental.id, created: false };

  const conflict = await tx.rental.findFirst({
    where: {
      resource,
      status: { not: 'CANCELED' },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true, startTime: true, endTime: true },
  });
  if (conflict) {
    throw new Error(`Horario indisponivel para ${resource}: ${formatRentalPeriod(conflict.startTime, conflict.endTime)}.`);
  }

  const created = await tx.rental.create({
    data: {
      customerId,
      resource,
      startTime,
      endTime,
      totalAmount: amount,
      status: 'PENDING',
      source: 'WALK_IN',
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}
