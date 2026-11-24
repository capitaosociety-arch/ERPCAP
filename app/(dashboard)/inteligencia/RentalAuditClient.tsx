'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  getRentalAuditData,
  runRentalAuditNow,
  updateRentalAuditOccurrence,
} from '../../actions/rental-audit';
import {
  RENTAL_AUDIT_ACTION_LABELS,
  RENTAL_AUDIT_SEVERITY_LABELS,
  RENTAL_AUDIT_STATUS_LABELS,
  RENTAL_AUDIT_TECHNICAL_LABELS,
  type RentalAuditData,
  type RentalAuditOccurrenceDto,
} from '../../../lib/rental-audit-types';

const severityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

function fmtCuiaba(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Cuiaba',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function severityClass(severity: string) {
  if (severity === 'CRITICAL') return 'bg-red-100 text-red-700 border-red-200';
  if (severity === 'HIGH') return 'bg-orange-100 text-orange-700 border-orange-200';
  if (severity === 'MEDIUM') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (severity === 'LOW') return 'bg-blue-100 text-blue-700 border-blue-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

function statusClass(status: string) {
  if (status === 'RESOLVED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'ACKNOWLEDGED') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status === 'IGNORED') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function technicalClass(status: string) {
  if (status === 'CLEARED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Falha ao processar a auditoria.';
}

export default function RentalAuditClient({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<RentalAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [period, setPeriod] = useState('ALL');
  const [field, setField] = useState('ALL');
  const [customer, setCustomer] = useState('');
  const [type, setType] = useState('ALL');
  const [status, setStatus] = useState('ALL');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getRentalAuditData();
      setData(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const occurrences = useMemo(() => data?.occurrences ?? [], [data]);
  const types = useMemo(
    () => Array.from(new Set(occurrences.map(item => item.type))).sort(),
    [occurrences]
  );

  const filtered = useMemo(() => {
    const now = Date.now();
    const days = period === 'ALL' ? null : Number(period);
    const customerText = customer.trim().toLowerCase();

    return occurrences
      .filter(item => {
        if (days) {
          if (!item.rentalStartTime) return false;
          if (new Date(item.rentalStartTime).getTime() < now - days * 24 * 60 * 60 * 1000) return false;
        }
        if (field !== 'ALL' && item.resource !== field) return false;
        if (customerText && !String(item.customerName || '').toLowerCase().includes(customerText)) return false;
        if (type !== 'ALL' && item.type !== type) return false;
        if (status === 'ACTIVE' || status === 'CLEARED') {
          if (item.technicalStatus !== status) return false;
        } else if (status !== 'ALL' && item.status !== status) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) || b.lastSeenAt.localeCompare(a.lastSeenAt));
  }, [occurrences, period, field, customer, type, status]);

  const execute = async () => {
    setRunning(true);
    setError('');
    try {
      await runRentalAuditNow();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  const update = async (occurrence: RentalAuditOccurrenceDto, nextStatus: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'IGNORED') => {
    if (!canManage) return;
    if (nextStatus === 'RESOLVED' && !window.confirm('Confirmar resolução administrativa desta ocorrência? A inconsistência continuará ativa até deixar de ser detectada.')) return;
    if (nextStatus === 'IGNORED' && !window.confirm('Confirmar que esta ocorrência será ignorada?')) return;
    const labels: Record<string, string> = {
      OPEN: 'Motivo para reabrir:',
      ACKNOWLEDGED: 'Observação do reconhecimento:',
      RESOLVED: 'Observação da resolução administrativa:',
      IGNORED: 'Motivo para ignorar:',
    };
    const note = window.prompt(labels[nextStatus]) ?? '';
    setProcessingId(occurrence.id);
    setError('');
    try {
      await updateRentalAuditOccurrence(occurrence.id, nextStatus, note);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProcessingId(null);
    }
  };

  const lastRun = data?.lastRun;
  const latestRun = data?.latestRun;
  const counts = data?.counts;
  const criticalHigh = (counts?.bySeverity.CRITICAL || 0) + (counts?.bySeverity.HIGH || 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Última execução</p>
          <p className="text-sm font-black text-slate-800 mt-1">{latestRun ? fmtCuiaba(latestRun.startedAt) : 'Nunca executada'}</p>
          <p className="text-[11px] font-bold text-gray-400 mt-1">
            {latestRun ? `${latestRun.status} · ${latestRun.trigger}` : 'Aguardando primeira execução'}
            {lastRun && latestRun && lastRun.id !== latestRun.id ? ` · última concluída ${fmtCuiaba(lastRun.startedAt)}` : ''}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Ocorrências identificadas</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{lastRun?.occurrencesFound ?? 0}</p>
          <p className="text-[11px] font-bold text-gray-400 mt-1">
            {lastRun ? `${lastRun.totalRentals} reservas analisadas · ${lastRun.totalLinkedItems} vínculos` : 'Sem execução concluída'}
          </p>
          <p className="text-[11px] font-bold text-gray-400 mt-1">{lastRun?.occurrencesCleared ?? 0} eliminadas tecnicamente na execução</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Pendentes / reconhecidas</p>
          <p className="text-2xl font-black text-amber-600 mt-1">{counts?.pending ?? 0}</p>
          <p className="text-[11px] font-bold text-gray-400 mt-1">{counts?.acknowledged ?? 0} reconhecidas, ainda ativas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Críticas / altas</p>
          <p className={`text-2xl font-black mt-1 ${criticalHigh > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{criticalHigh}</p>
          <p className="text-[11px] font-bold text-gray-400 mt-1">{counts?.resolved ?? 0} resolvidas administrativamente, {counts?.cleared ?? 0} eliminadas tecnicamente</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2"><ShieldCheck size={16} className="text-mrts-blue" /> Auditoria de Reservas</h2>
            <p className="text-[11px] text-gray-400 mt-1">
              Consultas somente de leitura nas tabelas operacionais. Escrita restrita às tabelas de auditoria. Reconhecer não significa corrigir; a eliminação técnica só ocorre quando a inconsistência deixa de ser detectada.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void load()} disabled={loading || running} className="rounded-xl border-2 border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 flex items-center gap-1.5 disabled:opacity-50">
              <RefreshCw size={14} /> Atualizar
            </button>
            {canManage && (
              <button onClick={() => void execute()} disabled={running || loading} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-50">
                {running ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />} Executar Auditoria
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {severityOrder.map(severity => (
            <span key={severity} className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${severityClass(severity)}`}>
              {RENTAL_AUDIT_SEVERITY_LABELS[severity]}: {counts?.bySeverity[severity] || 0}
            </span>
          ))}
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-bold text-red-700">{error}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <option value="ALL">Todo o período</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="365">Últimos 365 dias</option>
          </select>
          <select value={field} onChange={e => setField(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <option value="ALL">Todos os campos</option>
            <option value="FUT5">FUT5</option>
            <option value="FUT7">FUT7</option>
          </select>
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Filtrar cliente" className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-slate-700" />
          <select value={type} onChange={e => setType(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <option value="ALL">Todos os tipos</option>
            {types.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <option value="ALL">Todos os status</option>
            <option value="OPEN">Aberta</option>
            <option value="ACKNOWLEDGED">Reconhecida</option>
            <option value="RESOLVED">Resolvida administrativamente</option>
            <option value="IGNORED">Ignorada</option>
            <option value="ACTIVE">Ainda detectada</option>
            <option value="CLEARED">Eliminada tecnicamente</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm font-bold text-gray-400">
            <LoaderCircle className="animate-spin inline mr-2" size={16} /> Carregando auditoria...
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm font-bold text-gray-400 flex flex-col items-center gap-2">
            <CheckCircle2 size={24} className="text-emerald-500" /> Nenhuma ocorrência para os filtros selecionados.
          </div>
        ) : filtered.map(item => {
          const expanded = expandedId === item.id;
          const busy = processingId === item.id;
          return (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${severityClass(item.severity)}`}>
                      {RENTAL_AUDIT_SEVERITY_LABELS[item.severity] || item.severity}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass(item.status)}`}>
                      {RENTAL_AUDIT_STATUS_LABELS[item.status] || item.status}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${technicalClass(item.technicalStatus)}`}>
                      {RENTAL_AUDIT_TECHNICAL_LABELS[item.technicalStatus] || item.technicalStatus}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">{item.type}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-800 mt-2">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.details}</p>
                  <p className="text-[10px] text-gray-400 mt-2">
                    {item.rentalId ? `Reserva ${item.rentalId}` : ''}
                    {item.orderId ? ` · Comanda ${item.orderId}` : ''}
                    {item.customerName ? ` · Cliente ${item.customerName}` : ''}
                    {item.resource ? ` · ${item.resource}` : ''}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {item.rentalStartTime ? `Período ${fmtCuiaba(item.rentalStartTime)} até ${fmtCuiaba(item.rentalEndTime)}` : 'Sem período de reserva associado'}
                    {' · '}Primeira vez {fmtCuiaba(item.firstSeenAt)} · Última {fmtCuiaba(item.lastSeenAt)} · {item.occurrenceCount}x
                  </p>
                  {item.resolutionNote && <p className="text-[10px] text-emerald-700 mt-1">Observação: {item.resolutionNote}</p>}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button onClick={() => setExpandedId(expanded ? null : item.id)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600">
                    {expanded ? 'Ocultar detalhes' : 'Detalhes e histórico'}
                  </button>
                  {canManage && (
                    <>
                      {item.status !== 'ACKNOWLEDGED' && item.status !== 'RESOLVED' && (
                        <button disabled={busy} onClick={() => void update(item, 'ACKNOWLEDGED')} className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-700 disabled:opacity-50">Reconhecer</button>
                      )}
                      {item.status !== 'RESOLVED' && (
                        <button disabled={busy} onClick={() => void update(item, 'RESOLVED')} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 disabled:opacity-50">Resolver</button>
                      )}
                      {item.status !== 'IGNORED' && (
                        <button disabled={busy} onClick={() => void update(item, 'IGNORED')} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 disabled:opacity-50">Ignorar</button>
                      )}
                      {item.status !== 'OPEN' && (
                        <button disabled={busy} onClick={() => void update(item, 'OPEN')} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-700 disabled:opacity-50">Reabrir</button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {expanded && (
                <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Evidências</p>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[10px] text-slate-600">{JSON.stringify(item.evidence, null, 2)}</pre>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Histórico da ocorrência</p>
                      <div className="mt-2 space-y-2">
                        {item.events.length === 0 ? (
                          <p className="text-[11px] text-gray-400">Sem eventos registrados.</p>
                        ) : item.events.map(event => (
                          <div key={event.id} className="rounded-lg bg-white px-2.5 py-2 text-[11px] text-slate-600">
                            <p className="font-bold">{RENTAL_AUDIT_ACTION_LABELS[event.action] || event.action} · {fmtCuiaba(event.createdAt)}</p>
                            <p className="text-gray-400">{event.userName || 'Sistema'}{event.note ? ` · ${event.note}` : ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-gray-500">
                    <p>Reconhecida: {fmtCuiaba(item.acknowledgedAt)}{item.acknowledgedByName ? ` por ${item.acknowledgedByName}` : ''}</p>
                    <p>Resolvida: {fmtCuiaba(item.resolvedAt)}{item.resolvedByName ? ` por ${item.resolvedByName}` : ''}</p>
                    <p>Eliminada tecnicamente: {fmtCuiaba(item.clearedAt)}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-2"><Clock3 size={14} /> Histórico das execuções</h3>
        <div className="mt-3 space-y-2">
          {(data?.runs || []).length === 0 ? <p className="text-xs text-gray-400">Nenhuma execução registrada.</p> : (data?.runs || []).map(run => (
            <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
              <span className="flex items-center gap-1.5">
                {run.status === 'ERROR' ? <ShieldAlert size={13} className="text-red-500" /> : <ShieldCheck size={13} className="text-emerald-600" />}
                {fmtCuiaba(run.startedAt)} · {run.trigger}
              </span>
              <span>{run.status} · {run.totalRentals} reservas · {run.occurrencesFound} detectadas · {run.occurrencesCleared} eliminadas · {run.checksRun} verificações</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
