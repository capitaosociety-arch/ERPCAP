'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, LoaderCircle, Save } from 'lucide-react';
import { getRentalScheduleAction, saveRentalScheduleAction } from '../../actions/rental-schedule';
import type { RentalScheduleBlock } from '../../../lib/rental-schedule';

const DAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
];
const FIELDS = ['FUT5', 'FUT7'];

type Row = RentalScheduleBlock & { enabled: boolean; start: string; end: string };

const toTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const toMinute = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

function defaultRows(): Row[] {
  return DAYS.flatMap(day => FIELDS.map(field => ({
    weekday: day.value,
    field,
    startMinute: 18 * 60,
    endMinute: 23 * 60,
    demandWeight: 1,
    isActive: day.value !== 0,
    enabled: day.value !== 0,
    start: '18:00',
    end: '23:00',
  })));
}

export default function RentalScheduleClient() {
  const [rows, setRows] = useState<Row[]>(defaultRows);
  const [canEdit, setCanEdit] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await getRentalScheduleAction();
    setLoading(false);
    if (!res.success || !res.data) {
      setError(res.error || 'Falha ao carregar grade.');
      return;
    }
    setCanEdit(!!res.canEdit);
    setMigrationPending(!!res.migrationPending);
    const base = defaultRows();
    res.data.entries.forEach(entry => {
      const row = base.find(r => r.weekday === entry.weekday && r.field.toUpperCase() === entry.field.toUpperCase());
      if (row) {
        row.enabled = true;
        row.start = toTime(entry.startMinute);
        row.end = toTime(entry.endMinute);
        row.demandWeight = entry.demandWeight;
      }
    });
    setRows(base);
    setError(null);
  };

  useEffect(() => { void load(); }, []);

  const update = (weekday: number, field: string, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => r.weekday === weekday && r.field === field ? { ...r, ...patch } : r));
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    const entries = rows
      .filter(r => r.enabled && r.start && r.end)
      .map(r => ({
        weekday: r.weekday,
        field: r.field,
        startMinute: toMinute(r.start),
        endMinute: toMinute(r.end),
        demandWeight: r.demandWeight,
        isActive: true,
      }));
    const res = await saveRentalScheduleAction(entries);
    setSaving(false);
    if (!res.success) {
      setError(res.error || 'Falha ao salvar grade.');
      return;
    }
    setMessage('Grade operacional salva.');
    await load();
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Clock size={16} /> Grade regular das quadras</h3>
          <p className="text-xs text-gray-400">Funcionamento regular por dia e quadra. Fora da grade, a reserva é extraordinária.</p>
        </div>
        {canEdit && (
          <button onClick={() => void save()} disabled={saving || migrationPending} className="bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50">
            {saving ? <LoaderCircle className="animate-spin" size={14} /> : <Save size={14} />} Salvar grade
          </button>
        )}
      </div>

      {migrationPending && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2 mb-3 flex items-start gap-1">
          <AlertTriangle size={13} className="mt-0.5" /> A grade padrão está ativa, mas a edição administrativa exige a migração RentalOperatingHour.
        </p>
      )}
      {message && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-2 mb-3">{message}</p>}
      {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-2 mb-3">{error}</p>}

      {loading ? (
        <div className="p-4 text-sm text-gray-400 flex items-center gap-2"><LoaderCircle className="animate-spin" size={14} /> Carregando...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase text-gray-400 border-b border-gray-100">
              <tr><th className="p-2">Dia</th><th className="p-2">Quadra</th><th className="p-2">Regular</th><th className="p-2">Início</th><th className="p-2">Fim</th><th className="p-2">Peso demanda</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(row => (
                <tr key={`${row.weekday}-${row.field}`}>
                  <td className="p-2 font-bold text-slate-700">{DAYS.find(d => d.value === row.weekday)?.label}</td>
                  <td className="p-2 text-slate-600">{row.field}</td>
                  <td className="p-2">
                    <input type="checkbox" checked={row.enabled} disabled={!canEdit || migrationPending} onChange={e => update(row.weekday, row.field, { enabled: e.target.checked })} />
                  </td>
                  <td className="p-2">
                    <input type="time" value={row.start} disabled={!canEdit || migrationPending || !row.enabled} onChange={e => update(row.weekday, row.field, { start: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-1 text-xs disabled:bg-gray-50" />
                  </td>
                  <td className="p-2">
                    <input type="time" value={row.end} disabled={!canEdit || migrationPending || !row.enabled} onChange={e => update(row.weekday, row.field, { end: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-1 text-xs disabled:bg-gray-50" />
                  </td>
                  <td className="p-2">
                    <input type="number" min="0" max="5" step="0.1" value={row.demandWeight} disabled={!canEdit || migrationPending || !row.enabled} onChange={e => update(row.weekday, row.field, { demandWeight: Number(e.target.value) })} className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs disabled:bg-gray-50" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-gray-400 mt-3">
        Peso de demanda é usado apenas em análises estratégicas; não altera a ocupação oficial. Dias fora da grade são extraordinários.
      </p>
    </div>
  );
}
