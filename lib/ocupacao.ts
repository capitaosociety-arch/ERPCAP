// ===========================================================================
// Motor de Análise de Ocupação e Precificação (Capitão Society)
//
// Reutiliza os cálculos oficiais existentes (lib/analytics.ts): identificação
// de aluguel de campo (isRentalItem), FUT5/FUT7 (isFut5/isFut7), períodos
// (buildPeriods) e formatação/arredondamento. Não cria tabelas duplicadas:
// as faixas de preço vêm de PricingBand e a capacidade/abertura de
// OccupationSettings (configurável pelo administrador).
//
// SEGURANÇA:
//  - Apenas queries Prisma pré-definidas (sem SQL livre).
//  - Nenhuma função deste módulo altera preços. Alterações exigem ação
//    explícita de um administrador (ver app/actions/ocupacao.ts).
//  - Toda recomendação traz justificativa e dados utilizados (rastreável).
// ===========================================================================

import { prisma } from './prisma';
import { isRentalItem, isFut5, isFut7, round2 } from './analytics';

export type CampoId = 'fut5' | 'fut7';
export type Classificacao = 'MUITO_OCIOSO' | 'OCIOSO' | 'SAUDAVEL' | 'ALTA_DEMANDA' | 'SATURADO';

export const TZ = 'America/Cuiaba';
const HORA_MS = 3600000;

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export interface OcupacaoConfig {
  capacidadeFut5: number;
  capacidadeFut7: number;
  abertura: number;
  fechamento: number;
  ociosoLimite: number;
  saudavelLimite: number;
  altaDemandaLimite: number;
  saturadoLimite: number;
  diasAvaliacaoElasticidade: number;
}

export const DEFAULT_CONFIG: OcupacaoConfig = {
  capacidadeFut5: 2,
  capacidadeFut7: 1,
  abertura: 6,
  fechamento: 24,
  ociosoLimite: 25,
  saudavelLimite: 50,
  altaDemandaLimite: 80,
  saturadoLimite: 95,
  diasAvaliacaoElasticidade: 30
};

export interface FaixaPreco {
  campo: CampoId;
  startHour: number;
  endHour: number;
  minPrice: number;
  maxPrice: number;
}

const CAMPO_NOME: Record<CampoId, string> = { fut5: 'FUT5', fut7: 'FUT7' };
const CAMPO_LABEL: Record<CampoId, string> = { fut5: 'Campo menor', fut7: 'Campo maior' };

export const campoNome = (c: CampoId) => CAMPO_NOME[c];
export const campoLabel = (c: CampoId) => CAMPO_LABEL[c];
export const precoDoCampo = (c: CampoId, b: FaixaPreco) => (c === 'fut5' ? b.minPrice : b.maxPrice);

export const CLASSIFICACAO_LABEL: Record<Classificacao, string> = {
  MUITO_OCIOSO: 'Muito ocioso',
  OCIOSO: 'Ocioso',
  SAUDAVEL: 'Saudável',
  ALTA_DEMANDA: 'Alta demanda',
  SATURADO: 'Saturado'
};

export function classificarOcupacao(pct: number, cfg: OcupacaoConfig): Classificacao {
  if (pct >= cfg.saturadoLimite) return 'SATURADO';
  if (pct >= cfg.altaDemandaLimite) return 'ALTA_DEMANDA';
  if (pct >= cfg.saudavelLimite) return 'SAUDAVEL';
  if (pct >= cfg.ociosoLimite) return 'OCIOSO';
  return 'MUITO_OCIOSO';
}

export function classificarLimites(cfg: OcupacaoConfig): { faixa: string; limite: number }[] {
  return [
    { faixa: 'MUITO OCIOSO (abaixo)', limite: cfg.ociosoLimite },
    { faixa: 'OCIOSO', limite: cfg.saudavelLimite },
    { faixa: 'SAUDÁVEL', limite: cfg.altaDemandaLimite },
    { faixa: 'ALTA DEMANDA', limite: cfg.saturadoLimite },
    { faixa: 'SATURADO (a partir de)', limite: cfg.saturadoLimite }
  ];
}

export function bandParaHora(bands: FaixaPreco[], campo: CampoId, hour: number): FaixaPreco | null {
  return bands.find(b => b.campo === campo && hour >= b.startHour && hour < b.endHour) || null;
}

export function rotuloFaixa(b: { startHour: number; endHour: number }): string {
  const f = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return `${f(b.startHour)} às ${f(b.endHour)}`;
}

export function faixaKey(b: { startHour: number; endHour: number }): string {
  return `${b.startHour}-${b.endHour}`;
}

// ---------------------------------------------------------------------------
// Dados brutos (queries Prisma pré-definidas)
// ---------------------------------------------------------------------------

export interface RentalRow {
  id: string;
  customerId: string | null;
  resource: string;
  startTime: Date;
  endTime: Date;
  totalAmount: number;
  status: string;
  cancelledAt: Date | null;
  createdAt: Date;
  customer?: { id: string; name: string; createdAt: Date } | null;
}

export interface OrderRow {
  id: string;
  customerId: string | null;
  status: string;
  total: number;
  discount: number;
  openedAt: Date;
  closedAt: Date | null;
  items: {
    product?: { name?: string; category?: { name?: string } } | null;
    service?: { name?: string } | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
}

export interface RawOcupacao {
  rentals: RentalRow[];
  orders: OrderRow[];
  settings: OcupacaoConfig;
  bands: FaixaPreco[];
}

export async function carregarConfig(): Promise<OcupacaoConfig> {
  const row = await prisma.occupationSettings.findUnique({ where: { id: 'default' } });
  if (!row) return { ...DEFAULT_CONFIG };
  return {
    capacidadeFut5: row.capacidadeFut5,
    capacidadeFut7: row.capacidadeFut7,
    abertura: row.abertura,
    fechamento: row.fechamento,
    ociosoLimite: row.ociosoLimite,
    saudavelLimite: row.saudavelLimite,
    altaDemandaLimite: row.altaDemandaLimite,
    saturadoLimite: row.saturadoLimite,
    diasAvaliacaoElasticidade: row.diasAvaliacaoElasticidade
  };
}

export async function carregarBands(): Promise<FaixaPreco[]> {
  const rows = await prisma.pricingBand.findMany({ orderBy: [{ campo: 'asc' }, { startHour: 'asc' }] });
  return rows.map(r => ({
    campo: (r.campo === 'fut7' ? 'fut7' : 'fut5') as CampoId,
    startHour: r.startHour,
    endHour: r.endHour,
    minPrice: r.minPrice,
    maxPrice: r.maxPrice
  }));
}

export function campoDeResource(resource: string): CampoId | null {
  const name = (resource || '').toLowerCase();
  if (isFut5(name)) return 'fut5';
  if (isFut7(name)) return 'fut7';
  return null;
}

export async function carregarDadosOcupacao(from: Date, to: Date): Promise<RawOcupacao> {
  const [rentals, orders, settings, bands] = await Promise.all([
    prisma.rental.findMany({
      where: { startTime: { gte: from, lte: to } },
      include: { customer: { select: { id: true, name: true, createdAt: true } } }
    }),
    prisma.order.findMany({
      where: { status: 'CLOSED', closedAt: { gte: from, lte: to } },
      include: {
        items: {
          where: { status: 'ACTIVE' },
          include: { product: { include: { category: true } }, service: true }
        }
      }
    }),
    carregarConfig(),
    carregarBands()
  ]);

  return { rentals: rentals as unknown as RentalRow[], orders: orders as unknown as OrderRow[], settings, bands };
}

// ---------------------------------------------------------------------------
// Helpers de tempo (fuso America/Cuiaba, padrão do sistema)
// ---------------------------------------------------------------------------

function diaKeyDe(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function horaDe(d: Date): number {
  return parseInt(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: TZ }).format(d), 10);
}

function dowDe(d: Date): number {
  const [y, m, dd] = diaKeyDe(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
}

export const DOW_NOMES: Record<number, string> = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };

function inWindow(d: Date, from: Date, to: Date): boolean {
  return d >= from && d <= to;
}

function contarDiasPorDow(from: Date, to: Date): number[] {
  const counts = new Array(7).fill(0);
  const inicio = new Date(diaKeyDe(from) + 'T00:00:00Z');
  const fim = new Date(diaKeyDe(to) + 'T00:00:00Z');
  const passo = 24 * 60 * 60 * 1000;
  for (let t = inicio.getTime(); t <= fim.getTime(); t += passo) {
    const [y, m, d] = new Date(t).toISOString().slice(0, 10).split('-').map(Number);
    counts[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Tipos de análise
// ---------------------------------------------------------------------------

export interface IndicadoresGlobais {
  ocupacaoMedia: number;
  horarioMaisOcupado: { campo: CampoId; campoLabel: string; startHour: number; rotulo: string; taxaOcupacao: number } | null;
  horarioMaisOcioso: { campo: CampoId; campoLabel: string; startHour: number; rotulo: string; taxaOcupacao: number } | null;
  receitaPorHoraDisponivel: number;
  faturamentoCampos: number;
  consumoBarAssociado: number;
  receitaTotal: number;
  reservas: number;
  cancelamentos: number;
  taxaLiquidacao: number; // reservas canceladas / total
  oportunidadeEstimada: number; // receita perdida estimada por ociosidade
}

export interface SlotAnalise {
  campo: CampoId;
  campoLabel: string;
  rotulo: string;
  startHour: number;
  endHour: number;
  precoAtual: number;
  horasDisponiveis: number;
  horasAlugadas: number;
  taxaOcupacao: number;
  quantidadeReservas: number;
  cancelamentos: number;
  faturamentoAluguel: number;
  consumoBar: number;
  receitaTotal: number;
  ticketMedio: number;
  clientesNovos: number;
  clientesRecorrentes: number;
  antecedenciaMediaHoras: number;
  jogosInteiros: number;
  meiosJogos: number;
  cortesias: number;
  descontosPromocionais: number;
  receitaPorHoraDisponivel: number;
  receitaPorHoraOcupada: number;
  precoMedioRecebido: number;
  descontoMedio: number;
  receitaPerdidaOciosidade: number;
  classificacao: Classificacao;
}

export interface HeatmapCell {
  campo: CampoId;
  campoLabel: string;
  diaSemana: string;
  dow: number;
  startHour: number;
  taxaOcupacao: number;
  receitaTotal: number;
}

export interface Recomendacao {
  fingerprint: string;
  campo: CampoId;
  campoLabel: string;
  faixa: string;
  faixaKey: string;
  startHour: number;
  endHour: number;
  categoria: string;
  precoAtual: number;
  precoSugerido: number;
  diferencaReais: number;
  diferencaPct: number;
  ocupacaoAtual: number;
  ocupacaoDesejada: number;
  receitaAtual: number;
  estimativaReceita: number;
  justificativa: string;
  nivelConfianca: number;
  acaoComercial: string;
  dadosUtilizados: string[];
}

export interface SimulacaoCenario {
  nome: string;
  ocupacao: number;
  horasOcupadas: number;
  receitaAluguel: number;
  consumoBar: number;
  receitaTotal: number;
  receitaPorHora: number;
  variacaoOcupacao: number;
  variacaoReceita: number;
  nota: string;
}

export interface SimulacaoResult {
  campo: CampoId;
  campoLabel: string;
  faixa: string;
  precoAtual: number;
  precoNovo: number;
  deltaPct: number;
  ocupacaoAtual: number;
  receitaAtual: number;
  cenarios: SimulacaoCenario[];
  aviso: string;
}

export interface ComparativoJanela {
  rotulo: string;
  dias: number;
  ocupacao: number;
  receitaTotal: number;
  reservas: number;
}

export interface ComparativoOcupacao {
  janelas: ComparativoJanela[];
  mesAtualVsAnterior: { rotulo: string; ocupacao: number; receitaTotal: number; reservas: number }[] | null;
  porDiaSemana: { dia: string; dow: number; ocupacao: number; mediaGeral: number; diffPct: number }[];
  porFaixa: { faixa: string; faixaKey: string; ocupacao: number; mediaGeral: number; diffPct: number }[];
  campoMenorVsMaior: { campo: CampoId; campoLabel: string; ocupacao: number; receitaTotal: number; reservas: number }[];
}

export interface ElasticidadeItem {
  id: string;
  campo: CampoId;
  campoLabel: string;
  faixa: string;
  precoAnterior: number;
  precoNovo: number;
  deltaPct: number;
  appliedAt: string;
  ocupacaoAntes: number;
  ocupacaoDepois: number | null;
  receitaAntes: number;
  receitaDepois: number | null;
  consumoBarAntes: number;
  consumoBarDepois: number | null;
  status: string;
  resultado: string | null;
  avaliacao: string;
  nota: string | null;
}

export interface HistoricoRecomendacao {
  id: string;
  campo: string;
  faixa: string | null;
  categoria: string;
  precoAtual: number;
  precoSugerido: number;
  nivelConfianca: number;
  motivo: string;
  decisao: string;
  decisaoNota: string | null;
  precoAplicado: number | null;
  periodoTesteDias: number | null;
  resultado: string | null;
  resultadoNota: string | null;
  adminName: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Agregação pura por slot (campo + hora). Retorna um mapa chaveado.
// ---------------------------------------------------------------------------

interface AggCell {
  campo: CampoId;
  startHour: number;
  endHour: number;
  diaKey: string;
  dow: number;
  horasAlugadas: number;
  reservas: number;
  cancelamentos: number;
  faturamentoAluguel: number;
  consumoBar: number;
  clientesNovos: number;
  clientesRecorrentes: number;
  antecedenciaHoras: number;
  jogosInteiros: number;
  meiosJogos: number;
  cortesias: number;
  descontos: number;
}

type AggMap = Map<string, AggCell>;

const cellKey = (campo: CampoId, startHour: number, diaKey: string) => `${campo}|${startHour}|${diaKey}`;

// Associação comanda -> reserva: mesmo cliente e horário próximo (2h antes / 3h depois do início).
const WINDOW_BEFORE = 2 * HORA_MS;
const WINDOW_AFTER = 3 * HORA_MS;

export function agregarOcupacao(data: RawOcupacao, from: Date, to: Date): { cells: AggMap; settings: OcupacaoConfig; bands: FaixaPreco[] } {
  const { settings, bands } = data;
  const cells: AggMap = new Map();
  const horaFinal = settings.fechamento;
  const horaInicial = settings.abertura;

  // Orders agrupados por cliente para associação.
  const ordersByCustomer = new Map<string, OrderRow[]>();
  data.orders.forEach(o => {
    if (!o.customerId) return;
    const list = ordersByCustomer.get(o.customerId) || [];
    list.push(o);
    ordersByCustomer.set(o.customerId, list);
  });

  const touch = (campo: CampoId, startHour: number, diaKey: string, dow: number) => {
    const key = cellKey(campo, startHour, diaKey);
    let c = cells.get(key);
    if (!c) {
      c = {
        campo,
        startHour,
        endHour: startHour + 1,
        diaKey,
        dow,
        horasAlugadas: 0,
        reservas: 0,
        cancelamentos: 0,
        faturamentoAluguel: 0,
        consumoBar: 0,
        clientesNovos: 0,
        clientesRecorrentes: 0,
        antecedenciaHoras: 0,
        jogosInteiros: 0,
        meiosJogos: 0,
        cortesias: 0,
        descontos: 0
      };
      cells.set(key, c);
    }
    return c;
  };

  for (const r of data.rentals) {
    if (!inWindow(r.startTime, from, to)) continue;
    const campo = campoDeResource(r.resource);
    if (!campo) continue;
    const diaKey = diaKeyDe(r.startTime);
    const dow = dowDe(r.startTime);
    const isCancelado = r.status === 'CANCELED';
    const isNoShow = r.status === 'NO_SHOW';
    const valido = !isCancelado && !isNoShow;

    // Ocupação (horas) por overlap — vale para reservas válidas.
    if (valido) {
      for (let h = horaInicial; h < horaFinal; h++) {
        const a = r.startTime.getTime();
        const b = r.endTime.getTime();
        const overlap = Math.max(0, (Math.min(b, (h + 1) * HORA_MS) - Math.max(a, h * HORA_MS)) / HORA_MS);
        if (overlap > 0) {
          const c = touch(campo, h, diaKey, dow);
          c.horasAlugadas += overlap;
        }
      }
    }

    const startHour = horaDe(r.startTime);
    if (startHour < horaInicial || startHour >= horaFinal) continue;
    const c = touch(campo, startHour, diaKey, dow);

    if (isCancelado) {
      c.cancelamentos += 1;
      continue;
    }
    if (isNoShow) continue;

    c.reservas += 1;
    if (r.customer && r.customer.createdAt) {
      if (inWindow(r.customer.createdAt, from, to)) c.clientesNovos += 1;
      else c.clientesRecorrentes += 1;
    } else {
      c.clientesRecorrentes += 1;
    }
    c.antecedenciaHoras += Math.max(0, (r.startTime.getTime() - r.createdAt.getTime()) / HORA_MS);

    // Cortesia: reserva sem valor (totalAmount <= 0) e sem comanda de cobrança.
    let aluguel = 0;
    let bar = 0;
    let descontos = 0;
    const itensAluguel: { quantity: number; subtotal: number }[] = [];
    let temCobranca = false;

    const customerOrders = r.customerId ? (ordersByCustomer.get(r.customerId) || []) : [];
    const t0 = r.startTime.getTime();
    const assoc = customerOrders.filter(o => {
      const t = (o.closedAt || o.openedAt).getTime();
      return t >= t0 - WINDOW_BEFORE && t <= t0 + WINDOW_AFTER;
    });

    for (const o of assoc) {
      const totalSub = o.items.reduce((s, it) => s + (it.subtotal || 0), 0);
      const rentSub = o.items.filter(it => isRentalItem(it)).reduce((s, it) => s + (it.subtotal || 0), 0);
      if (rentSub > 0) temCobranca = true;
      aluguel += rentSub;
      o.items.forEach(it => {
        if (!isRentalItem(it)) bar += it.subtotal || 0;
        else itensAluguel.push({ quantity: it.quantity || 0, subtotal: it.subtotal || 0 });
      });
      if (totalSub > 0 && (o.discount || 0) > 0) {
        descontos += o.discount * Math.min(1, rentSub / totalSub);
      }
    }

    if (!temCobranca && assoc.length === 0 && (r.totalAmount || 0) > 0) {
      aluguel = r.totalAmount || 0;
    }

    for (const it of itensAluguel) {
      const q = it.quantity || 0;
      c.jogosInteiros += Math.floor(q);
      if (q - Math.floor(q) > 0.01) c.meiosJogos += 1;
    }
    if (aluguel <= 0 && bar <= 0) c.cortesias += 1;
    c.descontos += descontos;
    c.faturamentoAluguel += aluguel;
    c.consumoBar += bar;
  }

  return { cells, settings, bands };
}

// ---------------------------------------------------------------------------
// Montagem dos indicadores por granularidade
// ---------------------------------------------------------------------------

function capacidadeDe(campo: CampoId, settings: OcupacaoConfig): number {
  return campo === 'fut5' ? settings.capacidadeFut5 : settings.capacidadeFut7;
}

function horasDisponiveisPorDia(campo: CampoId, settings: OcupacaoConfig): number {
  return capacidadeDe(campo, settings) * (settings.fechamento - settings.abertura);
}

export function buildSlot(campo: CampoId, startHour: number, endHour: number, acum: Partial<AggCell> & { settings: OcupacaoConfig; bands: FaixaPreco[]; dias: number }): SlotAnalise {
  const { settings, bands, dias } = acum;
  const band = bandParaHora(bands, campo, startHour) || { campo, startHour, endHour, minPrice: 0, maxPrice: 0 };
  const precoAtual = precoDoCampo(campo, band);
  const horasDisponiveis = round2(dias * horasDisponiveisPorDia(campo, settings) / (settings.fechamento - settings.abertura)); // por hora
  const horasAlugadas = round2(acum.horasAlugadas || 0);
  const taxaOcupacao = horasDisponiveis > 0 ? round2((horasAlugadas / horasDisponiveis) * 100) : 0;
  const reservas = acum.reservas || 0;
  const cancelamentos = acum.cancelamentos || 0;
  const faturamentoAluguel = round2(acum.faturamentoAluguel || 0);
  const consumoBar = round2(acum.consumoBar || 0);
  const receitaTotal = round2(faturamentoAluguel + consumoBar);
  const ticketMedio = reservas > 0 ? round2(receitaTotal / reservas) : 0;
  const receitaPorHoraOcupada = horasAlugadas > 0 ? round2(receitaTotal / horasAlugadas) : 0;
  const receitaPorHoraDisponivel = horasDisponiveis > 0 ? round2(receitaTotal / horasDisponiveis) : 0;
  const precoMedioRecebido = reservas > 0 ? round2(faturamentoAluguel / reservas) : 0;
  const descontoMedio = reservas > 0 ? round2((acum.descontos || 0) / reservas) : 0;
  const horasOciosas = Math.max(0, horasDisponiveis - horasAlugadas);
  const receitaPerdidaOciosidade = round2(horasOciosas * receitaPorHoraOcupada);

  return {
    campo,
    campoLabel: campoLabel(campo),
    rotulo: `${String(startHour).padStart(2, '0')}:00`,
    startHour,
    endHour,
    precoAtual,
    horasDisponiveis,
    horasAlugadas,
    taxaOcupacao,
    quantidadeReservas: reservas,
    cancelamentos,
    faturamentoAluguel,
    consumoBar,
    receitaTotal,
    ticketMedio,
    clientesNovos: acum.clientesNovos || 0,
    clientesRecorrentes: acum.clientesRecorrentes || 0,
    antecedenciaMediaHoras: reservas > 0 ? round2((acum.antecedenciaHoras || 0) / reservas) : 0,
    jogosInteiros: acum.jogosInteiros || 0,
    meiosJogos: acum.meiosJogos || 0,
    cortesias: acum.cortesias || 0,
    descontosPromocionais: round2(acum.descontos || 0),
    receitaPorHoraDisponivel,
    receitaPorHoraOcupada,
    precoMedioRecebido,
    descontoMedio,
    receitaPerdidaOciosidade,
    classificacao: classificarOcupacao(taxaOcupacao, settings)
  };
}

function dayCount(from: Date, to: Date): number {
  const a = new Date(diaKeyDe(from) + 'T00:00:00Z');
  const b = new Date(diaKeyDe(to) + 'T00:00:00Z');
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / (24 * HORA_MS)) + 1);
}

export interface ReporteOcupacao {
  periodo: string;
  from: string;
  to: string;
  dias: number;
  semDados: boolean;
  config: OcupacaoConfig;
  indicadores: IndicadoresGlobais;
  porHorario: SlotAnalise[];
  porDiaSemana: SlotAnalise[];
  porFaixa: SlotAnalise[];
  heatmap: HeatmapCell[];
  recomendacoes: Recomendacao[];
  comparativos: ComparativoOcupacao;
  simulacao?: SimulacaoResult | null;
  elasticidade?: ElasticidadeItem[];
  historico?: HistoricoRecomendacao[];
}

// ---------------------------------------------------------------------------
// Recomendações (nunca aplica preço — apenas sugere)
// ---------------------------------------------------------------------------

const arredondarPreco = (v: number) => Math.max(0, Math.round(v / 5) * 5);

const DADOS_BASE = ['Rental (reservas)', 'OrderItem (aluguel e bar)', 'PricingBand (preço atual)', 'OccupationSettings (capacidade)'];

function receitaPorReservaMedia(faixa: SlotAnalise): { receitaTotal: number; aluguel: number; bar: number; reservas: number } {
  const r = faixa.quantidadeReservas;
  return {
    receitaTotal: r > 0 ? faixa.receitaTotal / r : 0,
    aluguel: r > 0 ? faixa.faturamentoAluguel / r : 0,
    bar: r > 0 ? faixa.consumoBar / r : 0,
    reservas: r
  };
}

export function gerarRecomendacoes(faixas: SlotAnalise[], settings: OcupacaoConfig, periodoRef: string): Recomendacao[] {
  const recomendacoes: Recomendacao[] = [];
  const horasSemana = settings.fechamento - settings.abertura;

  for (const faixa of faixas) {
    const { taxaOcupacao: occ, precoAtual } = faixa;
    const porReserva = receitaPorReservaMedia(faixa);
    const barShare = porReserva.receitaTotal > 0 ? porReserva.bar / porReserva.receitaTotal : 0;
    const classif = faixa.classificacao;
    const fatorBar = barShare >= 0.3; // bar representa 30%+ da receita da reserva

    let categoria = 'MANTER';
    let precoSugerido = precoAtual;
    let acaoComercial = 'Manter preço atual e monitorar a demanda.';
    let confianca = 0.8;
    let ocupacaoDesejada = occ;
    let justificativa = '';
    const dados: string[] = [
      `Ocupação ${occ.toFixed(1).replace('.', ',')}% · preço atual R$ ${precoAtual.toFixed(2).replace('.', ',')}`,
      `Receita total média por reserva: R$ ${porReserva.receitaTotal.toFixed(2).replace('.', ',')} (aluguel R$ ${porReserva.aluguel.toFixed(2).replace('.', ',')} + bar R$ ${porReserva.bar.toFixed(2).replace('.', ',')})`
    ];

    const estimar = (newPrice: number, newOcc: number): number => {
      const aluguelN = porReserva.aluguel > 0 ? porReserva.aluguel * (newPrice / precoAtual) : 0;
      const porHora = aluguelN + porReserva.bar;
      const horas = (newOcc / 100) * (faixa.horasDisponiveis > 0 ? faixa.horasDisponiveis : faixa.quantidadeReservas / (horasSemana));
      return round2(horas * porHora);
    };

    if (classif === 'SATURADO') {
      categoria = 'AUMENTAR_PRECO';
      precoSugerido = arredondarPreco(precoAtual * 1.10);
      ocupacaoDesejada = round2(occ * 0.92);
      confianca = 0.85;
      acaoComercial = 'Avaliar aumento de preço, reduzir descontos e testar preço superior. Criar lista de espera.';
      justificativa = `Ocupação de ${occ.toFixed(1).replace('.', ',')}% (>= ${settings.saturadoLimite}%) indica saturação: há demanda para absorver aumento. Receita total média por reserva de R$ ${porReserva.receitaTotal.toFixed(2).replace('.', ',')}.`;
      dados.push(`Estimativa provável após +10%: R$ ${estimar(precoSugerido, round2(occ * 0.95)).toFixed(2).replace('.', ',')}`);
    } else if (classif === 'ALTA_DEMANDA') {
      categoria = 'AUMENTAR_PRECO';
      precoSugerido = arredondarPreco(precoAtual * 1.07);
      ocupacaoDesejada = round2(occ * 0.93);
      confianca = 0.7;
      acaoComercial = 'Testar preço superior e reduzir descontos; monitorar queda de ocupação após o reajuste.';
      justificativa = `Ocupação de ${occ.toFixed(1).replace('.', ',')}% (faixa ${settings.altaDemandaLimite}-${settings.saturadoLimite}%) permite testar preço acima do atual sem risco alto.`;
      dados.push(`Estimativa provável após +7%: R$ ${estimar(precoSugerido, round2(occ * 0.95)).toFixed(2).replace('.', ',')}`);
    } else if (classif === 'SAUDAVEL') {
      categoria = 'MANTER';
      precoSugerido = precoAtual;
      ocupacaoDesejada = occ;
      confianca = 0.8;
      acaoComercial = 'Manter o preço atual e monitorar sazonalidade.';
      justificativa = `Ocupação de ${occ.toFixed(1).replace('.', ',')}% dentro da faixa saudável (${settings.saudavelLimite}-${settings.altaDemandaLimite}%). Sem justificativa para mudança de preço.`;
    } else if (classif === 'OCIOSO') {
      if (fatorBar) {
        categoria = 'PROMOCAO';
        precoSugerido = precoAtual;
        ocupacaoDesejada = round2(Math.min(70, occ + 20));
        confianca = 0.6;
        acaoComercial = 'Oferecer crédito no bar ou pacote de jogos em vez de desconto direto no aluguel (bar representa parte relevante da receita).';
        justificativa = `Ocupação de ${occ.toFixed(1).replace('.', ',')}% (ocioso), mas o bar representa ${(barShare * 100).toFixed(0).replace('.', ',')}% da receita da reserva. Reduzir só o aluguel perderia receita sem garantir retorno; prefira benefício no bar.`;
        dados.push('Recomendação: NÃO cortar preço apenas para ganhar ocupação (bar sustenta receita).');
      } else {
        categoria = 'REDUZIR_PRECO';
        precoSugerido = arredondarPreco(precoAtual * 0.93);
        ocupacaoDesejada = round2(Math.min(65, occ + 15));
        confianca = 0.55;
        acaoComercial = 'Redução moderada de preço + campanha para clientes inativos + pacote de 4 jogos.';
        justificativa = `Ocupação de ${occ.toFixed(1).replace('.', ',')}% (ocioso) e bar pouco relevante na reserva (${(barShare * 100).toFixed(0).replace('.', ',')}%). Redução moderada para atrair demanda.`;
        dados.push(`Estimativa provável: R$ ${estimar(precoSugerido, round2(occ * 1.2)).toFixed(2).replace('.', ',')}`);
      }
    } else {
      // MUITO OCIOSO
      if (fatorBar) {
        categoria = 'PROMOCAO';
        precoSugerido = precoAtual;
        ocupacaoDesejada = round2(Math.min(60, occ + 30));
        confianca = 0.5;
        acaoComercial = 'Promoção por horário com benefício no bar, mensalista e campanha para clientes inativos e grupos habituais.';
        justificativa = `Ocupação de ${occ.toFixed(1).replace('.', ',')}% (muito ocioso). O bar representa ${(barShare * 100).toFixed(0).replace('.', ',')}% da receita da reserva: ative o horário com benefício no bar (crédito, happy hour) e planos mensais.`;
        dados.push('Considerar RECEITA TOTAL = aluguel + bar antes de cortar preço.');
      } else {
        categoria = 'REDUZIR_PRECO';
        precoSugerido = arredondarPreco(precoAtual * 0.88);
        ocupacaoDesejada = round2(Math.min(55, occ + 25));
        confianca = 0.5;
        acaoComercial = 'Redução de preço + promoção por horário + plano mensal + campanha para clientes inativos.';
        justificativa = `Ocupação de ${occ.toFixed(1).replace('.', ',')}% (muito ocioso). Forte promoção para ocupar o horário; bar com participação de ${(barShare * 100).toFixed(0).replace('.', ',')}% na reserva.`;
        dados.push(`Estimativa provável: R$ ${estimar(precoSugerido, round2(occ * 1.3)).toFixed(2).replace('.', ',')}`);
      }
    }

    precoSugerido = Math.max(1, precoSugerido);
    const diferencaReais = round2(precoSugerido - precoAtual);
    const diferencaPct = precoAtual > 0 ? round2((diferencaReais / precoAtual) * 100) : 0;
    const estimativaReceita = estimar(precoSugerido, ocupacaoDesejada);

    if (precoSugerido === precoAtual && categoria === 'MANTER') continue;

    recomendacoes.push({
      fingerprint: `${faixa.campo}|${faixaKey({ startHour: faixa.startHour, endHour: faixa.endHour })}|${periodoRef}|${precoSugerido}`,
      campo: faixa.campo,
      campoLabel: faixa.campoLabel,
      faixa: rotuloFaixa({ startHour: faixa.startHour, endHour: faixa.endHour }),
      faixaKey: faixaKey({ startHour: faixa.startHour, endHour: faixa.endHour }),
      startHour: faixa.startHour,
      endHour: faixa.endHour,
      categoria,
      precoAtual,
      precoSugerido,
      diferencaReais,
      diferencaPct,
      ocupacaoAtual: occ,
      ocupacaoDesejada,
      receitaAtual: faixa.receitaTotal,
      estimativaReceita,
      justificativa,
      nivelConfianca: confianca,
      acaoComercial,
      dadosUtilizados: [...DADOS_BASE, ...dados]
    });
  }

  recomendacoes.sort((a, b) => (b.diferencaReais !== a.diferencaReais ? b.diferencaReais - a.diferencaReais : b.ocupacaoAtual - a.ocupacaoAtual));
  return recomendacoes;
}

// ---------------------------------------------------------------------------
// Simulação de preço (cenários Conservador / Provável / Otimista)
// ---------------------------------------------------------------------------

export function simularPreco(faixa: SlotAnalise, novoPreco: number): SimulacaoResult | null {
  if (novoPreco <= 0 || novoPreco === faixa.precoAtual) return null;
  const porReserva = receitaPorReservaMedia(faixa);
  const deltaPct = faixa.precoAtual > 0 ? round2(((novoPreco - faixa.precoAtual) / faixa.precoAtual) * 100) : 0;
  const aumento = novoPreco > faixa.precoAtual;

  const cenario = (nome: string, fatorOcup: number, nota: string): SimulacaoCenario => {
    const novaOcup = aumento
      ? round2(Math.min(faixa.taxaOcupacao * (1 - fatorOcup), 100))
      : round2(Math.min(faixa.taxaOcupacao * (1 + fatorOcup), 100));
    const aluguelN = porReserva.aluguel > 0 ? porReserva.aluguel * (novoPreco / faixa.precoAtual) : novoPreco;
    const receitaPorHora = round2(aluguelN + porReserva.bar);
    const horasOcupadas = round2((novaOcup / 100) * faixa.horasDisponiveis);
    const receitaTotal = round2(horasOcupadas * receitaPorHora);
    return {
      nome,
      ocupacao: novaOcup,
      horasOcupadas,
      receitaAluguel: round2(horasOcupadas * aluguelN),
      consumoBar: round2(horasOcupadas * porReserva.bar),
      receitaTotal,
      receitaPorHora,
      variacaoOcupacao: round2(novaOcup - faixa.taxaOcupacao),
      variacaoReceita: round2(receitaTotal - faixa.receitaTotal),
      nota
    };
  };

  return {
    campo: faixa.campo,
    campoLabel: faixa.campoLabel,
    faixa: rotuloFaixa(faixa),
    precoAtual: faixa.precoAtual,
    precoNovo: novoPreco,
    deltaPct,
    ocupacaoAtual: faixa.taxaOcupacao,
    receitaAtual: faixa.receitaTotal,
    cenarios: aumento
      ? [
          cenario('Conservador', 0.05, 'Queda leve de ocupação (5%)'),
          cenario('Provável', 0.10, 'Queda moderada de ocupação (10%)'),
          cenario('Otimista', 0.15, 'Queda forte de ocupação (15%)')
        ]
      : [
          cenario('Conservador', 0.10, 'Aumento leve de ocupação (10%)'),
          cenario('Provável', 0.25, 'Aumento moderado de ocupação (25%)'),
          cenario('Otimista', 0.40, 'Aumento forte de ocupação (40%)')
        ],
    aviso: 'PREVISÃO, não garantia. Ela assume a receita média atual por reserva (aluguel + bar) e elasticidade estimada. Confira com dados reais após o período de teste.'
  };
}

// ---------------------------------------------------------------------------
// Relatório principal
// ---------------------------------------------------------------------------

export function computarReporte(data: RawOcupacao, from: Date, to: Date, opts?: { simularPrecoNovo?: number; simularCampo?: CampoId; simularStartHour?: number; simularEndHour?: number }): ReporteOcupacao {
  const dias = dayCount(from, to);
  const { cells, settings, bands } = agregarOcupacao(data, from, to);

  // ---- Por horário (campo x hora) ----
  const porHorarioMap = new Map<string, Partial<AggCell> & { settings: OcupacaoConfig; bands: FaixaPreco[]; dias: number }>();
  const keys = Array.from(cells.keys());
  for (const key of keys) {
    const c = cells.get(key)!;
    const hk = `${c.campo}|${c.startHour}`;
    let acc = porHorarioMap.get(hk);
    if (!acc) {
      acc = { settings, bands, dias, campo: c.campo, startHour: c.startHour, endHour: c.startHour + 1, horasAlugadas: 0, reservas: 0, cancelamentos: 0, faturamentoAluguel: 0, consumoBar: 0, clientesNovos: 0, clientesRecorrentes: 0, antecedenciaHoras: 0, jogosInteiros: 0, meiosJogos: 0, cortesias: 0, descontos: 0 };
      porHorarioMap.set(hk, acc);
    }
    acc.horasAlugadas = (acc.horasAlugadas || 0) + c.horasAlugadas;
    acc.reservas = (acc.reservas || 0) + c.reservas;
    acc.cancelamentos = (acc.cancelamentos || 0) + c.cancelamentos;
    acc.faturamentoAluguel = (acc.faturamentoAluguel || 0) + c.faturamentoAluguel;
    acc.consumoBar = (acc.consumoBar || 0) + c.consumoBar;
    acc.clientesNovos = (acc.clientesNovos || 0) + c.clientesNovos;
    acc.clientesRecorrentes = (acc.clientesRecorrentes || 0) + c.clientesRecorrentes;
    acc.antecedenciaHoras = (acc.antecedenciaHoras || 0) + c.antecedenciaHoras;
    acc.jogosInteiros = (acc.jogosInteiros || 0) + c.jogosInteiros;
    acc.meiosJogos = (acc.meiosJogos || 0) + c.meiosJogos;
    acc.cortesias = (acc.cortesias || 0) + c.cortesias;
    acc.descontos = (acc.descontos || 0) + c.descontos;
  }

  const porHorario: SlotAnalise[] = [];
  for (const campo of ['fut5', 'fut7'] as CampoId[]) {
    for (let h = settings.abertura; h < settings.fechamento; h++) {
      const acc = porHorarioMap.get(`${campo}|${h}`);
      porHorario.push(buildSlot(campo, h, h + 1, acc || { settings, bands, dias, campo, startHour: h, endHour: h + 1 }));
    }
  }

  // ---- Por dia da semana ----
  const porDowMap = new Map<string, Partial<AggCell> & { settings: OcupacaoConfig; bands: FaixaPreco[]; dias: number }>();
  for (const key of keys) {
    const c = cells.get(key)!;
    const dk = `${c.campo}|${c.dow}`;
    let acc = porDowMap.get(dk);
    if (!acc) {
      acc = { settings, bands, dias: Math.ceil(dias / 7), campo: c.campo, startHour: settings.abertura, endHour: settings.fechamento, dow: c.dow };
      porDowMap.set(dk, acc);
    }
    acc.horasAlugadas = (acc.horasAlugadas || 0) + c.horasAlugadas;
    acc.reservas = (acc.reservas || 0) + c.reservas;
    acc.cancelamentos = (acc.cancelamentos || 0) + c.cancelamentos;
    acc.faturamentoAluguel = (acc.faturamentoAluguel || 0) + c.faturamentoAluguel;
    acc.consumoBar = (acc.consumoBar || 0) + c.consumoBar;
  }
  const porDiaSemana: SlotAnalise[] = [];
  for (const campo of ['fut5', 'fut7'] as CampoId[]) {
    for (let d = 0; d < 7; d++) {
      const acc = porDowMap.get(`${campo}|${d}`);
      porDiaSemana.push({
        ...buildSlot(campo, settings.abertura, settings.fechamento, acc || { settings, bands, dias: Math.ceil(dias / 7), campo, startHour: settings.abertura, endHour: settings.fechamento }),
        rotulo: DOW_NOMES[d]
      });
    }
  }

  // ---- Por faixa (banda de preço) ----
  const porFaixa: SlotAnalise[] = [];
  const bandasAgrupadas = new Map<string, { campo: CampoId; startHour: number; endHour: number }>();
  bands.forEach(b => {
    if (!bandasAgrupadas.has(`${b.campo}|${faixaKey(b)}`)) bandasAgrupadas.set(`${b.campo}|${faixaKey(b)}`, { campo: b.campo, startHour: b.startHour, endHour: b.endHour });
  });
  for (const [, b] of bandasAgrupadas) {
    const accs = porHorario.filter(s => s.campo === b.campo && s.startHour >= b.startHour && s.startHour < b.endHour);
    const soma = {
      settings, bands, dias,
      campo: b.campo as CampoId,
      startHour: b.startHour,
      endHour: b.endHour,
      horasAlugadas: accs.reduce((a, s) => a + s.horasAlugadas, 0),
      reservas: accs.reduce((a, s) => a + s.quantidadeReservas, 0),
      cancelamentos: accs.reduce((a, s) => a + s.cancelamentos, 0),
      faturamentoAluguel: accs.reduce((a, s) => a + s.faturamentoAluguel, 0),
      consumoBar: accs.reduce((a, s) => a + s.consumoBar, 0),
      clientesNovos: accs.reduce((a, s) => a + s.clientesNovos, 0),
      clientesRecorrentes: accs.reduce((a, s) => a + s.clientesRecorrentes, 0),
      antecedenciaHoras: accs.reduce((a, s) => a + s.antecedenciaMediaHoras * s.quantidadeReservas, 0),
      jogosInteiros: accs.reduce((a, s) => a + s.jogosInteiros, 0),
      meiosJogos: accs.reduce((a, s) => a + s.meiosJogos, 0),
      cortesias: accs.reduce((a, s) => a + s.cortesias, 0),
      descontos: accs.reduce((a, s) => a + s.descontosPromocionais, 0)
    };
    const slot = buildSlot(b.campo as CampoId, b.startHour, b.endHour, soma);
    porFaixa.push({ ...slot, rotulo: rotuloFaixa(b) });
  }
  porFaixa.sort((a, b) => a.startHour - b.startHour || a.campo.localeCompare(b.campo));

  // ---- Heatmap (campo x dow x hora) ----
  const heatmap: HeatmapCell[] = [];
  const hmap = new Map<string, { campo: CampoId; campoLabel: string; diaSemana: string; dow: number; startHour: number; horasAlugadas: number; receitaTotal: number }>();
  const dowCounts = contarDiasPorDow(from, to);
  for (const key of keys) {
    const c = cells.get(key)!;
    const hk = `${c.campo}|${c.dow}|${c.startHour}`;
    const acc = hmap.get(hk) || { campo: c.campo, campoLabel: campoLabel(c.campo), diaSemana: DOW_NOMES[c.dow], dow: c.dow, startHour: c.startHour, horasAlugadas: 0, receitaTotal: 0 };
    acc.horasAlugadas += c.horasAlugadas;
    acc.receitaTotal += c.faturamentoAluguel + c.consumoBar;
    hmap.set(hk, acc);
  }
  for (const cell of hmap.values()) {
    const diasDow = Math.max(1, dowCounts[cell.dow] || 1);
    const disp = diasDow * capacidadeDe(cell.campo, settings);
    heatmap.push({
      campo: cell.campo,
      campoLabel: cell.campoLabel,
      diaSemana: cell.diaSemana,
      dow: cell.dow,
      startHour: cell.startHour,
      taxaOcupacao: disp > 0 ? round2((cell.horasAlugadas / disp) * 100) : 0,
      receitaTotal: round2(cell.receitaTotal)
    });
  }

  // ---- Indicadores globais ----
  const totHorasDisp = porHorario.reduce((a, s) => a + s.horasDisponiveis, 0);
  const totHorasAlug = porHorario.reduce((a, s) => a + s.horasAlugadas, 0);
  const faturamentoCampos = round2(porHorario.reduce((a, s) => a + s.faturamentoAluguel, 0));
  const consumoBarAssociado = round2(porHorario.reduce((a, s) => a + s.consumoBar, 0));
  const receitaTotal = round2(faturamentoCampos + consumoBarAssociado);
  const reservas = porHorario.reduce((a, s) => a + s.quantidadeReservas, 0);
  const cancelamentos = porHorario.reduce((a, s) => a + s.cancelamentos, 0);
  const ocupacaoMedia = totHorasDisp > 0 ? round2((totHorasAlug / totHorasDisp) * 100) : 0;
  const receitaPorHoraDisponivel = totHorasDisp > 0 ? round2(receitaTotal / totHorasDisp) : 0;
  const receitaPorHoraOcupada = totHorasAlug > 0 ? round2(receitaTotal / totHorasAlug) : 0;
  const oportunidadeEstimada = round2(Math.max(0, totHorasDisp - totHorasAlug) * receitaPorHoraOcupada);

  const maisOcupado = [...porHorario].filter(s => s.quantidadeReservas > 0).sort((a, b) => b.taxaOcupacao - a.taxaOcupacao)[0] || null;
  const maisOcioso = [...porHorario].filter(s => s.horasDisponiveis > 0).sort((a, b) => a.taxaOcupacao - b.taxaOcupacao)[0] || null;

  const indicadores: IndicadoresGlobais = {
    ocupacaoMedia,
    horarioMaisOcupado: maisOcupado ? { campo: maisOcupado.campo, campoLabel: maisOcupado.campoLabel, startHour: maisOcupado.startHour, rotulo: maisOcupado.rotulo, taxaOcupacao: maisOcupado.taxaOcupacao } : null,
    horarioMaisOcioso: maisOcioso ? { campo: maisOcioso.campo, campoLabel: maisOcioso.campoLabel, startHour: maisOcioso.startHour, rotulo: maisOcioso.rotulo, taxaOcupacao: maisOcioso.taxaOcupacao } : null,
    receitaPorHoraDisponivel,
    faturamentoCampos,
    consumoBarAssociado,
    receitaTotal,
    reservas,
    cancelamentos,
    taxaLiquidacao: reservas + cancelamentos > 0 ? round2((cancelamentos / (reservas + cancelamentos)) * 100) : 0,
    oportunidadeEstimada
  };

  // ---- Recomendações (por faixa) ----
  const recomendacoes = gerarRecomendacoes(porFaixa, settings, `${from.toISOString().slice(0, 10)}..${to.toISOString().slice(0, 10)}`);

  // ---- Simulação (opcional) ----
  let simulacao: SimulacaoResult | null = null;
  if (opts?.simularPrecoNovo && opts.simularPrecoNovo > 0) {
    const campo = opts.simularCampo || 'fut5';
    const faixaAlvo = porFaixa.find(f => f.campo === campo && (opts.simularStartHour == null || f.startHour === opts.simularStartHour));
    if (faixaAlvo) simulacao = simularPreco(faixaAlvo, opts.simularPrecoNovo);
  }

  // ---- Comparativos ----
  const comparativos = computarComparativos(data, from, to, dias, settings);

  const semDados = reservas === 0 && cancelamentos === 0;

  return {
    periodo: `${from.toLocaleDateString('pt-BR')} a ${to.toLocaleDateString('pt-BR')}`,
    from: from.toISOString(),
    to: to.toISOString(),
    dias,
    semDados,
    config: settings,
    indicadores,
    porHorario,
    porDiaSemana,
    porFaixa,
    heatmap,
    recomendacoes,
    comparativos,
    ...(simulacao ? { simulacao } : {})
  } as ReporteOcupacao;
}

function computarComparativos(data: RawOcupacao, from: Date, to: Date, dias: number, settings: OcupacaoConfig): ComparativoOcupacao {
  const janelas: ComparativoJanela[] = [30, 60, 90].map(n => {
    const f = new Date(to.getTime() - (n - 1) * 24 * HORA_MS);
    const rep = resumoJanela(data, f, to);
    return { rotulo: `Últimos ${n} dias`, dias: n, ...rep };
  });

  // Mês atual x anterior
  let mesAtualVsAnterior: ComparativoOcupacao['mesAtualVsAnterior'] = null;
  const curStart = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  if (from <= curStart) {
    const mesAtual = resumoJanela(data, curStart, to);
    const prevEnd = new Date(curStart.getTime() - 24 * HORA_MS);
    const prevStart = new Date(Date.UTC(curStart.getUTCFullYear(), curStart.getUTCMonth() - 1, 1));
    const mesAnterior = resumoJanela(data, prevStart, prevEnd);
    if (mesAnterior.reservas > 0 || mesAtual.reservas > 0) {
      mesAtualVsAnterior = [
        { rotulo: 'Mês atual', ...mesAtual },
        { rotulo: 'Mês anterior', ...mesAnterior }
      ];
    }
  }

  // Por dia da semana (vs média)
  const { cells } = agregarOcupacao(data, from, to);
  const dias7 = Math.ceil(dias / 7);
  const porDow: ComparativoOcupacao['porDiaSemana'] = [];
  const mediaGeral = indicadoresMedia(data, from, to);
  for (let d = 0; d < 7; d++) {
    let alug = 0, disp = 0;
    for (const key of cells.keys()) {
      const c = cells.get(key)!;
      if (c.dow !== d) continue;
      alug += c.horasAlugadas;
      disp += dias7 * capacidadeDe(c.campo, settings);
    }
    const occ = disp > 0 ? round2((alug / disp) * 100) : 0;
    porDow.push({ dia: DOW_NOMES[d], dow: d, ocupacao: occ, mediaGeral, diffPct: mediaGeral > 0 ? round2(((occ - mediaGeral) / mediaGeral) * 100) : 0 });
  }

  // Por faixa (vs média)
  const porFaixaComp: ComparativoOcupacao['porFaixa'] = [];
  const bandas = new Map<string, { campo: CampoId; startHour: number; endHour: number }>();
  data.bands.forEach(b => {
    if (!bandas.has(`${b.campo}|${faixaKey(b)}`)) bandas.set(`${b.campo}|${faixaKey(b)}`, { campo: b.campo, startHour: b.startHour, endHour: b.endHour });
  });
  for (const [, b] of bandas) {
    let alug = 0, disp = 0;
    for (const key of cells.keys()) {
      const c = cells.get(key)!;
      if (c.campo !== b.campo || c.startHour < b.startHour || c.startHour >= b.endHour) continue;
      alug += c.horasAlugadas;
      disp += dias * capacidadeDe(c.campo, settings) / (settings.fechamento - settings.abertura);
    }
    const occ = disp > 0 ? round2((alug / disp) * 100) : 0;
    porFaixaComp.push({ faixa: rotuloFaixa(b), faixaKey: faixaKey(b), ocupacao: occ, mediaGeral, diffPct: mediaGeral > 0 ? round2(((occ - mediaGeral) / mediaGeral) * 100) : 0 });
  }

  // Campo menor x maior
  const campoMenorVsMaior: ComparativoOcupacao['campoMenorVsMaior'] = (['fut5', 'fut7'] as CampoId[]).map(campo => {
    const rep = resumoJanela(data, from, to, campo);
    return { campo, campoLabel: campoLabel(campo), ...rep };
  });

  return { janelas, mesAtualVsAnterior, porDiaSemana: porDow, porFaixa: porFaixaComp, campoMenorVsMaior };
}

function resumoJanela(data: RawOcupacao, from: Date, to: Date, campoOnly?: CampoId): { ocupacao: number; receitaTotal: number; reservas: number } {
  const { cells, settings } = agregarOcupacao(data, from, to);
  const dias = dayCount(from, to);
  let alug = 0, disp = 0, reservas = 0, receita = 0;
  for (const key of cells.keys()) {
    const c = cells.get(key)!;
    if (campoOnly && c.campo !== campoOnly) continue;
    alug += c.horasAlugadas;
    disp += dias * capacidadeDe(c.campo, settings);
    reservas += c.reservas;
    receita += c.faturamentoAluguel + c.consumoBar;
  }
  return {
    ocupacao: disp > 0 ? round2((alug / disp) * 100) : 0,
    receitaTotal: round2(receita),
    reservas
  };
}

function indicadoresMedia(data: RawOcupacao, from: Date, to: Date): number {
  const { cells, settings } = agregarOcupacao(data, from, to);
  const dias = dayCount(from, to);
  let alug = 0, disp = 0;
  for (const key of cells.keys()) {
    const c = cells.get(key)!;
    alug += c.horasAlugadas;
    disp += dias * capacidadeDe(c.campo, settings);
  }
  return disp > 0 ? round2((alug / disp) * 100) : 0;
}

// ---------------------------------------------------------------------------
// Elasticidade (análise de alterações de preço)
// ---------------------------------------------------------------------------

// Mede ocupação, receita de aluguel e consumo de bar de uma faixa num intervalo.
export async function medirFaixa(campo: CampoId, startHour: number, endHour: number, winFrom: Date, winTo: Date): Promise<{ ocupacao: number; receita: number; bar: number }> {
  const data = await carregarDadosOcupacao(winFrom, winTo);
  const { cells, settings } = agregarOcupacao(data, winFrom, winTo);
  const dias = dayCount(winFrom, winTo);
  const horasDia = settings.fechamento - settings.abertura;
  let alug = 0, disp = 0, receita = 0, bar = 0;
  for (const key of cells.keys()) {
    const c = cells.get(key)!;
    if (c.campo !== campo || c.startHour < startHour || c.startHour >= endHour) continue;
    alug += c.horasAlugadas;
    disp += dias * capacidadeDe(c.campo, settings) / horasDia;
    receita += c.faturamentoAluguel;
    bar += c.consumoBar;
  }
  return {
    ocupacao: disp > 0 ? round2((alug / disp) * 100) : 0,
    receita: round2(receita),
    bar: round2(bar)
  };
}

export async function analisarElasticidade(_from: Date, _to: Date): Promise<ElasticidadeItem[]> {
  const changes = await prisma.priceChange.findMany({ orderBy: { appliedAt: 'desc' }, take: 50 });
  if (changes.length === 0) return [];

  const config = await carregarConfig();
  const diasAvaliacao = config.diasAvaliacaoElasticidade;
  const bandas = await carregarBands();

  const medir = async (campo: CampoId, startHour: number, endHour: number, winFrom: Date, winTo: Date) => {
    const data = await carregarDadosOcupacao(winFrom, winTo);
    const { cells, settings } = agregarOcupacao(data, winFrom, winTo);
    const dias = dayCount(winFrom, winTo);
    const horasDia = settings.fechamento - settings.abertura;
    let alug = 0, disp = 0, receita = 0, bar = 0;
    for (const key of cells.keys()) {
      const c = cells.get(key)!;
      if (c.campo !== campo || c.startHour < startHour || c.startHour >= endHour) continue;
      alug += c.horasAlugadas;
      disp += dias * capacidadeDe(c.campo, settings) / horasDia;
      receita += c.faturamentoAluguel;
      bar += c.consumoBar;
    }
    return {
      ocupacao: disp > 0 ? round2((alug / disp) * 100) : 0,
      receita: round2(receita),
      bar: round2(bar)
    };
  };

  const itens: ElasticidadeItem[] = [];
  for (const ch of changes) {
    const campo = (ch.campo === 'fut7' ? 'fut7' : 'fut5') as CampoId;
    const band = bandas.find(b => b.campo === campo && b.startHour === ch.startHour);
    const faixa = band ? rotuloFaixa(band) : rotuloFaixa(ch);
    const fimJanela = new Date(ch.appliedAt.getTime() + diasAvaliacao * 24 * HORA_MS);
    const avaliado = new Date() >= fimJanela;
    const antes = await medir(campo, ch.startHour, ch.endHour, new Date(ch.appliedAt.getTime() - diasAvaliacao * 24 * HORA_MS), ch.appliedAt);
    let depois: { ocupacao: number; receita: number; bar: number } | null = null;
    if (avaliado) depois = await medir(campo, ch.startHour, ch.endHour, ch.appliedAt, fimJanela);

    let resultado: string | null = null;
    let avaliacao = 'Ainda em avaliação — aguardando o período mínimo configurado.';
    if (avaliado && depois) {
      if (depois.receita > antes.receita * 1.05) resultado = 'MELHOROU';
      else if (depois.ocupacao > antes.ocupacao * 1.1) resultado = 'AUMENTOU_OCUPACAO';
      else if (ch.precoNovo < ch.precoAnterior) resultado = 'REDUZIU_MARGEM';
      else resultado = 'SEM_EFEITO';
      const txt: Record<string, string> = {
        MELHOROU: 'A alteração melhorou o faturamento do horário.',
        AUMENTOU_OCUPACAO: 'A alteração aumentou apenas a ocupação, sem ganho relevante de receita.',
        REDUZIU_MARGEM: 'A alteração reduziu a margem (preço menor) sem compensar em receita.',
        SEM_EFEITO: 'A alteração não teve efeito relevante nos números do horário.'
      };
      avaliacao = txt[resultado] || avaliacao;
    }

    itens.push({
      id: ch.id,
      campo,
      campoLabel: campoLabel(campo),
      faixa,
      precoAnterior: ch.precoAnterior,
      precoNovo: ch.precoNovo,
      deltaPct: ch.precoAnterior > 0 ? round2(((ch.precoNovo - ch.precoAnterior) / ch.precoAnterior) * 100) : 0,
      appliedAt: ch.appliedAt.toLocaleDateString('pt-BR'),
      ocupacaoAntes: ch.ocupacaoAntes ?? antes.ocupacao,
      ocupacaoDepois: depois?.ocupacao ?? null,
      receitaAntes: ch.receitaAntes ?? antes.receita,
      receitaDepois: depois?.receita ?? null,
      consumoBarAntes: ch.consumoBarAntes ?? antes.bar,
      consumoBarDepois: depois?.bar ?? null,
      status: avaliado ? 'AVALIADO' : 'EM_AVALIACAO',
      resultado,
      avaliacao,
      nota: ch.nota || null
    });
  }
  return itens;
}

// ---------------------------------------------------------------------------
// Persistência de recomendações (histórico de decisões)
// ---------------------------------------------------------------------------

export async function persistirRecomendacoes(recomendacoes: Recomendacao[], _userId: string): Promise<number> {
  let n = 0;
  for (const r of recomendacoes) {
    const existing = await prisma.recommendationHistory.findUnique({ where: { fingerprint: r.fingerprint } });
    if (existing && existing.categoria === r.categoria && existing.precoSugerido === r.precoSugerido) continue;
    await prisma.recommendationHistory.upsert({
      where: { fingerprint: r.fingerprint },
      update: {
        campo: r.campo,
        diaSemana: null,
        horaInicio: r.startHour,
        horaFim: r.endHour,
        categoria: r.categoria,
        precoAtual: r.precoAtual,
        precoSugerido: r.precoSugerido,
        nivelConfianca: r.nivelConfianca,
        motivo: r.justificativa.slice(0, 600),
        periodoRef: r.fingerprint.split('|')[2] || ''
      },
      create: {
        fingerprint: r.fingerprint,
        campo: r.campo,
        horaInicio: r.startHour,
        horaFim: r.endHour,
        categoria: r.categoria,
        precoAtual: r.precoAtual,
        precoSugerido: r.precoSugerido,
        nivelConfianca: r.nivelConfianca,
        motivo: r.justificativa.slice(0, 600),
        periodoRef: r.fingerprint.split('|')[2] || ''
      }
    });
    n += 1;
  }
  return n;
}
