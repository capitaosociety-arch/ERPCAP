'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CircleDollarSign, CreditCard, Edit3, ReceiptText, Save, User as UserIcon, X } from 'lucide-react';
import {
  formatAgendaDateDisplay,
  formatAgendaMoney,
  formatAgendaTime,
  minutesToLabel,
  type AgendaInconsistency,
  type AgendaReservation,
  type AgendaTone,
} from '../../../lib/agenda';
import { formatRentalDateInput, formatRentalTimeInput, parseRentalTime } from '../../../lib/rental-time';
import {
  buildRentalCorrectionWindow,
  type RentalChangeLogView,
  type RentalSnapshot,
} from '../../../lib/rental-corrections';
import {
  correctRentalScheduleAction,
  getRentalChangeLogsAction,
} from '../../actions/rental-correction';

const toneBadge: Record<AgendaTone, string> = {
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  yellow: 'bg-amber-100 text-amber-800 border-amber-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
};

const severityClass: Record<AgendaInconsistency['severity'], string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-sky-50 text-sky-700 border-sky-200',
  info: 'bg-slate-50 text-slate-600 border-slate-200',
};

type CorrectionForm = {
  date: string;
  start: string;
  end: string;
  field: string;
  duration: string;
  reason: string;
};

const changedFieldLabels: Record<string, string> = {
  field: 'Campo',
  date: 'Data',
  startTime: 'Início',
  endTime: 'Fim',
  duration: 'Duração',
};

function correctionFormFromReservation(reservation: AgendaReservation): CorrectionForm {
  return {
    date: formatRentalDateInput(reservation.startTime),
    start: formatRentalTimeInput(reservation.startTime),
    end: formatRentalTimeInput(reservation.endTime),
    field: reservation.resource,
    duration: String(reservation.durationMinutes),
    reason: '',
  };
}

function correctionFormFromSnapshot(snapshot: RentalSnapshot): CorrectionForm {
  return {
    date: snapshot.date,
    start: snapshot.start,
    end: snapshot.end,
    field: snapshot.resource,
    duration: String(snapshot.durationMinutes),
    reason: '',
  };
}

function signedDuration(minutes: number) {
  if (minutes === 0) return '0min';
  return `${minutes > 0 ? '+' : ''}${minutes}min`;
}

function durationLabel(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return '—';
  const total = Math.max(0, Math.round(Number(minutes)));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}min`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`;
}

function paymentMethodsLabel(reservation: AgendaReservation) {
  if (!reservation.paymentMethods.length) return 'Sem pagamento vinculado';
  return reservation.paymentMethods.map((payment) => `${payment.label}: ${formatAgendaMoney(payment.amount)}`).join(' • ');
}

function receivedLabel(reservation: AgendaReservation) {
  if (reservation.receivedAmount != null) return formatAgendaMoney(reservation.receivedAmount);
  if (reservation.financialStatus === 'PARTIAL_UNALLOCATED') return 'Não individualizado';
  if (reservation.financialStatus === 'PAID_UNPROVEN' || reservation.financialStatus === 'SUBSCRIPTION_UNLINKED') return 'Sem comprovação';
  return 'Não registrado';
}

function balanceLabel(reservation: AgendaReservation) {
  if (reservation.balanceAmount != null) return formatAgendaMoney(reservation.balanceAmount);
  if (reservation.financialStatus === 'PARTIAL_UNALLOCATED') return 'Não individualizado';
  if (reservation.financialStatus === 'PAID_UNPROVEN' || reservation.financialStatus === 'SUBSCRIPTION_UNLINKED') return 'Sem comprovação';
  return 'Não registrado';
}

function InfoRow({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className={`text-right text-xs ${strong ? 'font-black text-slate-800' : 'font-bold text-slate-700'}`}>{value}</span>
    </div>
  );
}

export default function AgendaDetailsModal({
  reservation,
  canCorrect = false,
  onClose,
  onCorrected,
}: {
  reservation: AgendaReservation;
  canCorrect?: boolean;
  onClose: () => void;
  onCorrected?: () => void;
}) {
  const [form, setForm] = useState<CorrectionForm>(() => correctionFormFromReservation(reservation));
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [logs, setLogs] = useState<RentalChangeLogView[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, saving]);

  useEffect(() => {
    let active = true;
    setLogsLoading(true);
    setLogsError('');
    getRentalChangeLogsAction(reservation.id)
      .then((result) => {
        if (!active) return;
        if (result.success) setLogs(result.logs);
        else setLogsError(result.error);
      })
      .catch((error: any) => {
        if (active) setLogsError(error?.message || 'Não foi possível carregar o histórico.');
      })
      .finally(() => {
        if (active) setLogsLoading(false);
      });
    return () => { active = false; };
  }, [reservation.id, historyVersion]);

  const syncDuration = (nextForm: CorrectionForm) => {
    try {
      return String(buildRentalCorrectionWindow(nextForm).durationMinutes);
    } catch {
      return '';
    }
  };

  const updateStart = (value: string) => {
    setForm((previous) => {
      const next = { ...previous, start: value };
      return { ...next, duration: syncDuration(next) };
    });
    setFormError('');
  };

  const updateEnd = (value: string) => {
    setForm((previous) => {
      const next = { ...previous, end: value };
      return { ...next, duration: syncDuration(next) };
    });
    setFormError('');
  };

  const updateDuration = (value: string) => {
    setForm((previous) => {
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 24 * 60) {
        return { ...previous, duration: value };
      }
      try {
        const start = parseRentalTime(previous.start);
        const endTime = minutesToLabel((start.minutesOfDay + parsed) % (24 * 60));
        return { ...previous, duration: String(parsed), end: endTime };
      } catch {
        return { ...previous, duration: value };
      }
    });
    setFormError('');
  };

  const startCorrection = () => {
    setForm(correctionFormFromReservation(reservation));
    setFormError('');
    setSuccessMessage('');
    setIsCorrecting(true);
    window.setTimeout(() => {
      document.getElementById('agenda-correction-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const cancelCorrection = () => {
    setForm(correctionFormFromReservation(reservation));
    setFormError('');
    setIsCorrecting(false);
  };

  const saveCorrection = async () => {
    setSaving(true);
    setFormError('');
    setSuccessMessage('');
    try {
      const result = await correctRentalScheduleAction({
        rentalId: reservation.id,
        date: form.date,
        start: form.start,
        end: form.end,
        field: form.field,
        reason: form.reason,
      });
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setForm(correctionFormFromSnapshot(result.log.afterData));
      setIsCorrecting(false);
      setSuccessMessage('Reserva corrigida. Registros financeiros originais preservados.');
      setHistoryVersion((value) => value + 1);
      onCorrected?.();
    } catch (error: any) {
      setFormError(error?.message || 'Não foi possível corrigir a reserva.');
    } finally {
      setSaving(false);
    }
  };

  const earliestLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const durationDifference = earliestLog ? reservation.durationMinutes - earliestLog.beforeData.durationMinutes : null;

  const operationalChangePending = form.date !== formatRentalDateInput(reservation.startTime)
    || form.start !== formatRentalTimeInput(reservation.startTime)
    || form.end !== formatRentalTimeInput(reservation.endTime)
    || form.field !== reservation.resource;

  const cashSessionText = reservation.cashSessions.length
    ? reservation.cashSessions.map((session) =>
        `${session.status === 'OPEN' ? 'Aberto' : 'Fechado'}${session.closedAt ? ` em ${formatAgendaDateDisplay(session.closedAt)} ${formatAgendaTime(session.closedAt)}` : ''}`
      ).join(' • ')
    : 'Sem sessão vinculada';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 p-4 sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-black text-slate-800 sm:text-xl">{reservation.customerName}</h2>
              <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase ${reservation.isSubscriber ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                {reservation.isSubscriber ? 'Mensalista' : 'Avulso'}
              </span>
              <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase ${toneBadge[reservation.financialTone]}`}>
                {reservation.financialLabel}
              </span>
              {reservation.hasInconsistency && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-black uppercase text-purple-700">
                  <AlertTriangle size={11} /> Inconsistência
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {reservation.resource} • {formatAgendaDateDisplay(reservation.startTime)} • {formatAgendaTime(reservation.startTime)}–{formatAgendaTime(reservation.endTime)} • {durationLabel(reservation.durationMinutes)}
            </p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100" aria-label="Fechar detalhes">
            <X size={18} />
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:p-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><UserIcon size={15} /> Identificação</h3>
            <InfoRow label="Cliente" value={reservation.customerName} />
            <InfoRow label="Telefone" value={reservation.customerPhone || 'Não registrado'} />
            <InfoRow label="Campo" value={reservation.resource} strong />
            <InfoRow label="Origem" value={reservation.sourceLabel} />
            <InfoRow label="Situação operacional" value={reservation.operationalLabel} />
            <InfoRow label="Situação financeira" value={reservation.financialLabel} strong />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><CalendarClock size={15} /> Tempo e duração</h3>
            <InfoRow label="Início original" value={earliestLog ? `${earliestLog.beforeData.date} ${earliestLog.beforeData.start}` : 'Não registrado'} />
            <InfoRow label="Fim original" value={earliestLog ? `${earliestLog.beforeData.date} ${earliestLog.beforeData.end}` : 'Não registrado'} />
            <InfoRow label="Duração original" value={earliestLog ? durationLabel(earliestLog.beforeData.durationMinutes) : 'Não registrado'} />
            <InfoRow label="Início vigente" value={`${formatAgendaDateDisplay(reservation.startTime)} ${formatAgendaTime(reservation.startTime)}`} />
            <InfoRow label="Fim vigente" value={`${formatAgendaDateDisplay(reservation.endTime)} ${formatAgendaTime(reservation.endTime)}`} />
            <InfoRow label="Duração vigente" value={durationLabel(reservation.durationMinutes)} strong />
            <InfoRow label="Diferença de duração" value={durationDifference == null ? 'Não registrado' : signedDuration(durationDifference)} />
            <InfoRow label="Tempo adicional/reduzido" value={durationDifference == null ? 'Não registrado' : signedDuration(durationDifference)} />
            <InfoRow label="Início efetivamente jogado" value="Não registrado" />
            <InfoRow label="Fim efetivamente jogado" value="Não registrado" />
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] font-medium text-amber-800">
              Correções anteriores à Fase 2A não possuem histórico recuperável. As correções realizadas a partir desta fase aparecem no histórico abaixo.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><CircleDollarSign size={15} /> Financeiro do aluguel</h3>
            <InfoRow label="Valor original do aluguel" value={earliestLog ? formatAgendaMoney(earliestLog.beforeData.totalAmount) : 'Não registrado'} />
            <InfoRow label="Valor contratado atual" value={formatAgendaMoney(reservation.contractedAmount)} strong />
            <InfoRow label="Subtotal do item na operação" value={reservation.itemSubtotal == null ? 'Sem vínculo comprovado' : formatAgendaMoney(reservation.itemSubtotal)} />
            <InfoRow label="Desconto rateado (metodologia oficial)" value={reservation.allocatedDiscount == null ? 'Não aplicável' : formatAgendaMoney(reservation.allocatedDiscount)} />
            <InfoRow label="Valor líquido final do item" value={reservation.finalItemNet == null ? 'Não registrado' : formatAgendaMoney(reservation.finalItemNet)} />
            <InfoRow label="Acréscimos" value="Não registrado" />
            <InfoRow label="Valor recebido pelo aluguel" value={receivedLabel(reservation)} strong />
            <InfoRow label="Saldo a receber pelo aluguel" value={balanceLabel(reservation)} strong />
            <p className="mt-2 text-[11px] font-medium text-slate-500">{reservation.financialNote}</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><ReceiptText size={15} /> Operação vinculada</h3>
            {reservation.orderId ? (
              <>
                <InfoRow label="Operação" value={`#${reservation.orderId}`} strong />
                <InfoRow label="Status da operação" value={reservation.orderStatus || 'Não registrado'} />
                <InfoRow label="Canal Comanda/PDV" value="Não registrado no banco" />
                <InfoRow label="Nota/identificação" value={reservation.orderNotes || 'Não registrado'} />
                <InfoRow label="Abertura" value={reservation.orderOpenedAt ? `${formatAgendaDateDisplay(reservation.orderOpenedAt)} ${formatAgendaTime(reservation.orderOpenedAt)}` : 'Não registrado'} />
                <InfoRow label="Fechamento" value={reservation.orderClosedAt ? `${formatAgendaDateDisplay(reservation.orderClosedAt)} ${formatAgendaTime(reservation.orderClosedAt)}` : 'Em aberto'} />
                <InfoRow label="Total da comanda" value={formatAgendaMoney(reservation.orderTotal)} />
                <InfoRow label="Recebido na comanda" value={formatAgendaMoney(reservation.orderReceived)} />
                <InfoRow label="Saldo da comanda" value={formatAgendaMoney(reservation.orderBalance)} />
                <InfoRow label="Formas de pagamento (operação)" value={paymentMethodsLabel(reservation)} />
                <InfoRow label="Sessão de caixa" value={cashSessionText} />
              </>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                Sem vínculo comprovado de Comanda ou operação do PDV. Não há como atribuir pagamento individual.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><AlertTriangle size={15} /> Inconsistências e histórico</h3>
            {reservation.inconsistencies.length === 0 ? (
              <p className="text-xs font-medium text-slate-500">Nenhuma inconsistência identificada para esta reserva.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {reservation.inconsistencies.map((item, index) => (
                  <div key={`${item.type}-${item.entityId}-${index}`} className={`rounded-xl border p-2.5 text-xs ${severityClass[item.severity]}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black">{item.label}</span>
                      <span className="rounded bg-white/60 px-1.5 py-0.5 text-[9px] font-black uppercase">{item.historical ? 'Histórico' : 'Atual'}</span>
                      <span className="rounded bg-white/60 px-1.5 py-0.5 text-[9px] font-black uppercase">{item.severity}</span>
                    </div>
                    <p className="mt-1 font-medium">{item.detail}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Histórico de correções administrativas</h4>
              {logsLoading ? (
                <p className="mt-2 text-[11px] font-medium text-slate-400">Carregando histórico...</p>
              ) : logsError ? (
                <p className="mt-2 rounded-lg bg-red-50 p-2 text-[11px] font-medium text-red-700">{logsError}</p>
              ) : logs.length === 0 ? (
                <p className="mt-2 text-[11px] font-medium text-slate-500">Nenhuma correção administrativa registrada. Registros anteriores à Fase 2A não possuem histórico estruturado.</p>
              ) : (
                <div className="mt-2 flex flex-col gap-2">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[11px]">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-black text-slate-700">{formatAgendaDateDisplay(log.createdAt)} {formatAgendaTime(log.createdAt)}</span>
                        <span className="font-bold text-slate-500">{log.changedByName}</span>
                      </div>
                      <p className="mt-1 font-medium text-slate-600">
                        {log.beforeData.resource} • {log.beforeData.date} {log.beforeData.start}–{log.beforeData.end}
                        <span className="mx-1.5 text-slate-400">→</span>
                        {log.afterData.resource} • {log.afterData.date} {log.afterData.start}–{log.afterData.end}
                      </p>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">Campos: {log.changedFields.map((field) => changedFieldLabels[field] || field).join(', ')}</p>
                      <p className="mt-1 text-[10px] font-medium text-slate-600">Justificativa: {log.reason}</p>
                      {log.requiresFinancialReview && (
                        <p className="mt-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-800">Conferência financeira necessária — nenhum valor foi alterado</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {canCorrect && (
            <section id="agenda-correction-section" className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-black text-slate-800"><Edit3 size={15} /> Correção administrativa</h3>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">Exclusiva para administradores. Preserva comanda, pagamentos, vínculos e caixa originais.</p>
                </div>
                {!isCorrecting && (
                  <button type="button" onClick={startCorrection} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white transition hover:bg-indigo-700">
                    <Edit3 size={13} /> Corrigir reserva
                  </button>
                )}
              </div>

              {successMessage && (
                <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-bold text-emerald-700">{successMessage}</p>
              )}

              {isCorrecting && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Data do jogo</span>
                    <input type="date" value={form.date} onChange={(event) => { setForm({ ...form, date: event.target.value, duration: syncDuration({ ...form, date: event.target.value }) }); setFormError(''); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Campo</span>
                    <select value={form.field} onChange={(event) => { setForm({ ...form, field: event.target.value }); setFormError(''); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500">
                      <option value="FUT5">FUT5</option>
                      <option value="FUT7">FUT7</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Horário inicial</span>
                    <input type="time" value={form.start} onChange={(event) => updateStart(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Horário final</span>
                    <input type="time" value={form.end} onChange={(event) => updateEnd(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Duração (minutos)</span>
                    <input type="number" min="1" max="1439" step="1" value={form.duration} onChange={(event) => updateDuration(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500" />
                  </label>
                  <div className="flex items-end">
                    <p className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-medium text-slate-500">Duração calculada: <strong className="text-slate-700">{form.duration || '—'} min</strong></p>
                  </div>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Justificativa obrigatória</span>
                    <textarea value={form.reason} onChange={(event) => { setForm({ ...form, reason: event.target.value }); setFormError(''); }} maxLength={1000} className="h-20 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500" placeholder="Descreva o motivo da correção do lançamento..." />
                  </label>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-medium text-amber-800 sm:col-span-2">
                    Os registros financeiros originais, vínculos e fechamentos de caixa serão preservados. Se a alteração implicar diferença de preço, nenhum valor será cobrado ou estornado nesta fase; a regularização será tratada na Fase 2B.
                  </div>
                  {operationalChangePending && (
                    <p className="text-[10px] font-bold text-amber-700 sm:col-span-2">Alteração operacional detectada. O valor contratado e a comanda original permanecerão inalterados.</p>
                  )}
                  {formError && <p className="rounded-lg bg-red-50 p-2 text-[11px] font-bold text-red-700 sm:col-span-2">{formError}</p>}
                  <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
                    <button type="button" disabled={saving} onClick={cancelCorrection} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Cancelar correção</button>
                    <button type="button" disabled={saving} onClick={saveCorrection} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white transition hover:bg-indigo-700 disabled:opacity-50">
                      <Save size={13} /> {saving ? 'Salvando...' : 'Salvar correção'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><CreditCard size={13} /> {canCorrect ? 'Consulta com correção administrativa restrita a administradores.' : 'Módulo somente leitura.'}</p>
          <button onClick={onClose} disabled={saving} className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50">Fechar</button>
        </div>
      </div>
    </div>
  );
}
