'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Filter,
  LayoutGrid,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import { formatRentalDateInput } from '../../../lib/rental-time';
import {
  AGENDA_BUSINESS_END_MINUTE,
  AGENDA_BUSINESS_START_MINUTE,
  AGENDA_FIELDS,
  DEFAULT_AGENDA_FILTERS,
  agendaMonthGridDays,
  formatAgendaDateDisplay,
  formatAgendaHours,
  formatAgendaMoney,
  formatAgendaTime,
  formatAgendaWeekdayShort,
  minutesToLabel,
  reservationSegmentsForDay,
  shiftAgendaAnchor,
  addAgendaYears,
  type AgendaData,
  type AgendaField,
  type AgendaFilters,
  type AgendaReservation,
  type AgendaTone,
  type AgendaView,
} from '../../../lib/agenda';
import { getAgendaDataAction } from '../../actions/agenda';
import AgendaDetailsModal from './AgendaDetailsModal';

const MINUTE_HEIGHT = 0.75;
const SCROLL_HOUR = 17;

const toneBlock: Record<AgendaTone, string> = {
  green: 'border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-600',
  yellow: 'border-amber-500 bg-amber-300 text-amber-950 hover:bg-amber-400',
  orange: 'border-orange-600 bg-orange-500 text-white hover:bg-orange-600',
  red: 'border-red-600 bg-red-500 text-white hover:bg-red-600',
  slate: 'border-slate-500 bg-slate-400 text-white hover:bg-slate-500',
  purple: 'border-purple-600 bg-purple-500 text-white hover:bg-purple-600',
};

const toneChip: Record<AgendaTone, string> = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  yellow: 'border-amber-200 bg-amber-50 text-amber-800',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  purple: 'border-purple-200 bg-purple-50 text-purple-700',
};

const severityChip: Record<string, string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  high: 'border-orange-200 bg-orange-50 text-orange-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-800',
  low: 'border-sky-200 bg-sky-50 text-sky-700',
  info: 'border-slate-200 bg-slate-50 text-slate-600',
};

function classForReservation(reservation: AgendaReservation) {
  if (reservation.operationalStatus === 'NO_SHOW') return toneBlock.slate;
  return toneBlock[reservation.financialTone];
}

function isTodayKey(dateKey: string) {
  return dateKey === formatRentalDateInput(new Date());
}

function MetricCard({ label, value, hint, tone = 'slate', icon }: { label: string; value: React.ReactNode; hint?: string; tone?: AgendaTone; icon?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border bg-white p-3 shadow-sm ${tone === 'slate' ? 'border-slate-200' : toneChip[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wider opacity-80">{label}</p>
        {icon}
      </div>
      <p className="mt-1 text-xl font-black tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] font-medium opacity-70">{hint}</p>}
    </div>
  );
}

function ReservationBlock({
  reservation,
  dayKey,
  startMinute,
  endMinute,
  onClick,
  compact = false,
}: {
  reservation: AgendaReservation;
  dayKey: string;
  startMinute: number;
  endMinute: number;
  onClick: () => void;
  compact?: boolean;
}) {
  const height = Math.max(18, (endMinute - startMinute) * MINUTE_HEIGHT);
  const continuation = startMinute === 0 && reservation.startDateKey !== dayKey;
  const showCustomer = height >= (compact ? 34 : 38);
  const showFinancial = height >= (compact ? 52 : 58);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${reservation.customerName} • ${reservation.resource} • ${minutesToLabel(startMinute)}–${minutesToLabel(endMinute)} • ${reservation.financialLabel}`}
      className={`absolute left-1 right-1 z-10 overflow-hidden rounded-lg border px-1.5 py-0.5 text-left shadow-sm transition ${classForReservation(reservation)} ${reservation.hasInconsistency ? 'ring-2 ring-purple-600 ring-offset-1' : ''}`}
      style={{ top: startMinute * MINUTE_HEIGHT, height }}
    >
      <div className="flex items-center gap-1 text-[9px] font-black leading-tight">
        {continuation && <span aria-hidden>↳</span>}
        <span>{minutesToLabel(startMinute)}–{minutesToLabel(endMinute)}</span>
        <span className={`ml-auto rounded px-1 text-[8px] uppercase ${reservation.isSubscriber ? 'bg-white/30' : 'bg-black/10'}`}>{reservation.isSubscriber ? 'M' : 'A'}</span>
      </div>
      {showCustomer && <p className="mt-0.5 truncate text-[10px] font-bold leading-tight">{reservation.customerName}</p>}
      {showFinancial && <p className="mt-0.5 truncate text-[9px] font-medium leading-tight opacity-90">{reservation.financialLabel}</p>}
    </button>
  );
}

function TimeGrid({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 z-0 border-y border-sky-100 bg-sky-100/40" style={{ top: AGENDA_BUSINESS_START_MINUTE * MINUTE_HEIGHT, height: (AGENDA_BUSINESS_END_MINUTE - AGENDA_BUSINESS_START_MINUTE) * MINUTE_HEIGHT }} />
      {Array.from({ length: 24 }, (_, hour) => (
        <div key={hour} className="pointer-events-none absolute inset-x-0 z-0 border-t border-slate-200/70" style={{ top: hour * 60 * MINUTE_HEIGHT }} />
      ))}
      {children}
    </>
  );
}

function TimeColumn() {
  return (
    <div className="sticky left-0 z-20 h-[1080px] shrink-0 border-r border-slate-200 bg-white">
      {Array.from({ length: 24 }, (_, hour) => (
        <div key={hour} className="absolute left-0 right-0 -translate-y-1/2 pr-1 text-right text-[10px] font-bold text-slate-400" style={{ top: hour * 60 * MINUTE_HEIGHT }}>
          {String(hour).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  );
}

function DayTimeline({ data, fields, onSelect }: { data: AgendaData; fields: AgendaField[]; onSelect: (reservation: AgendaReservation) => void }) {
  const dayKey = data.range.days[0];
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_HOUR * 60 * MINUTE_HEIGHT;
  }, [data.range.from]);

  return (
    <div ref={scrollRef} className="max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
      <div className="min-w-[720px]">
        <div className="sticky top-0 z-30 grid border-b border-slate-200 bg-white/95 backdrop-blur" style={{ gridTemplateColumns: `56px repeat(${fields.length}, minmax(260px, 1fr))` }}>
          <div className="sticky left-0 z-40 bg-white/95 px-2 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Hora</div>
          {fields.map((field) => (
            <div key={field} className="border-l border-slate-100 px-3 py-3 text-center">
              <p className="text-xs font-black text-slate-700">{field}</p>
              <p className="text-[10px] font-medium text-slate-400">{field === 'FUT5' ? 'Campo 5' : 'Campo 7'}</p>
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(${fields.length}, minmax(260px, 1fr))` }}>
          <TimeColumn />
          {fields.map((field) => (
            <div key={field} className="relative h-[1080px] overflow-hidden border-l border-slate-100 bg-slate-50/80">
              <TimeGrid>
                {data.reservations
                  .filter((reservation) => reservation.field === field)
                  .flatMap((reservation) => reservationSegmentsForDay(reservation, dayKey).map((segment, index) => (
                    <ReservationBlock
                      key={`${reservation.id}-${field}-${index}`}
                      reservation={reservation}
                      dayKey={dayKey}
                      startMinute={segment.startMinute}
                      endMinute={segment.endMinute}
                      onClick={() => onSelect(reservation)}
                    />
                  )))}
              </TimeGrid>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekTimeline({ data, fields, onSelect }: { data: AgendaData; fields: AgendaField[]; onSelect: (reservation: AgendaReservation) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_HOUR * 60 * MINUTE_HEIGHT;
  }, [data.range.from]);

  return (
    <div ref={scrollRef} className="max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
      <div className="min-w-[1120px]">
        <div className="sticky top-0 z-30 grid border-b border-slate-200 bg-white/95 backdrop-blur" style={{ gridTemplateColumns: '56px repeat(7, minmax(150px, 1fr))' }}>
          <div className="sticky left-0 z-40 bg-white/95 px-2 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Hora</div>
          {data.range.days.map((dayKey) => {
            const [year, month, day] = dayKey.split('-');
            const weekday = formatAgendaWeekdayShort(`${dayKey}T12:00:00-03:00`);
            return (
              <div key={dayKey} className={`border-l border-slate-100 px-1 py-2 text-center ${isTodayKey(dayKey) ? 'bg-sky-50' : ''}`}>
                <p className="text-[10px] font-black uppercase text-slate-500">{weekday}</p>
                <p className="text-xs font-black text-slate-800">{day}/{month}</p>
                <p className="text-[9px] font-medium text-slate-400">{year}</p>
                <div className={`mt-1 grid ${fields.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-px text-[8px] font-black uppercase text-slate-400`}>
                  {fields.map((field) => <span key={field}>{field}</span>)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, minmax(150px, 1fr))' }}>
          <TimeColumn />
          {data.range.days.map((dayKey) => (
            <div key={dayKey} className={`relative h-[1080px] border-l border-slate-100 ${isTodayKey(dayKey) ? 'bg-sky-50/30' : 'bg-slate-50/80'}`}>
              <TimeGrid>
                {fields.map((field, fieldIndex) => (
                  <div
                    key={field}
                    className={`absolute inset-y-0 overflow-hidden ${
                      fields.length === 1
                        ? 'left-0 right-0'
                        : fieldIndex === 0
                          ? 'left-0 right-1/2 border-r border-slate-200/70'
                          : 'left-1/2 right-0'
                    }`}
                  >
                    {data.reservations
                      .filter((reservation) => reservation.field === field)
                      .flatMap((reservation) => reservationSegmentsForDay(reservation, dayKey).map((segment, index) => (
                        <ReservationBlock
                          key={`${reservation.id}-${field}-${dayKey}-${index}`}
                          reservation={reservation}
                          dayKey={dayKey}
                          startMinute={segment.startMinute}
                          endMinute={segment.endMinute}
                          onClick={() => onSelect(reservation)}
                          compact
                        />
                      )))}
                  </div>
                ))}
              </TimeGrid>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ data, onOpenDay }: { data: AgendaData; onOpenDay: (dayKey: string) => void }) {
  const days = useMemo(() => agendaMonthGridDays(data.range.anchor), [data.range.anchor]);
  const monthPrefix = data.range.anchor.slice(0, 7);

  const statsByDay = useMemo(() => {
    const map = new Map<string, { fut5: number; fut7: number; hours: number; tones: AgendaTone[]; names: string[] }>();
    for (const dayKey of days) {
      const entries = data.reservations
        .map((reservation) => ({ reservation, segments: reservationSegmentsForDay(reservation, dayKey) }))
        .filter((entry) => entry.segments.length > 0);
      if (entries.length === 0) continue;
      const fut5 = entries.filter((entry) => entry.reservation.field === 'FUT5').length;
      const fut7 = entries.filter((entry) => entry.reservation.field === 'FUT7').length;
      const minutes = entries.reduce((sum, entry) => sum + entry.segments.reduce((segmentSum, segment) => segmentSum + (segment.endMinute - segment.startMinute), 0), 0);
      map.set(dayKey, {
        fut5,
        fut7,
        hours: Math.round(minutes / 6) / 10,
        tones: Array.from(new Set(entries.map((entry) => entry.reservation.financialTone))),
        names: entries.map((entry) => `${entry.reservation.startTimeLabel} ${entry.reservation.customerName} (${entry.reservation.resource})`),
      });
    }
    return map;
  }, [data.reservations, days]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <div className="min-w-[780px]">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label) => (
            <div key={label} className="px-2 py-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((dayKey) => {
            const isCurrentMonth = dayKey.startsWith(monthPrefix);
            const stats = statsByDay.get(dayKey);
            const today = isTodayKey(dayKey);
            return (
              <button
                key={dayKey}
                type="button"
                onClick={() => onOpenDay(dayKey)}
                title={stats?.names.join('\n') || 'Sem reservas'}
                className={`min-h-[108px] border-b border-r border-slate-100 p-2 text-left transition hover:bg-sky-50 ${isCurrentMonth ? 'bg-white' : 'bg-slate-50/70 text-slate-300'} ${today ? 'ring-2 ring-inset ring-mrts-blue' : ''}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-xs font-black ${isCurrentMonth ? 'text-slate-700' : 'text-slate-300'}`}>{Number(dayKey.slice(8, 10))}</span>
                  {stats && <span className="text-[9px] font-bold text-slate-400">{formatAgendaHours(stats.hours)}</span>}
                </div>
                {stats ? (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex flex-wrap gap-1">
                      {stats.fut5 > 0 && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-black text-sky-700">FUT5 {stats.fut5}</span>}
                      {stats.fut7 > 0 && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-black text-indigo-700">FUT7 {stats.fut7}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {stats.tones.map((tone) => <span key={tone} className={`h-2 w-2 rounded-full border ${toneChip[tone]}`} />)}
                    </div>
                    <p className="line-clamp-2 text-[9px] font-medium text-slate-500">{stats.names[0]}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-[9px] font-medium text-slate-300">Livre</p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AuditPanel({ data }: { data: AgendaData }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><AlertTriangle size={16} className="text-purple-600" /> Auditoria e inconsistências</h3>
          <p className="mt-0.5 text-[11px] font-medium text-slate-500">
            Atuais: <strong className="text-purple-700">{data.audit.current}</strong> • Históricas: <strong>{data.audit.historical}</strong> • Sem correção automática
          </p>
        </div>
        <span className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-black uppercase text-purple-700">
          Corte histórico: 14/11/2026
        </span>
      </div>

      {data.audit.types.length === 0 ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700">Nenhuma inconsistência identificada no período e filtros selecionados.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {data.audit.types.map((type) => (
            <div key={type.type} className={`rounded-xl border p-2.5 ${severityChip[type.severity] || severityChip.info}`}>
              <p className="text-[11px] font-black">{type.label}</p>
              <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-bold uppercase">
                <span className="rounded bg-white/70 px-1.5 py-0.5">Atual {type.current}</span>
                <span className="rounded bg-white/70 px-1.5 py-0.5">Histórico {type.historical}</span>
                <span className="rounded bg-white/70 px-1.5 py-0.5">{type.severity}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.audit.unlinkedItems.length > 0 && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">Itens de aluguel sem reserva vinculada</h4>
            <span className="text-[10px] font-bold text-slate-400">
              Atual {formatAgendaMoney(data.audit.unlinkedCurrentValue)} • Histórico {formatAgendaMoney(data.audit.unlinkedHistoricalValue)}
            </span>
          </div>
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-2">Data</th>
                  <th className="p-2">Operação</th>
                  <th className="p-2">Item</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2 text-right">Classificação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.audit.unlinkedItems.slice(0, 20).map((item) => (
                  <tr key={item.id}>
                    <td className="p-2 text-slate-500">{formatAgendaDateDisplay(item.orderDate)}</td>
                    <td className="p-2 font-bold text-slate-700">#{item.orderId}</td>
                    <td className="p-2 text-slate-600">{item.name}</td>
                    <td className="p-2 text-right font-bold text-slate-700">{formatAgendaMoney(item.subtotal)}</td>
                    <td className="p-2 text-right">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${item.historical ? 'bg-slate-100 text-slate-600' : 'bg-purple-100 text-purple-700'}`}>
                        {item.historical ? 'Histórico' : 'Atual'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.audit.unlinkedItems.length > 20 && <p className="mt-1 text-[10px] font-medium text-slate-400">Exibindo os 20 mais recentes de {data.audit.unlinkedItems.length}.</p>}
        </div>
      )}
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[145px] flex-1 flex-col gap-1">
      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 outline-none transition focus:border-mrts-blue">
        {children}
      </select>
    </label>
  );
}

export default function AgendaClient({ initialData }: { initialData: AgendaData }) {
  const [view, setView] = useState<AgendaView>(initialData.range.view);
  const [anchor, setAnchor] = useState(initialData.range.anchor);
  const [filters, setFilters] = useState<AgendaFilters>(initialData.filters);
  const [data, setData] = useState<AgendaData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async (nextView: AgendaView, nextAnchor: string, nextFilters: AgendaFilters, silent = false) => {
    const requestId = ++requestRef.current;
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const result = await getAgendaDataAction({ view: nextView, anchor: nextAnchor, filters: nextFilters });
      if (requestId !== requestRef.current) return;
      if (result.success) {
        setData(result.data);
        setView(result.data.range.view);
        setAnchor(result.data.range.anchor);
        setFilters(result.data.filters);
        setError('');
      } else {
        setError(result.error);
      }
    } catch (loadError: any) {
      if (requestId === requestRef.current) setError(loadError?.message || 'Não foi possível atualizar a Agenda.');
    } finally {
      if (requestId === requestRef.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void load(view, anchor, filters, true);
      }
    };
    const interval = window.setInterval(tick, 60000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [anchor, filters, load, view]);

  const selectedReservation = useMemo(() => data.reservations.find((reservation) => reservation.id === selectedId) || null, [data.reservations, selectedId]);
  useEffect(() => {
    if (selectedId && !data.reservations.some((reservation) => reservation.id === selectedId)) setSelectedId(null);
  }, [data.reservations, selectedId]);

  const fields = useMemo<AgendaField[]>(() => (filters.field === 'ALL' ? AGENDA_FIELDS : [filters.field]), [filters.field]);
  const rangeLabel = data.range.label;
  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const key of Object.keys(DEFAULT_AGENDA_FILTERS) as Array<keyof AgendaFilters>) {
      if (filters[key] !== DEFAULT_AGENDA_FILTERS[key]) count++;
    }
    return count;
  }, [filters]);

  const changeView = (nextView: AgendaView) => {
    setView(nextView);
    void load(nextView, anchor, filters);
  };

  const goTo = (nextAnchor: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextAnchor)) return;
    setAnchor(nextAnchor);
    void load(view, nextAnchor, filters);
  };

  const navigate = (delta: number) => goTo(shiftAgendaAnchor(view, anchor, delta));
  const navigateYear = (delta: number) => goTo(addAgendaYears(anchor, delta));
  const goToday = () => goTo(formatRentalDateInput(new Date()));
  const updateFilter = (patch: Partial<AgendaFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    void load(view, anchor, next);
  };
  const resetFilters = () => {
    setFilters(DEFAULT_AGENDA_FILTERS);
    void load(view, anchor, DEFAULT_AGENDA_FILTERS);
  };

  const anchorYear = Number(anchor.slice(0, 4));
  const yearOptions = Array.from({ length: 11 }, (_, index) => anchorYear - 5 + index);
  const monthView = view === 'month';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">Agenda</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Reservas FUT5 e FUT7 integradas a Clientes, Comandas, PDV e Central de Inteligência.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 font-bold text-emerald-700"><Clock size={12} /> Atualização automática 60s</span>
          <span className="rounded-lg border border-slate-200 bg-white px-2 py-1">Atualizado {formatAgendaTime(data.generatedAt)}</span>
          <button type="button" onClick={() => void load(view, anchor, filters)} disabled={loading} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
          <CircleAlert size={15} /> {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {([
                ['day', 'Dia', CalendarDays],
                ['week', 'Semana', CalendarRange],
                ['month', 'Mês', LayoutGrid],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeView(value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition ${view === value ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button type="button" onClick={() => navigateYear(-1)} title="Ano anterior" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50">
                <span className="text-[10px] font-black">«</span>
              </button>
              <button type="button" onClick={() => navigate(-1)} title="Período anterior" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50">
                <ChevronLeft size={15} />
              </button>
              <button type="button" onClick={goToday} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">Hoje</button>
              <button type="button" onClick={() => navigate(1)} title="Próximo período" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50">
                <ChevronRight size={15} />
              </button>
              <button type="button" onClick={() => navigateYear(1)} title="Próximo ano" className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50">
                <span className="text-[10px] font-black">»</span>
              </button>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Data</span>
              <input type="date" value={anchor} onChange={(event) => { if (event.target.value) goTo(event.target.value); }} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 outline-none focus:border-mrts-blue" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Ano</span>
              <select value={anchorYear} onChange={(event) => goTo(`${event.target.value}${anchor.slice(4)}`)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 outline-none focus:border-mrts-blue">
                {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>

            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Período</span>
              <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">{rangeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500"><CalendarClock size={12} /> {data.range.days.length} dia(s)</span>
            <button type="button" onClick={() => setShowAudit((current) => !current)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition ${showAudit || data.audit.current > 0 ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              <AlertTriangle size={14} /> Auditoria {data.audit.current > 0 ? `(${data.audit.current})` : ''}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <Select label="Campo" value={filters.field} onChange={(value) => updateFilter({ field: value as AgendaFilters['field'] })}>
            <option value="ALL">FUT5 e FUT7</option>
            <option value="FUT5">FUT5</option>
            <option value="FUT7">FUT7</option>
          </Select>
          <Select label="Cliente" value={filters.customerId} onChange={(value) => updateFilter({ customerId: value })}>
            <option value="">Todos os clientes</option>
            {data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </Select>
          <Select label="Tipo de cliente" value={filters.customerType} onChange={(value) => updateFilter({ customerType: value as AgendaFilters['customerType'] })}>
            <option value="ALL">Mensalistas e avulsos</option>
            <option value="MENSALISTA">Mensalistas</option>
            <option value="AVULSO">Avulsos</option>
          </Select>
          <Select label="Situação financeira" value={filters.financial} onChange={(value) => updateFilter({ financial: value as AgendaFilters['financial'] })}>
            <option value="ALL">Todas</option>
            <option value="PAID">Pagas</option>
            <option value="PARTIAL">Parciais</option>
            <option value="PENDING">Pendentes</option>
            <option value="CANCELED">Canceladas</option>
            <option value="UNPROVEN">Sem comprovação</option>
          </Select>
          <Select label="Situação operacional" value={filters.operational} onChange={(value) => updateFilter({ operational: value as AgendaFilters['operational'] })}>
            <option value="ALL">Todas</option>
            <option value="SCHEDULED">Agendadas</option>
            <option value="CONFIRMED">Confirmadas</option>
            <option value="IN_PROGRESS">Em andamento</option>
            <option value="COMPLETED">Concluídas</option>
            <option value="NO_SHOW">No-show</option>
            <option value="CANCELED">Canceladas</option>
          </Select>
          <Select label="Origem" value={filters.source} onChange={(value) => updateFilter({ source: value as AgendaFilters['source'] })}>
            <option value="ALL">Todas</option>
            <option value="SUBSCRIPTION">Mensalidade</option>
            <option value="WALK_IN">Avulso</option>
            <option value="MANUAL">Manual</option>
            <option value="LEGACY">Legado</option>
          </Select>
          <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
            <Filter size={13} /> Limpar {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Total de reservas" value={data.metrics.totalReservations} hint={`${data.metrics.noShow} no-show`} icon={<CalendarDays size={15} className="text-slate-400" />} />
        <MetricCard label="Pagas" value={data.metrics.paid} tone="green" icon={<CircleAlert size={15} />} />
        <MetricCard label="Parciais" value={data.metrics.partial} tone="orange" icon={<CircleAlert size={15} />} />
        <MetricCard label="Pendentes" value={data.metrics.pending} tone="yellow" icon={<Clock size={15} />} />
        <MetricCard label="Canceladas" value={data.metrics.canceled} tone="red" icon={<X size={15} />} />
        <MetricCard label="Sem comprovação" value={data.metrics.unproven} tone="yellow" hint="Pago/manual ou mensalidade sem vínculo" icon={<AlertTriangle size={15} />} />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Valor contratado" value={formatAgendaMoney(data.metrics.contractedValue)} hint="Reservas não canceladas no período" icon={<CircleAlert size={15} className="text-slate-400" />} />
        <MetricCard label="Valor recebido" value={formatAgendaMoney(data.metrics.receivedValue)} hint="Somente parcelas atribuíveis/comprovadas" tone="green" />
        <MetricCard label="Saldo a receber comprovado" value={formatAgendaMoney(data.metrics.balanceValue)} hint="Sem rateios presumidos" tone="yellow" />
        <MetricCard label="Inconsistências" value={`${data.metrics.inconsistencyCountCurrent} atuais`} hint={`${data.metrics.inconsistencyCountHistorical} históricas`} tone="purple" icon={<AlertTriangle size={15} />} />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500"><Clock size={13} /> Horas reservadas por campo</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {fields.map((field) => <span key={field} className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-black text-sky-700">{field}: {formatAgendaHours(data.metrics.hoursReserved[field])}</span>)}
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black text-slate-700">Total: {formatAgendaHours(data.metrics.hoursReserved.total)}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500"><Clock size={13} /> Horas disponíveis por campo</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {fields.map((field) => <span key={field} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">{field}: {formatAgendaHours(data.metrics.hoursAvailable[field])}</span>)}
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black text-slate-700">Total: {formatAgendaHours(data.metrics.hoursAvailable.total)}</span>
          </div>
          <p className="mt-1 text-[9px] font-medium text-slate-400">Disponibilidade regular: segunda a sábado, 18h–23h. Reservas fora desse horário continuam visíveis.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500">
        <span className="uppercase tracking-wider text-slate-400">Legenda</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-emerald-200 bg-emerald-50" /> Pago confirmado</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-amber-200 bg-amber-50" /> Pendente</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-orange-200 bg-orange-50" /> Parcial/não individualizado</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-red-200 bg-red-50" /> Cancelado</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-slate-300 bg-slate-100" /> Livre</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2 border-purple-500 bg-white" /> Inconsistência</span>
        <span className="ml-auto inline-flex items-center gap-1 text-slate-400"><Users size={12} /> M = mensalista, A = avulso</span>
      </div>

      {monthView ? (
        <MonthGrid data={data} onOpenDay={(dayKey) => { setView('day'); setAnchor(dayKey); void load('day', dayKey, filters); }} />
      ) : view === 'week' ? (
        <WeekTimeline data={data} fields={fields} onSelect={(reservation) => setSelectedId(reservation.id)} />
      ) : (
        <DayTimeline data={data} fields={fields} onSelect={(reservation) => setSelectedId(reservation.id)} />
      )}

      {showAudit && <AuditPanel data={data} />}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[10px] font-medium text-slate-500">
        <p className="font-black uppercase tracking-wider text-slate-400">Limitações da Fase 1</p>
        <ul className="mt-1 grid gap-1 sm:grid-cols-2">
          {data.limitations.map((limitation) => <li key={limitation} className="flex gap-1"><span className="text-slate-300">•</span>{limitation}</li>)}
        </ul>
      </div>

      {selectedReservation && <AgendaDetailsModal reservation={selectedReservation} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
