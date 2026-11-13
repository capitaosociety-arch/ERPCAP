import assert from 'node:assert/strict';
import { assertUniqueRentalBookings, resolveLinkedRental } from '../../lib/rental-booking';

const input = {
  customerId: 'customer-1',
  resource: 'FUT5',
  date: '2026-11-13',
  start: '20:00',
  end: '21:00',
  amount: 140,
};

function fakeTx(options: { existingRental?: any; conflict?: any; customer?: any } = {}) {
  const calls: { rentalFindFirst: number; rentalCreate: number; exactWhere?: any; lastCreate?: any } = { rentalFindFirst: 0, rentalCreate: 0 };
  const tx = {
    $queryRaw: async () => [{ pg_advisory_xact_lock: '1' }],
    customer: {
      findFirst: async () => null,
      findUnique: async () => options.customer === null ? null : { id: 'customer-1' },
      create: async () => ({ id: 'customer-new' }),
    },
    rental: {
      findFirst: async ({ where }: any) => {
        calls.rentalFindFirst += 1;
        if (calls.rentalFindFirst === 1) calls.exactWhere = where;
        return calls.rentalFindFirst === 1 ? options.existingRental || null : options.conflict || null;
      },
      create: async ({ data }: any) => {
        calls.rentalCreate += 1;
        calls.lastCreate = data;
        return { id: 'rental-new', data };
      },
    },
  };
  return { tx, calls };
}

async function main() {
  {
    const { tx, calls } = fakeTx({ existingRental: { id: 'rental-existing' } });
    const result = await resolveLinkedRental(tx, input);
    assert.deepEqual(result, { id: 'rental-existing', created: false });
    assert.deepEqual(calls.exactWhere.status, { in: ['PENDING', 'CONFIRMED'] });
    assert.equal(calls.rentalCreate, 0);
  }

  {
    const { tx, calls } = fakeTx();
    const result = await resolveLinkedRental(tx, input);
    assert.deepEqual(result, { id: 'rental-new', created: true });
    assert.equal(calls.rentalCreate, 1);
    assert.equal(calls.lastCreate.source, 'WALK_IN');
    assert.equal(calls.lastCreate.status, 'PENDING');
  }

  {
    const { tx, calls } = fakeTx({ conflict: { id: 'rental-conflict', startTime: new Date(), endTime: new Date() } });
    await assert.rejects(() => resolveLinkedRental(tx, input), /Horario indisponivel/);
    assert.equal(calls.rentalCreate, 0);
  }

  {
    const { tx, calls } = fakeTx({ customer: null });
    await assert.rejects(() => resolveLinkedRental(tx, { ...input, customerId: 'missing' }), /Cliente da reserva nao encontrado/);
    assert.equal(calls.rentalCreate, 0);
  }

  {
    const { tx } = fakeTx();
    await assert.rejects(
      () => resolveLinkedRental(tx, { ...input, customerId: null, customerName: '' }),
      /Informe o cliente do aluguel/
    );
  }

  {
    assert.doesNotThrow(() => assertUniqueRentalBookings([input, { ...input, start: '21:00', end: '22:00' }]));
    assert.throws(() => assertUniqueRentalBookings([input, { ...input }]), /mesma reserva/);
  }

  console.log('rental-booking tests: OK');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
