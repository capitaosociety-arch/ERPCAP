import { buildRentalWindow, formatRentalPeriod } from './rental-time';
import { findOperationalConflict, findReusableOperationalRental, operationalInterval } from './rental-conflicts';
import { NEW_RENTAL_TIME_CONVENTION } from './time-zone';

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
    customerId = (await tx.customer.create({
      data: { name, phone: '', notes: 'Cliente avulso de aluguel de campo' },
      select: { id: true },
    })).id;
  } else {
    const existingCustomer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!existingCustomer) throw new Error('Cliente da reserva nao encontrado.');
  }

  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${resource.toLowerCase()}))::text`;
  const candidateFrom = new Date(startTime.getTime() - 2 * 60 * 60 * 1000);
  const candidateTo = new Date(endTime.getTime() + 2 * 60 * 60 * 1000);
  const candidates = await tx.rental.findMany({
    where: {
      resource,
      startTime: { lt: candidateTo },
      endTime: { gt: candidateFrom },
    },
    select: {
      id: true,
      customerId: true,
      resource: true,
      startTime: true,
      endTime: true,
      status: true,
      timeConvention: true,
      orderItems: { where: { status: 'ACTIVE' }, select: { id: true } },
    },
  });

  const target = { customerId: customerId!, resource, startTime, endTime, timeConvention: NEW_RENTAL_TIME_CONVENTION };
  const reusable = findReusableOperationalRental(
    candidates.filter((candidate: any) => candidate.customerId === customerId && candidate.orderItems.length === 0),
    target
  );
  if (reusable) return { id: reusable.id, created: false };

  const conflict = findOperationalConflict(candidates, target);
  if (conflict) {
    const conflictInterval = operationalInterval(conflict);
    throw new Error(`Horario indisponivel para ${resource}: ${formatRentalPeriod(conflictInterval.startTime, conflictInterval.endTime, 'CUIABA')}.`);
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
      timeConvention: NEW_RENTAL_TIME_CONVENTION,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}
