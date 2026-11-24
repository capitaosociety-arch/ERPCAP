'use client';

import { useEffect } from 'react';
import { AlertTriangle, CalendarClock, CircleDollarSign, CreditCard, ReceiptText, User as UserIcon, X } from 'lucide-react';
import {
  formatAgendaDateDisplay,
  formatAgendaMoney,
  formatAgendaTime,
  type AgendaInconsistency,
  type AgendaReservation,
  type AgendaTone,
} from '../../../lib/agenda';

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

export default function AgendaDetailsModal({ reservation, onClose }: { reservation: AgendaReservation; onClose: () => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
            <InfoRow label="Início original" value="Não registrado" />
            <InfoRow label="Fim original" value="Não registrado" />
            <InfoRow label="Duração original" value="Não registrado" />
            <InfoRow label="Início vigente" value={`${formatAgendaDateDisplay(reservation.startTime)} ${formatAgendaTime(reservation.startTime)}`} />
            <InfoRow label="Fim vigente" value={`${formatAgendaDateDisplay(reservation.endTime)} ${formatAgendaTime(reservation.endTime)}`} />
            <InfoRow label="Duração vigente" value={durationLabel(reservation.durationMinutes)} strong />
            <InfoRow label="Diferença de duração" value="Não registrado" />
            <InfoRow label="Tempo adicional/reduzido" value="Não registrado" />
            <InfoRow label="Início efetivamente jogado" value="Não registrado" />
            <InfoRow label="Fim efetivamente jogado" value="Não registrado" />
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] font-medium text-amber-800">
              A estrutura atual não preserva histórico de alterações de horário, duração ou campo. Nenhum valor anterior foi presumido.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><CircleDollarSign size={15} /> Financeiro do aluguel</h3>
            <InfoRow label="Valor original do aluguel" value="Não registrado" />
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
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-medium text-slate-600">
              Histórico de alterações de duração: não registrado de forma estruturada. A Agenda não preenche valores históricos sem comprovação.
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><CreditCard size={13} /> Módulo somente leitura.</p>
          <button onClick={onClose} className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white transition hover:bg-slate-800">Fechar</button>
        </div>
      </div>
    </div>
  );
}
