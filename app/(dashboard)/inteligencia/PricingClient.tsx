'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Calculator, Database, LoaderCircle, RefreshCw, ShieldAlert, Target, TrendingUp
} from 'lucide-react';
import { getPricingReportAction, simulatePricingScenarioAction } from '../../actions/pricing';
import type {
  PricingReport,
  PricingScenarioInput,
  PricingScenarioResult,
  PriceScenario,
  TargetSegment,
} from '../../../lib/pricing-intelligence';

const money = (v: number | null | undefined) => v == null ? 'â€”' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number | null | undefined) => v == null ? 'â€”' : `${v.toFixed(1).replace('.', ',')}%`;

const SCENARIOS: { value: PriceScenario; label: string }[] = [
  { value: 'maintain', label: 'Manter preços' },
  { value: 'regular_idle_discount', label: 'Desconto horário ocioso regular' },
  { value: 'new_group_package', label: 'Pacote novos grupos' },
  { value: 'existing_extra_bookings', label: 'Reservas extras de clientes existentes' },
  { value: 'extra_dynamic_price', label: 'Preço diferenciado extraordinário' },
  { value: 'temporary_promo', label: 'Promoção temporária' },
];
const TARGETS: { value: TargetSegment; label: string }[] = [
  { value: 'new_or_inactive', label: 'Novos/inativos' },
  { value: 'existing_extra', label: 'Clientes extraordinários existentes' },
  { value: 'regular_customers', label: 'Clientes de horários regulares' },
  { value: 'all', label: 'Todos' },
];

export default function PricingClient({ period }: { period: string }) {
  const [report, setReport] = useState<PricingReport | null>(null);
  const [scenario, setScenario] = useState<PricingScenarioResult | null>(null);
  const [input, setInput] = useState<PricingScenarioInput>({
    scenario: 'new_group_package',
    discountPct: 10,
    priceChangePct: 0,
    additionalBookings: 3,
    targetSegment: 'new_or_inactive',
    migrationRiskPct: 0,
  });
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    const res = await getPricingReportAction(period, forceRefresh);
    setLoading(false);
    if (!res.success) {
      setReport(null);
      setError(res.error || 'Falha ao carregar precificação.');
      return;
    }
    setReport(res.data || null);
  }, [period]);

  useEffect(() => { void load(false); }, [load]);

  const simulate = async () => {
    setSimulating(true);
    setError(null);
    const res = await simulatePricingScenarioAction(period, input);
    setSimulating(false);
    if (!res.success) {
      setScenario(null);
      setError(res.error || 'Falha ao simular.');
      return;
    }
    setScenario(res.data || null);
  };

  const regular = report?.regularHistory;
  const extra = report?.extraHistory;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Calculator size={18} className="text-mrts-blue" /> Precificação e oportunidades
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Inteligência consultiva sobre ocupação, preços praticados, canibalização e demanda extraordinária.
          </p>
        </div>
        <button onClick={() => void load(true)} disabled={loading} className="bg-white border border-gray-200 text-slate-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2 w-fit">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 mb-5 text-sm font-medium">{error}</div>}
      {loading && <div className="bg-white border border-gray-100 rounded-2xl p-8 mb-5 flex items-center justify-center gap-2 text-gray-500 font-bold"><LoaderCircle className="animate-spin" size={18} /> Analisando reservas e preços...</div>}

      {!loading && report && !report.available && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 mb-5 text-sm font-medium">{report.reason}</div>
      )}

      {!loading && report?.available && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-5">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Ocupação regular</p><p className="text-xl font-black text-slate-800 mt-1">{pct(report.occupancy.overall.ocupacaoEfetivaPct)}</p></div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Extraordinário</p><p className="text-xl font-black text-amber-700 mt-1">{report.occupancy.overall.extraHoras || 0}h</p><p className="text-[10px] text-gray-400">{money(report.occupancy.overall.extraReceita)}</p></div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Preço regular/h (histórico)</p><p className="text-xl font-black text-slate-800 mt-1">{money(regular?.avgPriceHour)}</p><p className="text-[10px] text-gray-400">{regular?.bookings || 0} reservas pagas</p></div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Preço extraordinário/h (histórico)</p><p className="text-xl font-black text-slate-800 mt-1">{money(extra?.avgPriceHour)}</p><p className="text-[10px] text-gray-400">{extra?.bookings || 0} reservas pagas</p></div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Clientes recorrentes</p><p className="text-xl font-black text-slate-800 mt-1">{report.recurringCustomerCount}</p></div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Risco canibalização</p><p className={`text-xl font-black mt-1 ${report.candidates.length ? 'text-rose-700' : 'text-emerald-700'}`}>{report.candidates.length ? 'Atenção' : 'Sem evidência'}</p></div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
            <div className="xl:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-1">Mapa histórico de demanda por dia, horário e quadra</h3>
              <p className="text-xs text-gray-400 mb-3">Regular e extraordinário separados; receita paga.</p>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 text-[9px] uppercase text-gray-400 sticky top-0"><tr><th className="p-2">Quadra</th><th className="p-2">Dia</th><th className="p-2">Hora</th><th className="p-2 text-right">Regular</th><th className="p-2 text-right">Extra</th><th className="p-2 text-right">Receita</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {report.heatmap.slice(0, 50).map(row => (
                      <tr key={`${row.field}-${row.weekday}-${row.hour}`}>
                        <td className="p-2 font-bold text-slate-700">{row.field}</td>
                        <td className="p-2 text-slate-500">{row.weekdayLabel}</td>
                        <td className="p-2">{String(row.hour).padStart(2, '0')}h</td>
                        <td className="p-2 text-right">{row.regularBookings} / {row.regularHours.toFixed(1)}h</td>
                        <td className="p-2 text-right text-amber-700">{row.extraBookings} / {row.extraHours.toFixed(1)}h</td>
                        <td className="p-2 text-right">{money(row.regularRevenue + row.extraRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-1">Alertas de canibalização</h3>
              <p className="text-xs text-gray-400 mb-3">Clientes que já usam horários regulares e extraordinários.</p>
              {report.candidates.length === 0 ? (
                <p className="text-sm text-gray-500">Sem clientes com reservas regulares e extraordinárias no histórico. Não há evidência para estimar canibalização.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {report.candidates.map(c => (
                    <div key={c.customerId} className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                      <div className="flex justify-between gap-2"><p className="text-xs font-black text-rose-800">{c.name}</p><span className="text-[9px] font-black text-rose-600">{c.risk}</span></div>
                      <p className="text-[11px] text-rose-700 mt-1">Regular {c.regularBookings} · Extra {c.extraBookings} · Receita regular {money(c.regularRevenue)}</p>
                      <p className="text-[10px] text-rose-600 mt-1">{c.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
            <h3 className="font-bold text-slate-800 mb-1">Simulador de preços e receita</h3>
            <p className="text-xs text-gray-400 mb-3">Projeção hipotética; nenhum preço, desconto ou reserva é alterado.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <label className="text-[10px] font-bold uppercase text-gray-400">Cenário<select value={input.scenario} onChange={e => setInput(prev => ({ ...prev, scenario: e.target.value as PriceScenario }))} className="w-full mt-1 bg-slate-50 border border-gray-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-700">{SCENARIOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
              <label className="text-[10px] font-bold uppercase text-gray-400">Público<select value={input.targetSegment} onChange={e => setInput(prev => ({ ...prev, targetSegment: e.target.value as TargetSegment }))} className="w-full mt-1 bg-slate-50 border border-gray-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-700">{TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
              <label className="text-[10px] font-bold uppercase text-gray-400">Desconto %<input type="number" min="0" max="100" step="1" value={input.discountPct} onChange={e => setInput(prev => ({ ...prev, discountPct: Number(e.target.value) }))} className="w-full mt-1 bg-slate-50 border border-gray-200 rounded-xl px-2 py-2 text-xs font-bold" /></label>
              <label className="text-[10px] font-bold uppercase text-gray-400">Variação preço %<input type="number" step="1" value={input.priceChangePct} onChange={e => setInput(prev => ({ ...prev, priceChangePct: Number(e.target.value) }))} className="w-full mt-1 bg-slate-50 border border-gray-200 rounded-xl px-2 py-2 text-xs font-bold" /></label>
              <label className="text-[10px] font-bold uppercase text-gray-400">Reservas adicionais<input type="number" min="0" step="1" value={input.additionalBookings} onChange={e => setInput(prev => ({ ...prev, additionalBookings: Number(e.target.value) }))} className="w-full mt-1 bg-slate-50 border border-gray-200 rounded-xl px-2 py-2 text-xs font-bold" /></label>
              <label className="text-[10px] font-bold uppercase text-gray-400">Migração %<input type="number" min="0" max="100" step="1" value={input.migrationRiskPct} onChange={e => setInput(prev => ({ ...prev, migrationRiskPct: Number(e.target.value) }))} className="w-full mt-1 bg-slate-50 border border-gray-200 rounded-xl px-2 py-2 text-xs font-bold" /></label>
            </div>
            <button onClick={() => void simulate()} disabled={simulating} className="mt-4 bg-mrts-blue text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50">{simulating ? <LoaderCircle className="animate-spin" size={14} /> : <TrendingUp size={14} />} Simular projeção</button>
            {scenario && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold uppercase text-gray-400">Receita adicional</p><p className="text-lg font-black text-slate-800">{money(scenario.projection.additionalRevenue)}</p><p className="text-[10px] text-gray-400">projeção</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold uppercase text-gray-400">Receita em risco</p><p className="text-lg font-black text-amber-700">{money(scenario.projection.revenueAtRisk)}</p><p className="text-[10px] text-gray-400">migração hipotética</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold uppercase text-gray-400">Potencial líquido</p><p className={`text-lg font-black ${(scenario.projection.netPotential || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(scenario.projection.netPotential)}</p><p className="text-[10px] text-gray-400">antes de custos</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-[10px] font-bold uppercase text-gray-400">Risco / confiança</p><p className="text-sm font-black text-slate-800">{scenario.projection.cannibalizationRisk} · {scenario.projection.confidence}</p></div>
                <div className="md:col-span-4 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
                  {scenario.reason && <p>{scenario.reason}</p>}
                  {scenario.warnings.map((w, i) => <p key={i}>â€¢ {w}</p>)}
                  <p className="mt-1">Custos operacionais: desconhecidos. Margem: não calculada. Nenhuma alteração real.</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Target size={16} /> Oportunidades e riscos</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {report.opportunities.map(op => (
                <div key={op.id} className="border border-gray-100 rounded-xl p-4 bg-slate-50/50">
                  <div className="flex items-start justify-between gap-2"><p className="text-xs font-black text-slate-800">{op.title}</p><span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${op.risk === 'ALTO' ? 'bg-rose-100 text-rose-700' : op.risk === 'MEDIO' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{op.risk}</span></div>
                  <p className="text-[11px] text-slate-500 mt-1">{op.description}</p>
                  <p className="text-[11px] text-slate-600 mt-2">{op.action}</p>
                  <p className="text-[10px] text-gray-400 mt-2">{op.impactEstimated == null ? op.impactLabel : `${money(op.impactEstimated)} · ${op.impactLabel}`} · confiança {op.confidence}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{op.premissa}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Database size={16} /> Histórico de preços e clientes</h3>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-left text-[11px]">
                <thead className="text-[9px] uppercase text-gray-400 border-b"><tr><th className="p-2">Cliente</th><th className="p-2 text-right">Reservas</th><th className="p-2 text-right">Regular</th><th className="p-2 text-right">Extra</th><th className="p-2 text-right">Receita</th><th className="p-2 text-right">Preço extra/h</th></tr></thead>
                <tbody className="divide-y divide-gray-50">{report.customers.slice(0, 15).map(c => <tr key={c.customerId}><td className="p-2 font-bold text-slate-700">{c.name}</td><td className="p-2 text-right">{c.bookings}</td><td className="p-2 text-right">{c.regularBookings}</td><td className="p-2 text-right">{c.extraBookings}</td><td className="p-2 text-right">{money(c.regularRevenue + c.extraRevenue)}</td><td className="p-2 text-right">{money(c.avgExtraPriceHour)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
            <h3 className="font-bold text-slate-800 mb-1">Sazonalidade observada</h3>
            <p className="text-xs text-gray-400 mb-3">Histórico de reservas por mês; não é previsão.</p>
            <div className="flex gap-2 overflow-x-auto">
              {report.monthly.map(m => (
                <div key={m.month} className="min-w-28 bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-gray-400">{m.month}</p>
                  <p className="text-sm font-black text-slate-800 mt-1">{m.bookings} res.</p>
                  <p className="text-[10px] text-gray-500">{m.hours.toFixed(1)}h · {money(m.revenue)}</p>
                  <p className="text-[10px] text-amber-700">{m.extraHours.toFixed(1)}h extra</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-[10px] text-slate-500">
            <p className="font-bold text-slate-600 mb-1 flex items-center gap-1"><ShieldAlert size={12} /> Limitações</p>
            {report.limitations.map((l, i) => <p key={i}>â€¢ {l}</p>)}
            <p className="mt-2">Fontes: {report.sources.join(', ')}.</p>
          </div>
        </>
      )}
    </div>
  );
}
