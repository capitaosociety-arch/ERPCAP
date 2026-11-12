import { prisma } from './prisma';

export interface RentalScheduleBlock {
  id?: string;
  weekday: number; // 0 domingo ... 6 sábado
  field: string;
  startMinute: number;
  endMinute: number;
  demandWeight: number;
  isActive: boolean;
}

export interface RentalScheduleConfig {
  entries: RentalScheduleBlock[];
  source: 'database' | 'default' | 'unavailable';
  configured: boolean;
  note: string;
}

export const FIELDS = ['FUT5', 'FUT7'] as const;
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const DEFAULT_RENTAL_SCHEDULE: RentalScheduleBlock[] = [1, 2, 3, 4, 5, 6].flatMap(weekday =>
  FIELDS.flatMap(field => [{
    weekday,
    field,
    startMinute: 18 * 60,
    endMinute: 23 * 60,
    demandWeight: 1,
    isActive: true,
  }])
);

export const DEFAULT_SCHEDULE_NOTE = 'Regra de negócio informada: funcionamento regular de segunda a sábado, 18h–23h, por quadra. Domingo, madrugada, dia e demais horários são extraordinários mediante demanda.';

export function validateSchedule(entries: RentalScheduleBlock[]): RentalScheduleBlock[] {
  return entries
    .filter(e => e && Number.isInteger(e.weekday) && e.weekday >= 0 && e.weekday <= 6)
    .map(e => ({
      weekday: e.weekday,
      field: String(e.field || '').trim().toUpperCase(),
      startMinute: Math.max(0, Math.min(1439, Math.floor(Number(e.startMinute)))),
      endMinute: Math.max(0, Math.min(1440, Math.ceil(Number(e.endMinute)))),
      demandWeight: Math.max(0, Math.min(5, Number.isFinite(Number(e.demandWeight)) ? Number(e.demandWeight) : 1)),
      isActive: e.isActive !== false,
    }))
    .filter(e => e.field && e.endMinute > e.startMinute)
    .sort((a, b) => a.weekday - b.weekday || a.field.localeCompare(b.field) || a.startMinute - b.startMinute);
}

export async function getRentalSchedule(): Promise<RentalScheduleConfig> {
  try {
    const rows = await prisma.rentalOperatingHour.findMany({
      where: { isActive: true },
      orderBy: [{ weekday: 'asc' }, { field: 'asc' }, { startMinute: 'asc' }],
    });
    if (rows.length > 0) {
      return {
        entries: rows.map(r => ({ id: r.id, weekday: r.weekday, field: r.field, startMinute: r.startMinute, endMinute: r.endMinute, demandWeight: r.demandWeight, isActive: r.isActive })),
        source: 'database',
        configured: true,
        note: 'Grade regular cadastrada administrativamente.',
      };
    }
  } catch (error) {
    // Tabela de configuração pode ainda não existir em produção (migração pendente).
  }
  return {
    entries: DEFAULT_RENTAL_SCHEDULE,
    source: 'default',
    configured: false,
    note: `${DEFAULT_SCHEDULE_NOTE} A edição administrativa exige a migração RentalOperatingHour.`,
  };
}

export function timeToMinute(value: string): number {
  const [h, m] = String(value).split(':').map(Number);
  return Math.max(0, Math.min(1440, (h || 0) * 60 + (m || 0)));
}

export function minuteToTime(minute: number): string {
  const m = Math.max(0, Math.min(1440, Math.floor(minute)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function weekDayCuiaba(date: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Cuiaba', weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

export function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function localMinuteOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Cuiaba', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

export function scheduleBlocksFor(schedule: RentalScheduleBlock[], weekday: number, field: string): RentalScheduleBlock[] {
  return schedule.filter(e => e.isActive && e.weekday === weekday && e.field.toUpperCase() === field.toUpperCase());
}

/** União de minutos regulares para um dia/campo, sem duplicar sobreposições. */
export function regularMinutesForDay(schedule: RentalScheduleBlock[], weekday: number, field: string): number {
  const blocks = scheduleBlocksFor(schedule, weekday, field).sort((a, b) => a.startMinute - b.startMinute);
  let total = 0;
  let start = -1;
  let end = -1;
  blocks.forEach(b => {
    if (start < 0) { start = b.startMinute; end = b.endMinute; return; }
    if (b.startMinute <= end) { end = Math.max(end, b.endMinute); return; }
    total += end - start;
    start = b.startMinute;
    end = b.endMinute;
  });
  if (start >= 0) total += end - start;
  return total;
}

export function isRegularMinute(schedule: RentalScheduleBlock[], date: Date, field: string, minute: number): boolean {
  return scheduleBlocksFor(schedule, weekDayCuiaba(date), field)
    .some(b => minute >= b.startMinute && minute < b.endMinute);
}

export function scheduleDemandWeight(schedule: RentalScheduleBlock[], weekday: number, field: string, minute: number): number {
  const block = scheduleBlocksFor(schedule, weekday, field).find(b => minute >= b.startMinute && minute < b.endMinute);
  return block?.demandWeight ?? 1;
}
