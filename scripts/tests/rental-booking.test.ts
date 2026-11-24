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
  const calls: { rentalFindMany: number; rentalCreate: number; candidatesWhere?: any; lastCreate?: any } = { rentalFindMany: 0, rentalCreate: 0 };
  const tx = {
    $queryRaw: async () => [{ pg_advisory_xact_lock: '1' }],
    customer: {
      findFirst: async () => null,
      findUnique: async () => options.customer === null ? null : { id: 'customer-1' },
      create: async () => ({ id: 'customer-new' }),
    },
    rental: {
      findMany: async ({ where }: any) => {
        calls.rentalFindMany += 1;
        calls.candidatesWhere = where;
        return [options.existingRental, options.conflict].filter(Boolean);
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
    const { tx, calls } = fakeTx({ existingRental: {
      id: 'rental-existing',
      customerId: 'customer-1',
      resource: 'FUT5',
      startTime: new Date('2026-11-14T00:00:00.000Z'),
      endTime: new Date('2026-11-14T01:00:00.000Z'),
      status: 'PENDING',
      timeConvention: 'CUIABA',
      orderItems: [],
    } });
    const result = await resolveLinkedRental(tx, input);
    assert.deepEqual(result, { id: 'rental-existing', created: false });
    assert.equal(calls.rentalFindMany, 1);
    assert.equal(calls.rentalCreate, 0);
  }

  {
    const { tx, calls } = fakeTx();
    const result = await resolveLinkedRental(tx, input);
    assert.deepEqual(result, { id: 'rental-new', created: true });
    assert.equal(calls.rentalCreate, 1);
    assert.equal(calls.lastCreate.source, 'WALK_IN');
    assert.equal(calls.lastCreate.status, 'PENDING');
    assert.equal(calls.lastCreate.timeConvention, 'CUIABA');
  }

  {
    const { tx, calls } = fakeTx({ conflict: {
      id: 'rental-conflict',
      customerId: 'other',
      resource: 'FUT5',
      startTime: new Date('2026-11-14T00:00:00.000Z'),
      endTime: new Date('2026-11-14T01:00:00.000Z'),
      status: 'PENDING',
      timeConvention: 'CUIABA',
      orderItems: [],
    } });
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

  {
    const { tx, calls } = fakeTx();
    const result = await resolveLinkedRental(tx, { ...input, customerId: null, customerName: 'Cliente Avulso' });
    assert.deepEqual(result, { id: 'rental-new', created: true });
    assert.equal(calls.rentalCreate, 1);
  }

  console.log('rental-booking tests: OK');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
