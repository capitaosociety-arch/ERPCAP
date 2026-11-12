'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Calculator, Database, LoaderCircle, RefreshCw, Sparkles, Target, TrendingUp
} from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import {
  getStrategyForecast,
  getStrategyRecommendations,
  simulateStrategyScenario
} from '../../actions/strategy';
import RentalScheduleClient from './RentalScheduleClient';
import type {
  ForecastReport,
  RecommendationsReport,
  ScenarioInput,
  ScenarioResult
} from '../../../lib/strategic-analytics';

type Regime = 'cash' | 'competence';

const money = (v: number | null | undefined) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number | null | undefined) => v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`;

const PRESETS: Record<'conservative' | 'base' | 'optimistic', ScenarioInput> = {
  conservative: { rentalPriceChangePct: -5, occupancyChangePp: -2, productPriceChangePct: -3, productCostChangePct: 0 },
  base: { rentalPriceChangePct: 0, occupancyChangePp: 0, productPriceChangePct: 0, productCostChangePct: 0 },
  optimistic: { rentalPriceChangePct: 5, occupancyChangePp: 2, productPriceChangePct: 3, productCostChangePct: 0 },
};

export default function StrategyClient({ period, regime }: { period: string; regime: Regime }) {
  const [forecast, setForecast] = useState<ForecastReport | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationsReport | null>(null);
  const [scenario, setScenario] = useState<ScenarioResult | null>(null);
  const [input, setInput] = useState<ScenarioInput>(PRESETS.base);
  const [horizon, setHorizon] = useState<3 | 6 | 12>(6);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    const [f, r] = await Promise.all([
      getStrategyForecast(regime, forceRefresh),
      getStrategyRecommendations(period, regime, forceRefresh),
    ]);
    setLoading(false);
    setForecast(f.success ? f.data || null : null);
    setRecommendations(r.success ? r.data || null : null);
    if (!f.success || !r.success) setError(f.error || r.error || 'Falha ao carregar estratégia.');
  }, [period, regime]);

  useEffect(() => { void load(false); }, [load]);

  const simulate = async () => {
    setSimulating(true);
    const res = await simulateStrategyScenario(period, input);
    setSimulating(false);
    if (res.success) setScenario(res.data || null);
    else setError(res.error || 'Falha ao simular.');
  };

  const applyPreset = (key: keyof typeof PRESETS) => {
    setInput(PRESETS[key]);
    setScenario(null);
  };

  const forecastPoints = forecast?.horizons?.[horizon] || [];
  const chartData = forecast?.horizons?.[12]?.map(point => ({
    mes: point.label.split(' ')[0].slice(0, 3),
    receita: point.revenue,
    resultado: point.netResult,
    receitaMin: point.revenueLow,
    receitaMax: point.revenueHigh,
  })) || [];

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Sparkles size={18} className="text-mrts-blue" /> Simulações, previsões e recomendações
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Cenários hipotéticos e projeções com premissas explícitas. Não são resultados garantidos e não alteram dados.
          </p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={loading}
          className="bg-white border border-gray-200 text-slate-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2 w-fit"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 mb-5 text-sm font-medium">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <div className="xl:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-slate-800">Previsão financeira</h3>
              <p className="text-xs text-gray-400">Tendência linear + intervalo de 80%; sazonalidade só com 24+ meses.</p>
            </div>
            <div className="flex gap-1">
              {[3, 6, 12].map(h => (
                <button
                  key={h}
                  onClick={() => setHorizon(h as 3 | 6 | 12)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${horizon === h ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500'}`}
                >
                  {h}m
                </button>
              ))}
            </div>
          </div>
          {loading && <div className="h-56 flex items-center justify-center text-gray-400 text-sm gap-2"><LoaderCircle className="animate-spin" size={16} /> Calculando...</div>}
          {!loading && forecast && !forecast.available && <p className="text-sm text-gray-500">{forecast.reason}</p>}
          {!loading && forecast?.available && (
            <>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
                    <Tooltip formatter={(value: any, name: any) => [money(Number(value)), name]} />
                    <Line type="monotone" dataKey="receita" name="Receita prevista" stroke="#4f46e5" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="resultado" name="Resultado previsto" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                {forecastPoints.slice(0, 4).map(point => (
                  <div key={point.period} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold uppercase text-gray-400">{point.label}</p>
                    <p className="text-sm font-black text-slate-800 mt-1">{money(point.netResult)}</p>
                    <p className="text-[10px] text-gray-400">receita {money(point.revenue)}</p>
                    <p className="text-[10px] text-amber-600">80%: {money(point.netLow)} a {money(point.netHigh)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 max-h-48 overflow-y-auto border border-gray-100 rounded-xl">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-[9px] uppercase text-gray-400 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Mês</th>
                      <th className="p-2 text-right">Receita</th>
                      <th className="p-2 text-right">Receita 80%</th>
                      <th className="p-2 text-right">Resultado</th>
                      <th className="p-2 text-right">Resultado 80%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {forecastPoints.map(point => (
                      <tr key={point.period}>
                        <td className="p-2 font-bold text-slate-700">{point.label}</td>
                        <td className="p-2 text-right">{money(point.revenue)}</td>
                        <td className="p-2 text-right text-gray-400">{money(point.revenueLow)}–{money(point.revenueHigh)}</td>
                        <td className={`p-2 text-right font-bold ${point.netResult >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(point.netResult)}</td>
                        <td className="p-2 text-right text-gray-400">{money(point.netLow)}–{money(point.netHigh)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 mt-3">
                Histórico: {forecast.historyMonths} meses · confiança {forecast.confidence} · sazonalidade {forecast.seasonalityApplied ? 'aplicada' : 'não aplicada'} · intervalo {forecast.interval}.
                {' '}Previsão não é garantia. {forecast.limitations.join(' ')}
              </p>
            </>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-slate-800">Premissas e fontes da previsão</h3>
          <p className="text-xs text-gray-400 mb-3">Transparência sobre o que foi usado.</p>
          {forecast?.available ? (
            <div className="space-y-2 text-[11px] text-slate-500">
              <p className="font-bold text-slate-600">Premissas</p>
              <ul className="list-disc pl-4 space-y-1">{forecast.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
              <p className="font-bold text-slate-600 pt-2">Limitações</p>
              <ul className="list-disc pl-4 space-y-1">{forecast.limitations.map((a, i) => <li key={i}>{a}</li>)}</ul>
              <p className="pt-2 text-gray-400">Fontes: {forecast.sources.join(', ')}.</p>
            </div>
          ) : <p className="text-sm text-gray-400">Sem previsão disponível.</p>}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Calculator size={16} /> Simulador de cenários</h3>
            <p className="text-xs text-gray-400">Hipóteses editáveis; volume e estrutura de custos constantes. Sem alteração real.</p>
          </div>
          <div className="flex gap-1">
            {(['conservative', 'base', 'optimistic'] as const).map(key => (
              <button key={key} onClick={() => applyPreset(key)} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-50 text-slate-600 hover:bg-slate-100">
                {key === 'conservative' ? 'Conservador' : key === 'base' ? 'Base' : 'Otimista'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: 'rentalPriceChangePct', label: 'Preço aluguel (%)', suffix: '%' },
            { key: 'occupancyChangePp', label: 'Ocupação (p.p.)', suffix: 'p.p.' },
            { key: 'productPriceChangePct', label: 'Preço produtos (%)', suffix: '%' },
            { key: 'productCostChangePct', label: 'Custo produtos (%)', suffix: '%' },
          ].map(field => (
            <label key={field.key} className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{field.label}</span>
              <div className="flex items-center gap-1 mt-1 bg-slate-50 border border-gray-200 rounded-xl px-3 py-2">
                <input
                  type="number"
                  step="0.5"
                  value={input[field.key as keyof ScenarioInput]}
                  onChange={e => setInput(prev => ({ ...prev, [field.key]: Number(e.target.value) }))}
                  className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none"
                />
                <span className="text-[10px] font-bold text-gray-400">{field.suffix}</span>
              </div>
            </label>
          ))}
        </div>
        <button
          onClick={() => void simulate()}
          disabled={simulating}
          className="mt-4 bg-mrts-blue text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2"
        >
          {simulating ? <LoaderCircle className="animate-spin" size={14} /> : <TrendingUp size={14} />} Simular cenário
        </button>
        {scenario && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Receita simulada</p>
              <p className="text-lg font-black text-slate-800 mt-1">{money(scenario.scenario.totalRevenue)}</p>
              <p className={`text-[11px] font-bold ${(scenario.deltas.totalRevenue || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {scenario.deltas.totalRevenue == null ? 'indisponível' : `${scenario.deltas.totalRevenue >= 0 ? '+' : ''}${money(scenario.deltas.totalRevenue)}`}
              </p>
              <p className="text-[10px] text-gray-400">Base: {money((scenario.base.rentalRevenue || 0) + (scenario.base.extraRevenue || 0) + (scenario.base.productRevenue || 0))}</p>
              <p className="text-[10px] text-gray-400">Extraordinário mantido: {money(scenario.base.extraRevenue)} ({scenario.base.extraHours}h)</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Aluguel</p>
              <p className="text-lg font-black text-slate-800 mt-1">{money(scenario.scenario.rentalRevenue)}</p>
              <p className="text-[11px] font-bold text-gray-500">Δ {money(scenario.deltas.rentalRevenue)}</p>
              <p className="text-[10px] text-amber-600">Margem de aluguel indisponível: sem custo de quadra.</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Produtos</p>
              <p className="text-lg font-black text-slate-800 mt-1">{money(scenario.scenario.productContribution)}</p>
              <p className="text-[11px] font-bold text-gray-500">Margem {pct(scenario.scenario.productMarginPct)} · Δ {money(scenario.deltas.productContribution)}</p>
              <p className="text-[10px] text-gray-400">CMV {money(scenario.scenario.productCmv)}</p>
            </div>
            <div className="lg:col-span-3 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">
              {scenario.warnings.map((w, i) => <p key={i}>• {w}</p>)}
              <p className="mt-1 text-gray-500">Fontes: {scenario.sources.join(', ')}.</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Target size={16} className="text-mrts-blue" />
          <h3 className="font-bold text-slate-800">Recomendações estratégicas</h3>
          <span className="text-[10px] text-gray-400">consultivas, priorizadas por impacto × confiança × facilidade</span>
        </div>
        {!recommendations?.available && <p className="text-sm text-gray-400">{recommendations?.reason || 'Sem recomendações.'}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {recommendations?.recommendations.map(rec => (
            <div key={rec.id} className="border border-gray-100 rounded-xl p-4 bg-slate-50/50">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-black text-slate-800">{rec.title}</p>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${rec.confidence === 'ALTA' ? 'bg-emerald-100 text-emerald-700' : rec.confidence === 'MEDIA' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{rec.confidence}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{rec.description}</p>
              <p className="text-[11px] text-slate-600 mt-2 font-medium">{rec.action}</p>
              <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
                <span>{rec.impactEstimated == null ? rec.impactLabel : `${money(rec.impactEstimated)} · ${rec.impactLabel}`}</span>
                <span>prioridade {rec.priorityScore.toFixed(0)}</span>
              </div>
            </div>
          ))}
        </div>
        {recommendations?.available && (
          <p className="text-[10px] text-gray-400 mt-3 flex items-start gap-1">
            <AlertTriangle size={12} className="mt-0.5" /> {recommendations.criteria.note} {recommendations.note}
          </p>
        )}
      </div>

      <RentalScheduleClient />

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-[10px] text-slate-500 flex items-start gap-2">
        <Database size={13} className="mt-0.5 shrink-0" />
        <p>
          Nenhuma simulação, previsão ou recomendação altera preços, estoque, agenda ou financeiro.
          As projeções são estimativas; os fatos históricos vêm do DRE oficial e do comercial auditável.
        </p>
      </div>
    </div>
  );
}
