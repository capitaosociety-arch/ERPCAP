import { prisma } from './prisma';
import { isFut5, isFut7 } from './analytics';
import {
  buildRegularOccupancy,
  type OccupancyReport,
} from './commercial-analytics';
import {
  getRentalSchedule,
  isRegularMinute,
  localMinuteOfDay,
  weekDayCuiaba,
  type RentalScheduleBlock,
  type RentalScheduleConfig,
} from './rental-schedule';
import { currentCuiabaMonth, monthRange } from './official-financials';
import { cacheWrap, invalidateCache, managementTtlMs } from './intelligence-cache';

export type PriceScenario =
  | 'maintain'
  | 'regular_idle_discount'
  | 'new_group_package'
  | 'existing_extra_bookings'
  | 'extra_dynamic_price'
  | 'temporary_promo';

export type TargetSegment = 'new_or_inactive' | 'existing_extra' | 'regular_customers' | 'all';

export interface PricingScenarioInput {
  scenario: PriceScenario;
  discountPct: number;
  priceChangePct: number;
  additionalBookings: number;
  targetSegment: TargetSegment;
  migrationRiskPct: number;
}

export interface RentalPricingInput {
  id: string;
  customerId: string;
  customerName: string;
  resource: string;
  startTime: Date;
  endTime: Date;
  totalAmount: number;
  status: string;
}

export interface PricingCustomer {
  customerId: string;
  name: string;
  bookings: number;
  paidBookings: number;
  regularBookings: number;
  extraBookings: number;
  regularMinutes: number;
  extraMinutes: number;
  regularRevenue: number;
  extraRevenue: number;
  cancellations: number;
  noShows: number;
  firstBooking: string;
  lastBooking: string;
  recurring: boolean;
  avgExtraPriceHour: number | null;
}

export interface PricingHeatRow {
  weekday: number;
  weekdayLabel: string;
  hour: number;
  field: string;
  regularBookings: number;
  extraBookings: number;
  regularHours: number;
  extraHours: number;
  regularRevenue: number;
  extraRevenue: number;
}

export interface PriceHistory {
  scope: 'regular' | 'extra';
  bookings: number;
  hours: number;
  revenue: number;
  avgPriceHour: number | null;
  minPriceHour: number | null;
  maxPriceHour: number | null;
}

export interface CannibalizationCandidate {
  customerId: string;
  name: string;
  regularBookings: number;
  extraBookings: number;
  regularRevenue: number;
  extraRevenue: number;
  risk: 'ALTO' | 'MEDIO' | 'BAIXO';
  reason: string;
}

export interface PricingOpportunity {
  id: string;
  type: 'REGULAR_IDLE' | 'EXTRA_DEMAND' | 'RECURRENCE' | 'CANNIBALIZATION';
  title: string;
  description: string;
  action: string;
  impactEstimated: number | null;
  impactLabel: string;
  confidence: 'ALTA' | 'MEDIA' | 'BAIXA';
  risk: 'ALTO' | 'MEDIO' | 'BAIXO' | 'INDETERMINADO';
  evidence: string;
  source: string[];
  premissa: string;
}

export interface PricingMonthly {
  month: string;
  bookings: number;
  hours: number;
  revenue: number;
  regularHours: number;
  extraHours: number;
}

export interface PricingReport {
  available: boolean;
  reason?: string;
  period: string;
  schedule: RentalScheduleConfig;
  occupancy: OccupancyReport;
  customers: PricingCustomer[];
  monthly: PricingMonthly[];
  heatmap: PricingHeatRow[];
  regularHistory: PriceHistory;
  extraHistory: PriceHistory;
  candidates: CannibalizationCandidate[];
  opportunities: PricingOpportunity[];
  regularCustomerCount: number;
  recurringCustomerCount: number;
  extraOnlyCustomerCount: number;
  assumptions: string[];
  limitations: string[];
  sources: string[];
}

export interface PricingScenarioResult {
  input: PricingScenarioInput;
  available: boolean;
  reason?: string;
  base: {
    regularRevenue: number;
    extraRevenue: number;
    avgRegularPriceHour: number | null;
    avgExtraPriceHour: number | null;
    avgExtraHoursPerBooking: number | null;
    regularOccupancyPct: number;
    extraHours: number;
    regularCustomers: number;
    extraCustomers: number;
  };
  projection: {
    additionalRevenue: number | null;
    revenueAtRisk: number | null;
    netPotential: number | null;
    additionalBookings: number;
    expectedHours: number | null;
    cannibalizationRisk: 'ALTO' | 'MEDIO' | 'BAIXO' | 'INDETERMINADO';
    confidence: 'ALTA' | 'MEDIA' | 'BAIXA';
    costsKnown: false;
    marginKnown: false;
  };
  assumptions: string[];
  warnings: string[];
  sources: string[];
  isProjection: true;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const weekdayLabel = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const monthKeyFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit' });
const localMonthKey = (d: Date) => monthKeyFormatter.format(d);

function classifyRental(rental: RentalPricingInput, schedule: RentalScheduleBlock[]) {
  const totalMinutes = Math.max(0, (rental.endTime.getTime() - rental.startTime.getTime()) / 60000);
  const field = rental.resource.toUpperCase();
  let regularMinutes = 0;
  let extraMinutes = 0;
  for (let t = rental.startTime.getTime(); t < rental.endTime.getTime(); t += 60000) {
    const d = new Date(t);
    if (isRegularMinute(schedule, d, field, localMinuteOfDay(d))) regularMinutes++;
    else extraMinutes++;
  }
  return { totalMinutes, regularMinutes, extraMinutes, regular: regularMinutes > 0, extra: extraMinutes > 0 };
}

function historyOf(rentals: RentalPricingInput[], schedule: RentalScheduleBlock[], scope: 'regular' | 'extra'): PriceHistory {
  const prices: number[] = [];
  let hours = 0, revenue = 0, bookings = 0;
  rentals.forEach(r => {
    if (r.status !== 'PAID') return;
    const c = classifyRental(r, schedule);
    const minutes = scope === 'regular' ? c.regularMinutes : c.extraMinutes;
    if (minutes <= 0) return;
    const h = minutes / 60;
    bookings++;
    hours += h;
    revenue += r.totalAmount * (minutes / c.totalMinutes);
    if (c.totalMinutes > 0) prices.push(r.totalAmount / (c.totalMinutes / 60));
  });
  return {
    scope,
    bookings,
    hours: round2(hours),
    revenue: round2(revenue),
    avgPriceHour: hours > 0 ? round2(revenue / hours) : null,
    minPriceHour: prices.length ? round2(Math.min(...prices)) : null,
    maxPriceHour: prices.length ? round2(Math.max(...prices)) : null,
  };
}

export function buildPricingReport(
  rentals: RentalPricingInput[],
  occupancy: OccupancyReport,
  scheduleConfig: RentalScheduleConfig,
  period: string,
  includeCustomerNames = true
): PricingReport {
  const schedule = scheduleConfig.entries.filter(e => e.isActive);
  const fieldRentals = rentals.filter(r => isFut5(r.resource) || isFut7(r.resource));
  const active = fieldRentals.filter(r => r.status !== 'CANCELED');
  if (active.length === 0) {
    return {
      available: false,
      reason: 'Não há reservas não canceladas no histórico para analisar preços.',
      period,
      schedule: scheduleConfig,
      occupancy,
      customers: [],
      monthly: [],
      heatmap: [],
      regularHistory: historyOf([], schedule, 'regular'),
      extraHistory: historyOf([], schedule, 'extra'),
      candidates: [],
      opportunities: [],
      regularCustomerCount: 0,
      recurringCustomerCount: 0,
      extraOnlyCustomerCount: 0,
      assumptions: [],
      limitations: [],
      sources: ['Rental'],
    };
  }

  const customerMap = new Map<string, PricingCustomer>();
  const heatMap = new Map<string, PricingHeatRow>();
  const monthlyMap = new Map<string, PricingMonthly>();
  fieldRentals.forEach(rental => {
    const c = classifyRental(rental, schedule);
    const effective = rental.status !== 'CANCELED';
    const revenue = rental.status === 'PAID' ? rental.totalAmount : 0;
    const regularRevenue = c.totalMinutes > 0 ? revenue * (c.regularMinutes / c.totalMinutes) : 0;
    const extraRevenue = c.totalMinutes > 0 ? revenue * (c.extraMinutes / c.totalMinutes) : 0;
    const existing = customerMap.get(rental.customerId) || {
      customerId: rental.customerId,
      name: includeCustomerNames ? rental.customerName : `Cliente ${rental.customerId.slice(-4)}`,
      bookings: 0,
      paidBookings: 0,
      regularBookings: 0,
      extraBookings: 0,
      regularMinutes: 0,
      extraMinutes: 0,
      regularRevenue: 0,
      extraRevenue: 0,
      cancellations: 0,
      noShows: 0,
      firstBooking: rental.startTime.toISOString(),
      lastBooking: rental.startTime.toISOString(),
      recurring: false,
      avgExtraPriceHour: null,
    };
    if (rental.status !== 'CANCELED') existing.bookings++;
    if (rental.status === 'PAID') existing.paidBookings++;
    if (rental.status === 'CANCELED') existing.cancellations++;
    if (rental.status === 'NO_SHOW') existing.noShows++;
    if (effective) {
      if (c.regular) existing.regularBookings++;
      if (c.extra) existing.extraBookings++;
      existing.regularMinutes += c.regularMinutes;
      existing.extraMinutes += c.extraMinutes;
      existing.regularRevenue += regularRevenue;
      existing.extraRevenue += extraRevenue;
    }
    if (rental.startTime.toISOString() < existing.firstBooking) existing.firstBooking = rental.startTime.toISOString();
    if (rental.startTime.toISOString() > existing.lastBooking) existing.lastBooking = rental.startTime.toISOString();
    existing.recurring = existing.bookings >= 2;
    customerMap.set(rental.customerId, existing);

    const duration = c.totalMinutes / 60;
    if (rental.status === 'PAID' && duration > 0) {
      const hourly = rental.totalAmount / duration;
      const prev = existing.avgExtraPriceHour;
      const extraHours = existing.extraMinutes / 60;
      if (c.extraMinutes > 0 && extraHours > 0) existing.avgExtraPriceHour = prev == null ? hourly : (prev * (extraHours - c.extraMinutes / 60) + hourly * (c.extraMinutes / 60)) / extraHours;
    }

    if (effective) {
      const weekday = weekDayCuiaba(rental.startTime);
      const hour = Math.floor(localMinuteOfDay(rental.startTime) / 60);
      const key = `${rental.resource}|${weekday}|${hour}`;
      const row = heatMap.get(key) || { weekday, weekdayLabel: weekdayLabel[weekday], hour, field: rental.resource.toUpperCase(), regularBookings: 0, extraBookings: 0, regularHours: 0, extraHours: 0, regularRevenue: 0, extraRevenue: 0 };
      if (c.regular) { row.regularBookings++; row.regularHours += c.regularMinutes / 60; row.regularRevenue += regularRevenue; }
      if (c.extra) { row.extraBookings++; row.extraHours += c.extraMinutes / 60; row.extraRevenue += extraRevenue; }
      heatMap.set(key, row);

      const month = localMonthKey(rental.startTime);
      const monthRow = monthlyMap.get(month) || { month, bookings: 0, hours: 0, revenue: 0, regularHours: 0, extraHours: 0 };
      monthRow.bookings++;
      monthRow.hours += c.totalMinutes / 60;
      monthRow.revenue += revenue;
      monthRow.regularHours += c.regularMinutes / 60;
      monthRow.extraHours += c.extraMinutes / 60;
      monthlyMap.set(month, monthRow);
    }
  });

  const customers = Array.from(customerMap.values()).sort((a, b) => (b.regularRevenue + b.extraRevenue) - (a.regularRevenue + a.extraRevenue));
  const candidates: CannibalizationCandidate[] = customers
    .filter(c => c.regularBookings > 0 && c.extraBookings > 0)
    .map(c => ({
      customerId: c.customerId,
      name: c.name,
      regularBookings: c.regularBookings,
      extraBookings: c.extraBookings,
      regularRevenue: round2(c.regularRevenue),
      extraRevenue: round2(c.extraRevenue),
      risk: (c.regularRevenue >= 1000 ? 'ALTO' : c.regularRevenue >= 300 ? 'MEDIO' : 'BAIXO') as CannibalizationCandidate['risk'],
      reason: 'Cliente possui reservas regulares e extraordinárias; pode haver substituição se receber desconto fora da grade. Não é prova de migração.',
    }))
    .sort((a, b) => b.regularRevenue - a.regularRevenue);

  const regularCustomerCount = customers.filter(c => c.regularBookings > 0).length;
  const recurringCustomerCount = customers.filter(c => c.recurring).length;
  const extraOnlyCustomerCount = customers.filter(c => c.extraBookings > 0 && c.regularBookings === 0).length;
  const regularHistory = historyOf(active, schedule, 'regular');
  const extraHistory = historyOf(active, schedule, 'extra');
  const heatmap = Array.from(heatMap.values()).sort((a, b) => a.weekday - b.weekday || a.hour - b.hour || a.field.localeCompare(b.field));
  const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  const opportunities: PricingOpportunity[] = [];
  if (occupancy.available && occupancy.overall.ocupacaoEfetivaPct < 20) {
    opportunities.push({
      id: 'regular-idle',
      type: 'REGULAR_IDLE',
      title: 'Ociosidade na grade regular',
      description: `Ocupação regular de ${occupancy.overall.ocupacaoEfetivaPct.toFixed(1)}%, com ${occupancy.overall.extraHoras || 0}h extraordinárias no período.`,
      action: 'Testar demanda adicional com grupos novos/inativos, sem desconto generalizado. Validar a elasticidade antes de qualquer mudança de preço.',
      impactEstimated: null,
      impactLabel: 'não estimado sem preço regular/custo/elasticidade',
      confidence: regularHistory.bookings === 0 ? 'BAIXA' : 'MEDIA',
      risk: 'ALTO',
      evidence: 'Oferta regular existe, mas não há histórico de preço regular suficiente; desconto pode canibalizar demanda extraordinária existente.',
      source: ['Rental'],
      premissa: 'Ocupação oficial pela grade regular; demanda adicional é hipótese, não receita realizada.',
    });
  }

  heatmap
    .filter(row => row.extraBookings > 0)
    .sort((a, b) => b.extraRevenue - a.extraRevenue)
    .slice(0, 3)
    .forEach(row => {
      opportunities.push({
        id: `extra-${row.field}-${row.weekday}-${row.hour}`,
        type: 'EXTRA_DEMAND',
        title: `Demanda extraordinária: ${row.field}, ${row.weekdayLabel} ${String(row.hour).padStart(2, '0')}h`,
        description: `${row.extraBookings} reserva(s), ${row.extraHours.toFixed(1)}h e ${row.extraRevenue.toFixed(2)} de receita paga extraordinária.`,
        action: 'Avaliar preço extraordinário e capacidade; não assumir que toda reserva é incremental.',
        impactEstimated: round2(row.extraRevenue),
        impactLabel: 'receita extraordinária realizada; não é receita incremental',
        confidence: 'MEDIA',
        risk: 'MEDIO',
        evidence: 'Preço e duração efetivamente praticados nas reservas extraordinárias.',
        source: ['Rental'],
        premissa: 'A receita já existe; aumento depende de nova demanda ou novo preço, não garantido.',
      });
    });

  if (recurringCustomerCount > 0) {
    opportunities.push({
      id: 'recurring-customers',
      type: 'RECURRENCE',
      title: 'Clientes recorrentes',
      description: `${recurringCustomerCount} cliente(s) com 2+ reservas não canceladas no histórico.`,
      action: 'Criar pacotes para grupos novos ou reativar clientes sem reserva recente; proteger clientes que já pagam horários regulares.',
      impactEstimated: null,
      impactLabel: 'sem receita incremental comprovada',
      confidence: 'MEDIA',
      risk: candidates.length > 0 ? 'ALTO' : 'INDETERMINADO',
      evidence: 'Frequência histórica por cliente; não há experimento causal de desconto.',
      source: ['Rental', 'Customer'],
      premissa: 'Recorrência não significa disposição a pagar mais nem demanda adicional.',
    });
  }

  if (candidates.length > 0) {
    opportunities.push({
      id: 'cannibalization',
      type: 'CANNIBALIZATION',
      title: 'Risco de canibalização de clientes regulares',
      description: `${candidates.length} cliente(s) possuem reservas regulares e extraordinárias.`,
      action: 'Não oferecer desconto a esses clientes sem teste controlado; priorize grupos sem histórico regular.',
      impactEstimated: round2(candidates.reduce((a, c) => a + c.regularRevenue, 0)),
      impactLabel: 'receita regular exposta; não é perda confirmada',
      confidence: 'MEDIA',
      risk: 'ALTO',
      evidence: 'Cruzamento de reservas regulares e extraordinárias por cliente.',
      source: ['Rental', 'Customer'],
      premissa: 'Presença em ambos não prova migração; requer teste/controle.',
    });
  }

  return {
    available: true,
    period,
    schedule: scheduleConfig,
    occupancy,
    customers,
    monthly,
    heatmap,
    regularHistory,
    extraHistory,
    candidates,
    opportunities,
    regularCustomerCount,
    recurringCustomerCount,
    extraOnlyCustomerCount,
    assumptions: [
      'Preço histórico usa o valor efetivamente pago dividido pela duração da reserva.',
      'Regular/extraordinário é classificado pela grade operacional vigente.',
      'Receita é rateada proporcionalmente aos minutos regulares e extraordinários.',
      'Cliente recorrente = 2+ reservas não canceladas no histórico analisado.',
    ],
    limitations: [
      'Não há histórico de tabela de preços formal; o preço praticado é o valor da reserva.',
      'Não há custo operacional de quadras para calcular margem/lucro.',
      'Não há modelo causal de elasticidade; descontos e migração são hipóteses.',
      'Presença em horário regular + extraordinário não prova canibalização.',
      regularHistory.bookings === 0 ? 'Não há reservas pagas regulares no histórico; preço regular e canibalização não podem ser estimados com confiança.' : '',
    ].filter(Boolean),
    sources: ['Rental', 'Customer'],
  };
}

export function simulatePricingScenario(report: PricingReport, input: PricingScenarioInput): PricingScenarioResult {
  const discount = Math.max(0, Math.min(100, Number(input.discountPct) || 0));
  const priceChange = Math.max(-100, Math.min(200, Number(input.priceChangePct) || 0));
  const additional = Math.max(0, Math.floor(Number(input.additionalBookings) || 0));
  const migration = Math.max(0, Math.min(100, Number(input.migrationRiskPct) || 0));
  const avgRegular = report.regularHistory.avgPriceHour;
  const avgExtra = report.extraHistory.avgPriceHour;
  const avgExtraHours = report.extraHistory.bookings > 0 ? report.extraHistory.hours / report.extraHistory.bookings : null;
  const base = {
    regularRevenue: report.occupancy.available ? report.occupancy.overall.receitaRealizada : report.regularHistory.revenue,
    extraRevenue: report.occupancy.available ? report.occupancy.overall.extraReceita || 0 : report.extraHistory.revenue,
    avgRegularPriceHour: avgRegular,
    avgExtraPriceHour: avgExtra,
    avgExtraHoursPerBooking: avgExtraHours != null ? round2(avgExtraHours) : null,
    regularOccupancyPct: report.occupancy.available ? report.occupancy.overall.ocupacaoEfetivaPct : 0,
    extraHours: report.occupancy.available ? report.occupancy.overall.extraHoras || 0 : 0,
    regularCustomers: report.regularCustomerCount,
    extraCustomers: report.extraOnlyCustomerCount,
  };
  const warnings: string[] = [];
  let available = true;
  let reason: string | undefined;
  let additionalRevenue: number | null = null;
  let expectedHours: number | null = null;
  let confidence: 'ALTA' | 'MEDIA' | 'BAIXA' = 'BAIXA';
  let cannibalizationRisk: 'ALTO' | 'MEDIO' | 'BAIXO' | 'INDETERMINADO' = 'INDETERMINADO';
  let revenueAtRisk: number | null = null;

  if (input.scenario === 'maintain') {
    additionalRevenue = 0;
    expectedHours = 0;
    confidence = 'ALTA';
    cannibalizationRisk = 'BAIXO';
  } else if (input.scenario === 'extra_dynamic_price') {
    additionalRevenue = round2(base.extraRevenue * (priceChange / 100));
    expectedHours = base.extraHours;
    confidence = 'MEDIA';
    cannibalizationRisk = 'BAIXO';
    warnings.push('Variação de preço extraordinário assume demanda constante; queda de demanda não é estimada.');
  } else if (input.scenario === 'regular_idle_discount') {
    if (avgRegular == null || base.regularRevenue <= 0) {
      available = false;
      reason = 'Não há preço/receita regular histórica suficiente para simular desconto na grade regular.';
    } else {
      additionalRevenue = round2(additional * avgRegular * (1 - discount / 100));
      expectedHours = avgExtraHours != null ? round2(additional * avgExtraHours) : null;
      revenueAtRisk = input.targetSegment === 'regular_customers' || input.targetSegment === 'all'
        ? round2(base.regularRevenue * (migration / 100))
        : 0;
      confidence = 'BAIXA';
      cannibalizationRisk = input.targetSegment === 'new_or_inactive' ? 'BAIXO' : input.targetSegment === 'regular_customers' ? 'ALTO' : 'MEDIO';
      warnings.push('O desconto na grade regular pode reduzir receita existente; a demanda adicional é uma hipótese informada pelo usuário.');
    }
  } else {
    if (avgExtra == null || avgExtraHours == null) {
      available = false;
      reason = 'Não há preço/duração extraordinária histórica suficiente para simular este cenário.';
    } else {
      const discountedPrice = avgExtra * (1 - discount / 100) * (1 + priceChange / 100);
      additionalRevenue = round2(additional * avgExtraHours * discountedPrice);
      expectedHours = round2(additional * avgExtraHours);
      revenueAtRisk = input.targetSegment === 'regular_customers' || input.targetSegment === 'all'
        ? round2(base.regularRevenue * (migration / 100))
        : 0;
      confidence = input.targetSegment === 'new_or_inactive' ? 'BAIXA' : 'MEDIA';
      cannibalizationRisk = input.targetSegment === 'new_or_inactive' ? 'BAIXO' : input.targetSegment === 'regular_customers' ? 'ALTO' : 'MEDIO';
      warnings.push('Receita adicional é projeção; novas reservas não são garantidas. Nenhum preço ou reserva foi alterado.');
      if (input.scenario === 'temporary_promo') warnings.push('Promoção temporária exige controle de vigência e monitoramento de migração.');
      if (input.scenario === 'existing_extra_bookings') warnings.push('Reservas adicionais de clientes existentes podem ser extensão de demanda ou substituição; requer validação.');
    }
  }

  const netPotential = additionalRevenue != null && revenueAtRisk != null ? round2(additionalRevenue - revenueAtRisk) : null;
  if (report.regularHistory.bookings === 0) warnings.push('Não há reservas regulares pagas no histórico; cálculos de canibalização regular são indeterminados.');

  return {
    input: { ...input, discountPct: discount, priceChangePct: priceChange, additionalBookings: additional, migrationRiskPct: migration },
    available,
    reason,
    base,
    projection: {
      additionalRevenue,
      revenueAtRisk,
      netPotential,
      additionalBookings: additional,
      expectedHours,
      cannibalizationRisk,
      confidence,
      costsKnown: false,
      marginKnown: false,
    },
    assumptions: [
      'Projeção consultiva; não é receita realizada nem garantia.',
      'Preço médio e duração média vêm das reservas históricas pagas.',
      `Desconto simulado: ${discount.toFixed(1)}%; variação de preço: ${priceChange.toFixed(1)}%.`,
      `Migração hipotética informada: ${migration.toFixed(1)}% da receita regular em risco.`,
      'Custo operacional de quadras não conhecido; margem não calculada.',
    ],
    warnings,
    sources: ['Rental', 'Customer'],
    isProjection: true,
  };
}

export async function getPricingReport(period: string, includeCustomerNames = true): Promise<PricingReport> {
  const range = monthRange(period, { capToToday: true });
  const [schedule, rentals] = await Promise.all([
    getRentalSchedule(),
    prisma.rental.findMany({
      where: { startTime: { lte: range.to } },
      select: { id: true, customerId: true, resource: true, startTime: true, endTime: true, totalAmount: true, status: true, source: true, customer: { select: { name: true } } },
      orderBy: { startTime: 'asc' },
    }),
  ]);
  const occupancy = buildRegularOccupancy(
    rentals
      .filter(r => r.startTime < range.to && r.endTime > range.from && r.status !== 'CANCELED')
      .map(r => ({ resource: r.resource, startTime: r.startTime, endTime: r.endTime, totalAmount: r.totalAmount, status: r.status, source: r.source })),
    range.from,
    range.to,
    schedule
  );
  return buildPricingReport(
    rentals.map(r => ({ id: r.id, customerId: r.customerId, customerName: r.customer.name, resource: r.resource, startTime: r.startTime, endTime: r.endTime, totalAmount: r.totalAmount, status: r.status, source: r.source })),
    occupancy,
    schedule,
    period,
    includeCustomerNames
  );
}

export async function getPricingReportCached(
  period: string,
  includeCustomerNames = true,
  forceRefresh = false
): Promise<PricingReport> {
  if (forceRefresh) invalidateCache('pricing-report:');
  const key = `pricing-report:${period}:${includeCustomerNames ? 'names' : 'redacted'}`;
  return cacheWrap(key, managementTtlMs(period, currentCuiabaMonth()), () => getPricingReport(period, includeCustomerNames));
}
