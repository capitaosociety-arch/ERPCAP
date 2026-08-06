export type PeriodoKey = '7d' | '30d' | '90d' | 'month';

export interface Periodos {
  label: string;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export function getCuiabaDateStr(d: Date = new Date()): string {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = f.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${day}`;
}

export function buildPeriods(periodo: PeriodoKey): Periodos {
  const todayStr = getCuiabaDateStr();
  const [y, m] = todayStr.split('-');

  if (periodo === 'month') {
    const curM = parseInt(m, 10);
    const curY = parseInt(y, 10);
    let prevM = curM - 1;
    let prevY = curY;
    if (prevM === 0) { prevM = 12; prevY -= 1; }

    const from = new Date(`${y}-${m}-01T00:00:00-04:00`);
    const to = new Date(`${todayStr}T23:59:59-04:00`);
    const prevFrom = new Date(`${prevY}-${String(prevM).padStart(2, '0')}-01T00:00:00-04:00`);
    const prevTo = new Date(from.getTime() - 1000);

    const fLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Cuiaba' });
    return { label: `Mês de ${fLabel.format(from)}`, from, to, prevFrom, prevTo };
  }

  const n = periodo === '7d' ? 7 : periodo === '30d' ? 30 : 90;
  const from = new Date(`${addDays(todayStr, -(n - 1))}T00:00:00-04:00`);
  const to = new Date(`${todayStr}T23:59:59-04:00`);
  const prevTo = new Date(`${addDays(todayStr, -n)}T23:59:59-04:00`);
  const prevFrom = new Date(`${addDays(todayStr, -(2 * n - 1))}T00:00:00-04:00`);
  return { label: `Últimos ${n} dias`, from, to, prevFrom, prevTo };
}

export function isRentalItem(it: any): boolean {
  const prodName = it?.product?.name?.toLowerCase() || '';
  const catName = it?.product?.category?.name?.toLowerCase() || '';
  const svcName = it?.service?.name?.toLowerCase() || '';
  return !!it?.serviceId ||
    catName.includes('aluguel') || catName.includes('campo') ||
    prodName.includes('aluguel') || prodName.includes('campo') ||
    svcName.includes('aluguel') || svcName.includes('campo');
}

export function isFut5(name: string): boolean {
  return /fut5|fut\s*5|futebol\s*5/i.test(name);
}

export function isFut7(name: string): boolean {
  return /fut7|fut\s*7|futebol\s*7/i.test(name);
}

export function monthKey(d: Date): string {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit' });
  const parts = f.formatToParts(d);
  const y = parts.find(p => p.type === 'year')?.value;
  const mo = parts.find(p => p.type === 'month')?.value;
  return `${mo}/${y}`;
}

export function round2(v: number): number {
  return Number((v || 0).toFixed(2));
}

export function fmtMoney(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtPct(v: number): string {
  return `${(v >= 0 ? '+' : '')}${(v || 0).toFixed(1).replace('.', ',')}%`;
}

export function fmtNumber(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function pctChange(cur: number, prev: number): number {
  if (prev === 0) return cur === 0 ? 0 : 100;
  return ((cur - prev) / prev) * 100;
}
