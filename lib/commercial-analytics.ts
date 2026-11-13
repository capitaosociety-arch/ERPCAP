import { prisma } from './prisma';
import { isFut5, isFut7, isRentalItem, round2 } from './analytics';
import { evaluateCmvMovement } from './financial-cmv';
import { isNewRulesDate } from './effective-rules';
import {
  getRentalSchedule,
  isRegularMinute,
  localMinuteOfDay,
  regularMinutesForDay,
  weekDayCuiaba,
  type RentalScheduleConfig,
} from './rental-schedule';

const dayMs = 24 * 60 * 60 * 1000;
const round1 = (n: number) => Math.round((n || 0) * 10) / 10;
const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Cuiaba',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const hourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Cuiaba',
  hour: '2-digit',
  hour12: false,
});
const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Cuiaba',
  weekday: 'long',
});
const localDate = (d: Date) => dateFormatter.format(d);
const localHour = (d: Date) => Number(hourFormatter.format(d));
const localWeekday = (d: Date) => {
  const raw = weekdayFormatter.format(d);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

export interface RentalInput {
  resource: string;
  startTime: Date;
  endTime: Date;
  totalAmount: number;
  status: string;
  source?: string;
}

export interface OccupancyConfig {
  openHour: number;
  closeHour: number;
  source: 'env' | 'default';
  note: string;
}

export interface OrderItemInput {
  id: string;
  productId: string | null;
  serviceId: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  status: string;
  product?: { name: string; price: number; cost: number; isService?: boolean; stockControlled?: boolean; category?: { name: string } | null } | null;
  service?: { name: string } | null;
}

export interface OrderInput {
  id: string;
  total: number;
  discount: number;
  closedAt: Date | null;
  items: OrderItemInput[];
}

export interface MovementInput {
  productId: string;
  quantity: number;
  unitCost: number | null;
  type: string;
  movementKind: string | null;
  date: Date;
  product?: { name: string; price: number; cost: number; isService?: boolean; stockControlled?: boolean; category?: { name: string } | null } | null;
}

export function getOccupancyConfig(env: NodeJS.ProcessEnv = process.env): OccupancyConfig {
  const rawOpen = Number(env.RENTAL_OPEN_HOUR || 8);
  const rawClose = Number(env.RENTAL_CLOSE_HOUR || 24);
  const openHour = Number.isFinite(rawOpen) && rawOpen >= 0 && rawOpen < 24 ? Math.floor(rawOpen) : 8;
  const closeHour = Number.isFinite(rawClose) && rawClose > openHour && rawClose <= 24 ? Math.floor(rawClose) : 24;
  const source = env.RENTAL_OPEN_HOUR || env.RENTAL_CLOSE_HOUR ? 'env' : 'default';
  return {
    openHour,
    closeHour,
    source,
    note: source === 'env'
      ? `Janela operacional configurada por ambiente: ${openHour}h–${closeHour}h.`
      : `Premissa padrão de ${closeHour - openHour}h/dia por campo (${openHour}h–${closeHour}h). Configure RENTAL_OPEN_HOUR/RENTAL_CLOSE_HOUR para a janela real.`,
  };
}

function dateKeys(from: Date, to: Date): string[] {
  const start = new Date(`${localDate(from)}T00:00:00-04:00`);
  const end = new Date(`${localDate(to)}T00:00:00-04:00`);
  const keys: string[] = [];
  for (let t = start; t <= end; t = new Date(t.getTime() + dayMs)) keys.push(localDate(t));
  return keys;
}

function isField(resource: string): boolean {
  return isFut5(resource) || isFut7(resource);
}

export interface OccupancyHourRow {
  hora: number;
  disponivelMin: number;
  efetivoMin: number;
  reservadoMin: number;
  noShowMin: number;
  ocupacaoEfetivaPct: number;
  ocupacaoReservadaPct: number;
  receitaRealizada: number;
}

export interface OccupancyDayRow {
  data: string;
  diaSemana: string;
  capacidadeMin: number;
  efetivoMin: number;
  reservadoMin: number;
  noShowMin: number;
  ocupacaoEfetivaPct: number;
  ocupacaoReservadaPct: number;
  receitaRealizada: number;
}

export interface OccupancyExtraHour {
  hora: number;
  horas: number;
  receita: number;
}

export interface OccupancyFieldSummary {
  campo: string;
  reservas: number;
  capacidadeHoras: number;
  efetivoHoras: number;
  reservadoHoras: number;
  noShowHoras: number;
  ocupacaoEfetivaPct: number;
  ocupacaoReservadaPct: number;
  receitaRealizada: number;
  receitaAgenda: number;
  receitaPorHoraEfetiva: number | null;
  extraHoras?: number;
  extraReceita?: number;
  extraReservas?: number;
  extraPorHora?: OccupancyExtraHour[];
  porDia: OccupancyDayRow[];
  porHora: OccupancyHourRow[];
}

export interface OccupancyOpportunity {
  campo: string;
  hora: number;
  diaSemana?: string;
  horasOciosas: number;
  receitaMediaPorHora: number | null;
  potencialEstimado: number | null;
  estimativa: true;
  premissa: string;
  demandWeight?: number;
}

export interface OccupancySourceBreakdown {
  source: string;
  reservedHours: number;
  effectiveHours: number;
  count: number;
}

export interface OccupancyReport {
  available: boolean;
  reason?: string;
  config: OccupancyConfig;
  days: number;
  fields: OccupancyFieldSummary[];
  overall: {
    capacidadeHoras: number;
    efetivoHoras: number;
    reservadoHoras: number;
    noShowHoras: number;
    ocupacaoEfetivaPct: number;
    ocupacaoReservadaPct: number;
    receitaRealizada: number;
    receitaAgenda: number;
    receitaPorHoraEfetiva: number | null;
    extraHoras?: number;
    extraReceita?: number;
    extraReservas?: number;
    bySource?: OccupancySourceBreakdown[];
  };
  schedule?: RentalScheduleConfig;
  opportunities: OccupancyOpportunity[];
  source: ['Rental'];
}

export function buildOccupancy(rentals: RentalInput[], from: Date, to: Date, config: OccupancyConfig): OccupancyReport {
  const days = dateKeys(from, to);
  const daySet = new Set(days);
  const fieldNames = Array.from(new Set(rentals.map(r => r.resource).filter(isField))).sort();
  if (fieldNames.length === 0) {
    return {
      available: false,
      reason: 'Não há reservas de quadras (FUT5/FUT7) no período.',
      config,
      days: days.length,
      fields: [],
      overall: { capacidadeHoras: 0, efetivoHoras: 0, reservadoHoras: 0, noShowHoras: 0, ocupacaoEfetivaPct: 0, ocupacaoReservadaPct: 0, receitaRealizada: 0, receitaAgenda: 0, receitaPorHoraEfetiva: null },
      opportunities: [],
      source: ['Rental'],
    };
  }

  const capacityMinutes = Math.max(0, (config.closeHour - config.openHour) * 60);
  const byDay = new Map<string, OccupancyDayRow & { field: string }>();
  const byHour = new Map<string, OccupancyHourRow & { field: string }>();
  const fieldAgg = new Map<string, { effective: number; reserved: number; noShow: number; revenue: number; agendaRevenue: number; count: number }>();

  fieldNames.forEach(field => {
    fieldAgg.set(field, { effective: 0, reserved: 0, noShow: 0, revenue: 0, agendaRevenue: 0, count: 0 });
    days.forEach(day => {
      byDay.set(`${field}|${day}`, {
        field,
        data: day,
        diaSemana: localWeekday(new Date(`${day}T12:00:00-04:00`)),
        capacidadeMin: capacityMinutes,
        efetivoMin: 0,
        reservadoMin: 0,
        noShowMin: 0,
        ocupacaoEfetivaPct: 0,
        ocupacaoReservadaPct: 0,
        receitaRealizada: 0,
      });
    });
    for (let hour = config.openHour; hour < config.closeHour; hour++) {
      byHour.set(`${field}|${hour}`, {
        field,
        hora: hour,
        disponivelMin: days.length * 60,
        efetivoMin: 0,
        reservadoMin: 0,
        noShowMin: 0,
        ocupacaoEfetivaPct: 0,
        ocupacaoReservadaPct: 0,
        receitaRealizada: 0,
      });
    }
  });

  rentals.forEach(rental => {
    if (!fieldNames.includes(rental.resource) || rental.status === 'CANCELED' || rental.endTime <= rental.startTime) return;
    const totalMinutes = (rental.endTime.getTime() - rental.startTime.getTime()) / 60000;
    if (totalMinutes <= 0) return;
    const fieldStats = fieldAgg.get(rental.resource)!;
    fieldStats.count++;
    const amountPerMinute = rental.status === 'PAID' ? rental.totalAmount / totalMinutes : 0;
    const agendaPerMinute = rental.totalAmount / totalMinutes;
    const stepMs = 15 * 60 * 1000;
    for (let t = rental.startTime.getTime(); t < rental.endTime.getTime(); t += stepMs) {
      const end = Math.min(t + stepMs, rental.endTime.getTime());
      const minutes = (end - t) / 60000;
      const d = new Date(t);
      const day = localDate(d);
      const hour = localHour(d);
      if (!daySet.has(day) || hour < config.openHour || hour >= config.closeHour) continue;
      const dayKey = `${rental.resource}|${day}`;
      const hourKey = `${rental.resource}|${hour}`;
      const dayRow = byDay.get(dayKey);
      const hourRow = byHour.get(hourKey);
      const agg = fieldAgg.get(rental.resource)!;
      const effective = rental.status === 'PAID' || rental.status === 'CONFIRMED';
      const noShow = rental.status === 'NO_SHOW';
      if (dayRow) {
        dayRow.reservadoMin += minutes;
        if (effective) dayRow.efetivoMin += minutes;
        if (noShow) dayRow.noShowMin += minutes;
        if (rental.status === 'PAID') dayRow.receitaRealizada += amountPerMinute * minutes;
      }
      if (hourRow) {
        hourRow.reservadoMin += minutes;
        if (effective) hourRow.efetivoMin += minutes;
        if (noShow) hourRow.noShowMin += minutes;
        if (rental.status === 'PAID') hourRow.receitaRealizada += amountPerMinute * minutes;
      }
      agg.reserved += minutes;
      if (effective) agg.effective += minutes;
      if (noShow) agg.noShow += minutes;
      if (rental.status === 'PAID') agg.revenue += amountPerMinute * minutes;
      agg.agendaRevenue += agendaPerMinute * minutes;
    }
  });

  const fields: OccupancyFieldSummary[] = fieldNames.map(field => {
    const agg = fieldAgg.get(field)!;
    const fieldDays = Array.from(byDay.values()).filter(r => r.field === field).map(r => {
      const pct = r.capacidadeMin > 0 ? round1((r.efetivoMin / r.capacidadeMin) * 100) : 0;
      const reservedPct = r.capacidadeMin > 0 ? round1((r.reservadoMin / r.capacidadeMin) * 100) : 0;
      return { ...r, capacidadeMin: round2(r.capacidadeMin), efetivoMin: round2(r.efetivoMin), reservadoMin: round2(r.reservadoMin), noShowMin: round2(r.noShowMin), receitaRealizada: round2(r.receitaRealizada), ocupacaoEfetivaPct: pct, ocupacaoReservadaPct: reservedPct };
    });
    const fieldHours = Array.from(byHour.values()).filter(r => r.field === field).map(r => {
      const pct = r.disponivelMin > 0 ? round1((r.efetivoMin / r.disponivelMin) * 100) : 0;
      const reservedPct = r.disponivelMin > 0 ? round1((r.reservadoMin / r.disponivelMin) * 100) : 0;
      return { ...r, disponivelMin: round2(r.disponivelMin), efetivoMin: round2(r.efetivoMin), reservadoMin: round2(r.reservadoMin), noShowMin: round2(r.noShowMin), receitaRealizada: round2(r.receitaRealizada), ocupacaoEfetivaPct: pct, ocupacaoReservadaPct: reservedPct };
    });
    const capacity = fieldDays.reduce((a, r) => a + r.capacidadeMin, 0);
    const effective = fieldDays.reduce((a, r) => a + r.efetivoMin, 0);
    const reserved = fieldDays.reduce((a, r) => a + r.reservadoMin, 0);
    return {
      campo: field,
      reservas: agg.count,
      capacidadeHoras: round2(capacity / 60),
      efetivoHoras: round2(effective / 60),
      reservadoHoras: round2(reserved / 60),
      noShowHoras: round2(agg.noShow / 60),
      ocupacaoEfetivaPct: capacity > 0 ? round1((effective / capacity) * 100) : 0,
      ocupacaoReservadaPct: capacity > 0 ? round1((reserved / capacity) * 100) : 0,
      receitaRealizada: round2(agg.revenue),
      receitaAgenda: round2(agg.agendaRevenue),
      receitaPorHoraEfetiva: effective > 0 ? round2(agg.revenue / (effective / 60)) : null,
      porDia: fieldDays,
      porHora: fieldHours,
    };
  });

  const totalCapacity = fields.reduce((a, f) => a + f.capacidadeHoras, 0) * 60;
  const totalEffective = fields.reduce((a, f) => a + f.efetivoHoras, 0) * 60;
  const totalReserved = fields.reduce((a, f) => a + f.reservadoHoras, 0) * 60;
  const totalRevenue = fields.reduce((a, f) => a + f.receitaRealizada, 0);
  const totalAgenda = fields.reduce((a, f) => a + f.receitaAgenda, 0);

  const opportunities: OccupancyOpportunity[] = [];
  fields.forEach(field => {
    field.porHora.forEach(hour => {
      if (hour.ocupacaoEfetivaPct >= 30) return;
      const idleHours = Math.max(0, (hour.disponivelMin - hour.efetivoMin) / 60);
      if (idleHours <= 0) return;
      const avg = field.receitaPorHoraEfetiva;
      opportunities.push({
        campo: field.campo,
        hora: hour.hora,
        horasOciosas: round2(idleHours),
        receitaMediaPorHora: avg,
        potencialEstimado: avg != null ? round2(idleHours * avg) : null,
        estimativa: true,
        premissa: `Estimativa baseada na receita média por hora efetiva de ${field.campo}; não é receita realizada.`,
      });
    });
  });
  opportunities.sort((a, b) => (b.potencialEstimado || 0) - (a.potencialEstimado || 0));

  return {
    available: true,
    config,
    days: days.length,
    fields,
    overall: {
      capacidadeHoras: round2(totalCapacity / 60),
      efetivoHoras: round2(totalEffective / 60),
      reservadoHoras: round2(totalReserved / 60),
      noShowHoras: round2(fields.reduce((a, f) => a + f.noShowHoras, 0)),
      ocupacaoEfetivaPct: totalCapacity > 0 ? round1((totalEffective / totalCapacity) * 100) : 0,
      ocupacaoReservadaPct: totalCapacity > 0 ? round1((totalReserved / totalCapacity) * 100) : 0,
      receitaRealizada: round2(totalRevenue),
      receitaAgenda: round2(totalAgenda),
      receitaPorHoraEfetiva: totalEffective > 0 ? round2(totalRevenue / (totalEffective / 60)) : null,
    },
    opportunities: opportunities.slice(0, 12),
    source: ['Rental'],
  };
}

export interface ProductContributionRow {
  produto: string;
  productId: string;
  quantidadeVendida: number;
  receitaLiquida: number;
  cmv: number;
  margemContribuicao: number | null;
  margemPct: number | null;
  quantidadeMovimentada: number;
  diferencaQuantidade: number;
  custoIncompleto: boolean;
  quantidadeSemCusto: number;
}

export interface ProductContributionReport {
  available: boolean;
  reason?: string;
  produtoReceitaLiquida: number;
  cmvTotal: number;
  margemContribuicaoTotal: number | null;
  margemPct: number | null;
  custoIncompleto: boolean;
  produtos: ProductContributionRow[];
  menoresMargens: ProductContributionRow[];
  source: ['OrderItem', 'StockMovement'];
  note: string;
}

export function buildProductContribution(orders: OrderInput[], movements: MovementInput[]): ProductContributionReport {
  const movementByProduct = new Map<string, { qty: number; cost: number; uncosted: number; name: string }>();
  movements.forEach(m => {
    const useNewRules = isNewRulesDate(m.date);
    if (!m.productId || isRentalItem({ product: m.product }, { useNewRules })) return;
    const a = movementByProduct.get(m.productId) || { qty: 0, cost: 0, uncosted: 0, name: m.product?.name || 'ââ‚¬”' };
    const sign = m.movementKind === 'RETURN' ? -1 : 1;
    const evaluation = evaluateCmvMovement(m);
    a.qty += sign * Number(m.quantity || 0);
    if (evaluation.uncosted) a.uncosted += sign * Number(m.quantity || 0);
    else a.cost += sign * evaluation.value;
    movementByProduct.set(m.productId, a);
  });

  const map = new Map<string, ProductContributionRow>();
  orders.forEach(order => {
    const useNewRules = isNewRulesDate(order.closedAt);
    const active = order.items.filter(i => i.status === 'ACTIVE' && i.productId && i.product);
    const gross = active.reduce((a, i) => a + i.subtotal, 0);
    active.forEach(item => {
      if (isRentalItem(item, { useNewRules })) return;
      const product = item.product!;
      const discount = gross > 0 ? order.discount * (item.subtotal / gross) : 0;
      const net = item.subtotal - discount;
      const row = map.get(item.productId!) || {
        produto: product.name,
        productId: item.productId!,
        quantidadeVendida: 0,
        receitaLiquida: 0,
        cmv: 0,
        margemContribuicao: null,
        margemPct: null,
        quantidadeMovimentada: 0,
        diferencaQuantidade: 0,
        custoIncompleto: false,
        quantidadeSemCusto: 0,
      };
      row.quantidadeVendida += item.quantity;
      row.receitaLiquida += net;
      map.set(item.productId!, row);
    });
  });

  const rows = Array.from(map.values()).map(row => {
    const mov = movementByProduct.get(row.productId);
    const movementQty = mov?.qty || 0;
    const cmv = mov?.cost || 0;
    const uncosted = mov?.uncosted || 0;
    const incomplete = uncosted > 0 || movementQty + 0.0001 < row.quantidadeVendida;
    const contribution = incomplete ? null : row.receitaLiquida - cmv;
    return {
      ...row,
      quantidadeVendida: round2(row.quantidadeVendida),
      receitaLiquida: round2(row.receitaLiquida),
      cmv: round2(cmv),
      margemContribuicao: contribution == null ? null : round2(contribution),
      margemPct: contribution != null && row.receitaLiquida > 0 ? round1((contribution / row.receitaLiquida) * 100) : null,
      quantidadeMovimentada: round2(movementQty),
      diferencaQuantidade: round2(row.quantidadeVendida - movementQty),
      custoIncompleto: incomplete,
      quantidadeSemCusto: round2(Math.max(0, uncosted)),
    };
  }).sort((a, b) => (b.margemContribuicao ?? -Infinity) - (a.margemContribuicao ?? -Infinity));

  if (rows.length === 0) {
    return {
      available: false,
      reason: 'Não há vendas de produtos com produto vinculado no período.',
      produtoReceitaLiquida: 0,
      cmvTotal: 0,
      margemContribuicaoTotal: null,
      margemPct: null,
      custoIncompleto: false,
      produtos: [],
      menoresMargens: [],
      source: ['OrderItem', 'StockMovement'],
      note: 'Vendas de aluguel de quadra não entram na margem de produtos.',
    };
  }

  const complete = rows.every(r => !r.custoIncompleto);
  const revenue = rows.reduce((a, r) => a + r.receitaLiquida, 0);
  const cmv = rows.reduce((a, r) => a + r.cmv, 0);
  const contribution = complete ? revenue - cmv : null;

  return {
    available: true,
    produtoReceitaLiquida: round2(revenue),
    cmvTotal: round2(cmv),
    margemContribuicaoTotal: contribution == null ? null : round2(contribution),
    margemPct: contribution != null && revenue > 0 ? round1((contribution / revenue) * 100) : null,
    custoIncompleto: !complete,
    produtos: rows,
    menoresMargens: [...rows].filter(r => r.margemPct != null).sort((a, b) => (a.margemPct || 0) - (b.margemPct || 0)).slice(0, 10),
    source: ['OrderItem', 'StockMovement'],
    note: 'Comandas fechadas no período (closedAt): receita líquida = subtotal dos itens menos desconto rateado. CMV usa o custo snapshot da saída de estoque; se faltar custo ou quantidade, a margem do produto fica indisponível. Serviços/aluguel são separados.',
  };
}

export interface RevenueMixReport {
  available: boolean;
  reason?: string;
  aluguelComandas: number;
  produtosComandas: number;
  descontoTotal: number;
  totalComandas: number;
  agendaAluguel: {
    total: number;
    pago: number;
    pendente: number;
    confirmado: number;
    noShow: number;
    reservas: number;
  };
  note: string;
}

export function buildRevenueMix(orders: OrderInput[], rentals: RentalInput[]): RevenueMixReport {
  let rentalRevenue = 0;
  let productRevenue = 0;
  let discountTotal = 0;
  orders.forEach(order => {
    const useNewRules = isNewRulesDate(order.closedAt);
    const active = order.items.filter(i => i.status === 'ACTIVE');
    const gross = active.reduce((a, i) => a + i.subtotal, 0);
    discountTotal += order.discount;
    active.forEach(item => {
      const discount = gross > 0 ? order.discount * (item.subtotal / gross) : 0;
      if (isRentalItem(item, { useNewRules })) rentalRevenue += item.subtotal - discount;
      else productRevenue += item.subtotal - discount;
    });
  });
  const agenda = { total: 0, pago: 0, pendente: 0, confirmado: 0, noShow: 0, reservas: 0 };
  rentals.forEach(r => {
    if (r.status === 'CANCELED') return;
    agenda.reservas++;
    agenda.total += r.totalAmount;
    if (r.status === 'PAID') agenda.pago += r.totalAmount;
    else if (r.status === 'PENDING') agenda.pendente += r.totalAmount;
    else if (r.status === 'CONFIRMED') agenda.confirmado += r.totalAmount;
    else if (r.status === 'NO_SHOW') agenda.noShow += r.totalAmount;
  });
  const available = orders.length > 0 || rentals.length > 0;
  return {
    available,
    reason: available ? undefined : 'Não há receitas de comandas nem agenda de aluguel no período.',
    aluguelComandas: round2(rentalRevenue),
    produtosComandas: round2(productRevenue),
    descontoTotal: round2(discountTotal),
    totalComandas: round2(rentalRevenue + productRevenue),
    agendaAluguel: {
      total: round2(agenda.total),
      pago: round2(agenda.pago),
      pendente: round2(agenda.pendente),
      confirmado: round2(agenda.confirmado),
      noShow: round2(agenda.noShow),
      reservas: agenda.reservas,
    },
    note: 'Comandas fechadas no período (closedAt): aluguel em comandas é receita do DRE. A agenda de locações (Rental) é controle operacional e não é somada ao DRE para evitar duplicidade; o total pode diferir do DRE por competência/abertura.',
  };
}

export interface InventoryReconciliationRow {
  produto: string;
  productId: string;
  quantidadeComandas: number;
  quantidadeSaidas: number;
  diferenca: number;
  cmv: number;
  quantidadeSemCusto: number;
  status: 'OK' | 'DIVERGENTE' | 'CUSTO_INCOMPLETO';
}

export interface InventoryReconciliationReport {
  available: boolean;
  reason?: string;
  produtosComDivergencia: number;
  quantidadeDivergente: number;
  quantidadeSemCusto: number;
  linhas: InventoryReconciliationRow[];
  source: ['OrderItem', 'StockMovement'];
  note: string;
}

export function buildInventoryReconciliation(orders: OrderInput[], movements: MovementInput[]): InventoryReconciliationReport {
  const itemMap = new Map<string, { name: string; qty: number }>();
  orders.forEach(order => {
    const useNewRules = isNewRulesDate(order.closedAt);
    order.items.filter(i => i.status === 'ACTIVE' && i.productId && i.product && !isRentalItem(i, { useNewRules })).forEach(item => {
      const a = itemMap.get(item.productId!) || { name: item.product!.name, qty: 0 };
      a.qty += item.quantity;
      itemMap.set(item.productId!, a);
    });
  });
  const movMap = new Map<string, { name: string; qty: number; cmv: number; uncosted: number }>();
  movements.forEach(m => {
    const useNewRules = isNewRulesDate(m.date);
    if (!m.productId || isRentalItem({ product: m.product }, { useNewRules })) return;
    const a = movMap.get(m.productId) || { name: m.product?.name || 'ââ‚¬”', qty: 0, cmv: 0, uncosted: 0 };
    const sign = m.movementKind === 'RETURN' ? -1 : 1;
    const e = evaluateCmvMovement(m);
    a.qty += sign * Number(m.quantity || 0);
    if (e.uncosted) a.uncosted += sign * Number(m.quantity || 0);
    else a.cmv += sign * e.value;
    movMap.set(m.productId, a);
  });
  const ids = new Set([...itemMap.keys(), ...movMap.keys()]);
  const rows = Array.from(ids).map(id => {
    const item = itemMap.get(id);
    const mov = movMap.get(id);
    const qtyItem = item?.qty || 0;
    const qtyMov = mov?.qty || 0;
    const diff = qtyItem - qtyMov;
    const uncosted = Math.max(0, mov?.uncosted || 0);
    const status: InventoryReconciliationRow['status'] = Math.abs(diff) > 0.001 ? 'DIVERGENTE' : uncosted > 0 ? 'CUSTO_INCOMPLETO' : 'OK';
    return {
      produto: item?.name || mov?.name || 'ââ‚¬”',
      productId: id,
      quantidadeComandas: round2(qtyItem),
      quantidadeSaidas: round2(qtyMov),
      diferenca: round2(diff),
      cmv: round2(mov?.cmv || 0),
      quantidadeSemCusto: round2(uncosted),
      status,
    };
  }).sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));

  const available = ids.size > 0;
  const divergent = rows.filter(r => r.status === 'DIVERGENTE');
  return {
    available,
    reason: available ? undefined : 'Não há produto vendido nem saída de estoque no período.',
    produtosComDivergencia: divergent.length,
    quantidadeDivergente: round2(divergent.reduce((a, r) => a + Math.abs(r.diferenca), 0)),
    quantidadeSemCusto: round2(rows.reduce((a, r) => a + r.quantidadeSemCusto, 0)),
    linhas: rows,
    source: ['OrderItem', 'StockMovement'],
    note: 'Conciliação por produto e período: quantidade ativa em comandas fechadas × saídas OUT_SALE líquidas de devoluções. Não há vínculo orderItemId nas saídas; por isso a comparação é agregada por produto. Uma diferença não é automaticamente perda: pode ser venda sem baixa, transferência ou recorte temporal.',
  };
}

export function buildRegularOccupancy(
  rentals: RentalInput[],
  from: Date,
  to: Date,
  scheduleConfig: RentalScheduleConfig
): OccupancyReport {
  const days = dateKeys(from, to);
  const daySet = new Set(days);
  const schedule = scheduleConfig.entries.filter(e => e.isActive);
  const fieldNames = Array.from(new Set(schedule.map(e => e.field.toUpperCase()))).sort();
  const config: OccupancyConfig = {
    openHour: schedule.length ? Math.floor(Math.min(...schedule.map(e => e.startMinute)) / 60) : 0,
    closeHour: schedule.length ? Math.ceil(Math.max(...schedule.map(e => e.endMinute)) / 60) : 0,
    source: scheduleConfig.source === 'database' ? 'env' : 'default',
    note: scheduleConfig.note,
  };

  if (fieldNames.length === 0) {
    return { available: false, reason: scheduleConfig.note, config, days: days.length, fields: [], overall: { capacidadeHoras: 0, efetivoHoras: 0, reservadoHoras: 0, noShowHoras: 0, ocupacaoEfetivaPct: 0, ocupacaoReservadaPct: 0, receitaRealizada: 0, receitaAgenda: 0, receitaPorHoraEfetiva: null, extraHoras: 0, extraReceita: 0, extraReservas: 0 }, schedule: scheduleConfig, opportunities: [], source: ['Rental'] };
  }

  const byDay = new Map<string, OccupancyDayRow & { field: string }>();
  const byHour = new Map<string, OccupancyHourRow & { field: string }>();
  const extraByHour = new Map<string, { field: string; hora: number; hours: number; revenue: number }>();
  const fieldAgg = new Map<string, { effective: number; reserved: number; noShow: number; revenue: number; agendaRevenue: number; extra: number; extraRevenue: number; extraReservations: number; count: number }>();
  const sourceAgg = new Map<string, { reserved: number; effective: number; count: number }>();

  fieldNames.forEach(field => {
    fieldAgg.set(field, { effective: 0, reserved: 0, noShow: 0, revenue: 0, agendaRevenue: 0, extra: 0, extraRevenue: 0, extraReservations: 0, count: 0 });
    days.forEach(day => {
      const dayDate = new Date(`${day}T12:00:00-04:00`);
      const capacity = regularMinutesForDay(schedule, weekDayCuiaba(dayDate), field);
      byDay.set(`${field}|${day}`, {
        field, data: day, diaSemana: localWeekday(dayDate),
        capacidadeMin: capacity, efetivoMin: 0, reservadoMin: 0, noShowMin: 0,
        ocupacaoEfetivaPct: 0, ocupacaoReservadaPct: 0, receitaRealizada: 0,
      });
    });
    for (let hour = 0; hour < 24; hour++) {
      const available = days.reduce((sum, dayKey) => {
        const dayDate = new Date(`${dayKey}T12:00:00-04:00`);
        const blocks = schedule.filter(e => e.weekday === weekDayCuiaba(dayDate) && e.field.toUpperCase() === field);
        const overlap = blocks.reduce((a, b) => a + Math.max(0, Math.min(b.endMinute, (hour + 1) * 60) - Math.max(b.startMinute, hour * 60)), 0);
        return sum + overlap;
      }, 0);
      if (available > 0) {
        byHour.set(`${field}|${hour}`, { field, hora: hour, disponivelMin: available, efetivoMin: 0, reservadoMin: 0, noShowMin: 0, ocupacaoEfetivaPct: 0, ocupacaoReservadaPct: 0, receitaRealizada: 0 });
      }
    }
  });

  const referenceNow = new Date();
  const reservedSeen = new Set<string>();
  const effectiveSeen = new Set<string>();
  const noShowSeen = new Set<string>();
  const extraSeen = new Set<string>();

  rentals.forEach(rental => {
    const field = rental.resource.toUpperCase();
    if (!fieldNames.includes(field) || rental.status === 'CANCELED' || rental.endTime <= rental.startTime) return;
    const totalMinutes = (rental.endTime.getTime() - rental.startTime.getTime()) / 60000;
    if (totalMinutes <= 0) return;
    const agg = fieldAgg.get(field)!;
    agg.count++;
    const source = rental.source || 'LEGACY';
    const sourceStats = sourceAgg.get(source) || { reserved: 0, effective: 0, count: 0 };
    sourceStats.count++;
    sourceAgg.set(source, sourceStats);
    const realized = rental.endTime <= referenceNow;
    const effective = realized && (rental.status === 'PAID' || rental.status === 'CONFIRMED');
    const noShow = realized && rental.status === 'NO_SHOW';
    const amountPerMinute = rental.status === 'PAID' && realized ? rental.totalAmount / totalMinutes : 0;
    const agendaPerMinute = rental.totalAmount / totalMinutes;
    let rentalExtra = 0;
    for (let t = rental.startTime.getTime(); t < rental.endTime.getTime(); t += 60000) {
      const d = new Date(t);
      const day = localDate(d);
      if (!daySet.has(day)) continue;
      const minute = localMinuteOfDay(d);
      const regular = isRegularMinute(schedule, d, field, minute);
      const dayKey = `${field}|${day}`;
      const hourKey = `${field}|${minute >= 0 ? Math.floor(minute / 60) : 0}`;
      const minuteKey = `${field}|${day}|${minute}`;
      if (regular) {
        const firstReserved = !reservedSeen.has(minuteKey);
        const firstEffective = effective && !effectiveSeen.has(minuteKey);
        const firstNoShow = noShow && !noShowSeen.has(minuteKey);
        if (firstReserved) {
          reservedSeen.add(minuteKey);
          const dayRow = byDay.get(dayKey);
          const hourRow = byHour.get(hourKey);
          if (dayRow) dayRow.reservadoMin += 1;
          if (hourRow) hourRow.reservadoMin += 1;
          agg.reserved += 1;
          sourceStats.reserved += 1;
          agg.agendaRevenue += agendaPerMinute;
        }
        if (firstEffective) {
          effectiveSeen.add(minuteKey);
          const dayRow = byDay.get(dayKey);
          const hourRow = byHour.get(hourKey);
          if (dayRow) dayRow.efetivoMin += 1;
          if (hourRow) hourRow.efetivoMin += 1;
          agg.effective += 1;
          sourceStats.effective += 1;
          if (rental.status === 'PAID') {
            if (dayRow) dayRow.receitaRealizada += amountPerMinute;
            if (hourRow) hourRow.receitaRealizada += amountPerMinute;
            agg.revenue += amountPerMinute;
          }
        }
        if (firstNoShow) {
          noShowSeen.add(minuteKey);
          const dayRow = byDay.get(dayKey);
          const hourRow = byHour.get(hourKey);
          if (dayRow) dayRow.noShowMin += 1;
          if (hourRow) hourRow.noShowMin += 1;
          agg.noShow += 1;
        }
      } else {
        rentalExtra += 1;
        if (effective && !extraSeen.has(minuteKey)) {
          extraSeen.add(minuteKey);
          agg.extra += 1;
          if (rental.status === 'PAID') agg.extraRevenue += amountPerMinute;
          const h = Math.floor(minute / 60);
          const key = `${field}|${h}`;
          const row = extraByHour.get(key) || { field, hora: h, hours: 0, revenue: 0 };
          row.hours += 1 / 60;
          if (rental.status === 'PAID') row.revenue += amountPerMinute;
          extraByHour.set(key, row);
        }
      }
    }
    if (rentalExtra > 0 && effective) agg.extraReservations++;
  });

  const fields: OccupancyFieldSummary[] = fieldNames.map(field => {
    const agg = fieldAgg.get(field)!;
    const fieldDays = Array.from(byDay.values()).filter(r => r.field === field).map(r => {
      const pct = r.capacidadeMin > 0 ? round1((r.efetivoMin / r.capacidadeMin) * 100) : 0;
      const reservedPct = r.capacidadeMin > 0 ? round1((r.reservadoMin / r.capacidadeMin) * 100) : 0;
      return { ...r, capacidadeMin: round2(r.capacidadeMin), efetivoMin: round2(r.efetivoMin), reservadoMin: round2(r.reservadoMin), noShowMin: round2(r.noShowMin), receitaRealizada: round2(r.receitaRealizada), ocupacaoEfetivaPct: pct, ocupacaoReservadaPct: reservedPct };
    });
    const fieldHours = Array.from(byHour.values()).filter(r => r.field === field).map(r => {
      const pct = r.disponivelMin > 0 ? round1((r.efetivoMin / r.disponivelMin) * 100) : 0;
      const reservedPct = r.disponivelMin > 0 ? round1((r.reservadoMin / r.disponivelMin) * 100) : 0;
      return { ...r, disponivelMin: round2(r.disponivelMin), efetivoMin: round2(r.efetivoMin), reservadoMin: round2(r.reservadoMin), noShowMin: round2(r.noShowMin), receitaRealizada: round2(r.receitaRealizada), ocupacaoEfetivaPct: pct, ocupacaoReservadaPct: reservedPct };
    });
    const capacity = fieldDays.reduce((a, r) => a + r.capacidadeMin, 0);
    const effective = fieldDays.reduce((a, r) => a + r.efetivoMin, 0);
    const reserved = fieldDays.reduce((a, r) => a + r.reservadoMin, 0);
    return {
      campo: field,
      reservas: agg.count,
      capacidadeHoras: round2(capacity / 60),
      efetivoHoras: round2(effective / 60),
      reservadoHoras: round2(reserved / 60),
      noShowHoras: round2(agg.noShow / 60),
      ocupacaoEfetivaPct: capacity > 0 ? round1((effective / capacity) * 100) : 0,
      ocupacaoReservadaPct: capacity > 0 ? round1((reserved / capacity) * 100) : 0,
      receitaRealizada: round2(agg.revenue),
      receitaAgenda: round2(agg.agendaRevenue),
      receitaPorHoraEfetiva: effective > 0 ? round2(agg.revenue / (effective / 60)) : null,
      extraHoras: round2(agg.extra / 60),
      extraReceita: round2(agg.extraRevenue),
      extraReservas: agg.extraReservations,
      extraPorHora: Array.from(extraByHour.values())
        .filter(r => r.field === field)
        .map(r => ({ hora: r.hora, horas: round2(r.hours), receita: round2(r.revenue) }))
        .sort((a, b) => a.hora - b.hora),
      porDia: fieldDays,
      porHora: fieldHours,
    };
  });

  const totalCapacity = fields.reduce((a, f) => a + f.capacidadeHoras, 0) * 60;
  const totalEffective = fields.reduce((a, f) => a + f.efetivoHoras, 0) * 60;
  const totalReserved = fields.reduce((a, f) => a + f.reservadoHoras, 0) * 60;
  const totalRevenue = fields.reduce((a, f) => a + f.receitaRealizada, 0);
  const totalAgenda = fields.reduce((a, f) => a + f.receitaAgenda, 0);
  const totalExtra = fields.reduce((a, f) => a + (f.extraHoras || 0), 0);
  const totalExtraRevenue = fields.reduce((a, f) => a + (f.extraReceita || 0), 0);
  const totalExtraReservations = fields.reduce((a, f) => a + (f.extraReservas || 0), 0);

  const opportunities: OccupancyOpportunity[] = [];
  fields.forEach(field => {
    field.porHora.forEach(hour => {
      if (hour.ocupacaoEfetivaPct >= 30) return;
      const idleHours = Math.max(0, (hour.disponivelMin - hour.efetivoMin) / 60);
      if (idleHours <= 0) return;
      const avg = field.receitaPorHoraEfetiva;
      opportunities.push({ campo: field.campo, hora: hour.hora, horasOciosas: round2(idleHours), receitaMediaPorHora: avg, potencialEstimado: avg != null ? round2(idleHours * avg) : null, estimativa: true, premissa: `Estimativa sobre a grade regular de ${field.campo}; não é receita realizada.` });
    });
  });
  opportunities.sort((a, b) => (b.potencialEstimado || 0) - (a.potencialEstimado || 0));

  return {
    available: true,
    config,
    days: days.length,
    fields,
    schedule: scheduleConfig,
    overall: {
      capacidadeHoras: round2(totalCapacity / 60),
      efetivoHoras: round2(totalEffective / 60),
      reservadoHoras: round2(totalReserved / 60),
      noShowHoras: round2(fields.reduce((a, f) => a + f.noShowHoras, 0)),
      ocupacaoEfetivaPct: totalCapacity > 0 ? round1((totalEffective / totalCapacity) * 100) : 0,
      ocupacaoReservadaPct: totalCapacity > 0 ? round1((totalReserved / totalCapacity) * 100) : 0,
      receitaRealizada: round2(totalRevenue),
      receitaAgenda: round2(totalAgenda),
      receitaPorHoraEfetiva: totalEffective > 0 ? round2(totalRevenue / (totalEffective / 60)) : null,
      extraHoras: round2(totalExtra),
      extraReceita: round2(totalExtraRevenue),
      extraReservas: totalExtraReservations,
      bySource: Array.from(sourceAgg.entries()).map(([sourceKey, stats]) => ({
        source: sourceKey,
        reservedHours: round2(stats.reserved / 60),
        effectiveHours: round2(stats.effective / 60),
        count: stats.count,
      })),
    },
    opportunities: opportunities.slice(0, 12),
    source: ['Rental'],
  };
}

export async function getOccupancyReport(from: Date, to: Date, scheduleConfig?: RentalScheduleConfig): Promise<OccupancyReport> {
  const [rentals, schedule] = await Promise.all([
    prisma.rental.findMany({
      where: { startTime: { lt: to }, endTime: { gt: from }, status: { not: 'CANCELED' } },
      select: { resource: true, startTime: true, endTime: true, totalAmount: true, status: true, source: true },
    }),
    scheduleConfig ? Promise.resolve(scheduleConfig) : getRentalSchedule(),
  ]);
  return buildRegularOccupancy(rentals, from, to, schedule);
}

export async function getProductContributionReport(from: Date, to: Date): Promise<ProductContributionReport> {
  const [orders, movements] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'CLOSED', closedAt: { gte: from, lte: to } },
      select: {
        id: true, total: true, discount: true, closedAt: true,
        items: {
          where: { status: 'ACTIVE' },
          select: {
            id: true, productId: true, serviceId: true, quantity: true, unitPrice: true, subtotal: true, status: true,
            product: { select: { name: true, price: true, cost: true, isService: true, stockControlled: true, category: { select: { name: true } } } },
            service: { select: { name: true } },
          },
        },
      },
    }),
    prisma.stockMovement.findMany({
      where: { date: { gte: from, lte: to }, OR: [{ type: 'OUT_SALE' }, { movementKind: 'RETURN' }] },
      select: { productId: true, quantity: true, unitCost: true, type: true, movementKind: true, date: true, product: { select: { name: true, price: true, cost: true, isService: true, stockControlled: true, category: { select: { name: true } } } } },
    }),
  ]);
  return buildProductContribution(orders as any, movements as any);
}

export async function getRevenueMixReport(from: Date, to: Date): Promise<RevenueMixReport> {
  const [orders, rentals] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'CLOSED', closedAt: { gte: from, lte: to } },
      select: {
        id: true, total: true, discount: true, closedAt: true,
        items: {
          where: { status: 'ACTIVE' },
          select: {
            id: true, productId: true, serviceId: true, quantity: true, unitPrice: true, subtotal: true, status: true,
            product: { select: { name: true, price: true, cost: true, isService: true, stockControlled: true, category: { select: { name: true } } } },
            service: { select: { name: true } },
          },
        },
      },
    }),
    prisma.rental.findMany({
      where: { startTime: { gte: from, lte: to } },
      select: { resource: true, startTime: true, endTime: true, totalAmount: true, status: true, source: true },
    }),
  ]);
  return buildRevenueMix(orders as any, rentals);
}

export async function getInventoryReconciliationReport(from: Date, to: Date): Promise<InventoryReconciliationReport> {
  const [orders, movements] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'CLOSED', closedAt: { gte: from, lte: to } },
      select: {
        id: true, total: true, discount: true, closedAt: true,
        items: {
          where: { status: 'ACTIVE' },
          select: {
            id: true, productId: true, serviceId: true, quantity: true, unitPrice: true, subtotal: true, status: true,
            product: { select: { name: true, price: true, cost: true, isService: true, stockControlled: true, category: { select: { name: true } } } },
            service: { select: { name: true } },
          },
        },
      },
    }),
    prisma.stockMovement.findMany({
      where: { date: { gte: from, lte: to }, OR: [{ type: 'OUT_SALE' }, { movementKind: 'RETURN' }] },
      select: { productId: true, quantity: true, unitCost: true, type: true, movementKind: true, date: true, product: { select: { name: true, price: true, cost: true, isService: true, stockControlled: true, category: { select: { name: true } } } } },
    }),
  ]);
  return buildInventoryReconciliation(orders as any, movements as any);
}

export async function getCommercialSnapshot(from: Date, to: Date) {
  const [occupancy, productContribution, revenueMix, reconciliation] = await Promise.all([
    getOccupancyReport(from, to),
    getProductContributionReport(from, to),
    getRevenueMixReport(from, to),
    getInventoryReconciliationReport(from, to),
  ]);
  return { occupancy, productContribution, revenueMix, reconciliation };
}
