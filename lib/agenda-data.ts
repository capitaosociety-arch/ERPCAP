import { prisma } from './prisma';
import { formatRentalDateInput } from './rental-time';
import { getRentalSchedule } from './rental-schedule';
import {
  DEFAULT_AGENDA_FILTERS,
  buildAgendaData,
  getAgendaRange,
  isAgendaDateKey,
  isAgendaFieldRentalName,
  normalizeAgendaField,
  type AgendaCustomerOption,
  type AgendaData,
  type AgendaField,
  type AgendaFilters,
  type AgendaRentalInput,
  type AgendaSchedule,
  type AgendaUnlinkedItemInput,
  type AgendaView,
} from './agenda';

export type AgendaDataParams = {
  view?: AgendaView;
  anchor?: string;
  filters?: Partial<AgendaFilters>;
};

function normalizeView(value: unknown): AgendaView {
  return value === 'week' || value === 'month' ? value : 'day';
}

function normalizeFilters(input: Partial<AgendaFilters> | undefined): AgendaFilters {
  const filters = { ...DEFAULT_AGENDA_FILTERS, ...(input || {}) };
  const field = filters.field === 'FUT5' || filters.field === 'FUT7' ? filters.field : 'ALL';
  const customerType = ['MENSALISTA', 'AVULSO'].includes(filters.customerType) ? filters.customerType : 'ALL';
  const financial = ['PAID', 'PARTIAL', 'PENDING', 'CANCELED', 'UNPROVEN'].includes(filters.financial) ? filters.financial : 'ALL';
  const operational = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELED'].includes(filters.operational) ? filters.operational : 'ALL';
  const source = ['SUBSCRIPTION', 'WALK_IN', 'MANUAL', 'LEGACY'].includes(filters.source) ? filters.source : 'ALL';
  return {
    field,
    customerId: String(filters.customerId || ''),
    customerType,
    financial,
    operational,
    source,
  };
}

function fieldFromName(name: string): AgendaField | null {
  if (/fut\s*7|fut7|futebol\s*7/i.test(name)) return 'FUT7';
  if (/fut\s*5|fut5|futebol\s*5/i.test(name)) return 'FUT5';
  return null;
}

export async function loadAgendaData(params: AgendaDataParams = {}): Promise<AgendaData> {
  const view = normalizeView(params.view);
  const anchor = isAgendaDateKey(String(params.anchor || '')) ? String(params.anchor) : formatRentalDateInput(new Date());
  const filters = normalizeFilters(params.filters);
  const range = getAgendaRange(view, anchor);
  const from = new Date(range.from);
  const to = new Date(range.to);

  const rentalWhere: any = {
    startTime: { lt: to },
    endTime: { gt: from },
  };
  if (filters.customerId) rentalWhere.customerId = filters.customerId;
  if (filters.source !== 'ALL') rentalWhere.source = filters.source;

  const [rentals, customers, scheduleConfig, unlinkedRaw] = await Promise.all([
    prisma.rental.findMany({
      where: rentalWhere,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            subscription: { select: { isActive: true } },
          },
        },
        orderItems: {
          include: {
            product: { select: { name: true } },
            service: { select: { name: true } },
            order: {
              select: {
                id: true,
                status: true,
                total: true,
                discount: true,
                notes: true,
                openedAt: true,
                closedAt: true,
                customerId: true,
                payments: {
                  select: {
                    id: true,
                    amount: true,
                    method: true,
                    date: true,
                    cashRegister: {
                      select: {
                        id: true,
                        status: true,
                        openedAt: true,
                        closedAt: true,
                      },
                    },
                  },
                },
                items: {
                  where: { status: 'ACTIVE' },
                  select: {
                    id: true,
                    subtotal: true,
                    rentalId: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    }),
    prisma.customer.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    getRentalSchedule(),
    prisma.orderItem.findMany({
      where: {
        status: 'ACTIVE',
        rentalId: null,
        AND: [
          {
            order: {
              OR: [
                { closedAt: { gte: from, lt: to } },
                { closedAt: null, openedAt: { gte: from, lt: to } },
              ],
            },
          },
          {
            OR: [
              { product: { name: { contains: 'fut', mode: 'insensitive' } } },
              { product: { name: { contains: 'aluguel', mode: 'insensitive' } } },
              { product: { name: { contains: 'campo', mode: 'insensitive' } } },
              { service: { name: { contains: 'aluguel', mode: 'insensitive' } } },
              { service: { name: { contains: 'campo', mode: 'insensitive' } } },
            ],
          },
        ],
      },
      select: {
        id: true,
        orderId: true,
        subtotal: true,
        product: { select: { name: true } },
        service: { select: { name: true } },
        order: {
          select: {
            id: true,
            status: true,
            notes: true,
            openedAt: true,
            closedAt: true,
            customerId: true,
          },
        },
      },
      orderBy: { id: 'desc' },
      take: 1000,
    }),
  ]);

  const rentalInputs: AgendaRentalInput[] = rentals.map((rental) => ({
    id: rental.id,
    customerId: rental.customerId,
    customerName: rental.customer?.name || '',
    customerPhone: rental.customer?.phone || null,
    isSubscriber: rental.customer?.subscription?.isActive === true,
    resource: rental.resource,
    startTime: rental.startTime.toISOString(),
    endTime: rental.endTime.toISOString(),
    totalAmount: Number(rental.totalAmount) || 0,
    status: rental.status,
    source: rental.source || 'LEGACY',
    cancelledAt: rental.cancelledAt ? rental.cancelledAt.toISOString() : null,
    createdAt: rental.createdAt.toISOString(),
    orderItems: (rental.orderItems || []).map((item) => ({
      id: item.id,
      status: item.status,
      subtotal: Number(item.subtotal) || 0,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      productName: item.product?.name || null,
      serviceName: item.service?.name || null,
      order: {
        id: item.order.id,
        status: item.order.status,
        total: Number(item.order.total) || 0,
        discount: Number(item.order.discount) || 0,
        notes: item.order.notes || null,
        openedAt: item.order.openedAt.toISOString(),
        closedAt: item.order.closedAt ? item.order.closedAt.toISOString() : null,
        customerId: item.order.customerId || null,
        payments: (item.order.payments || []).map((payment) => ({
          id: payment.id,
          amount: Number(payment.amount) || 0,
          method: payment.method,
          date: payment.date.toISOString(),
          cashRegister: payment.cashRegister ? {
            id: payment.cashRegister.id,
            status: payment.cashRegister.status,
            openedAt: payment.cashRegister.openedAt.toISOString(),
            closedAt: payment.cashRegister.closedAt ? payment.cashRegister.closedAt.toISOString() : null,
          } : null,
        })),
        items: (item.order.items || []).map((orderItem) => ({
          id: orderItem.id,
          subtotal: Number(orderItem.subtotal) || 0,
          rentalId: orderItem.rentalId || null,
        })),
      },
    })),
  }));

  const unlinkedItems: AgendaUnlinkedItemInput[] = unlinkedRaw
    .map((item) => {
      const name = item.product?.name || item.service?.name || '';
      return {
        id: item.id,
        orderId: item.orderId,
        orderStatus: item.order.status,
        orderNotes: item.order.notes || null,
        orderDate: (item.order.closedAt || item.order.openedAt).toISOString(),
        customerId: item.order.customerId || null,
        name,
        subtotal: Number(item.subtotal) || 0,
        field: fieldFromName(name),
      };
    })
    .filter((item) => isAgendaFieldRentalName(item.name));

  const schedule: AgendaSchedule = {
    entries: (scheduleConfig.entries || []).map((entry) => ({
      weekday: entry.weekday,
      field: normalizeAgendaField(entry.field) || entry.field,
      startMinute: entry.startMinute,
      endMinute: entry.endMinute,
      demandWeight: entry.demandWeight,
      isActive: entry.isActive,
    })),
    source: scheduleConfig.source,
    note: scheduleConfig.note,
  };

  const customerOptions: AgendaCustomerOption[] = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
  }));

  return buildAgendaData({
    view,
    anchor,
    filters,
    rentals: rentalInputs,
    unlinkedItems,
    customers: customerOptions,
    schedule,
  });
}
