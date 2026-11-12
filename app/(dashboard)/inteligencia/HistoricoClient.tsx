'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, BarChart3, Calculator, Database, LoaderCircle, RefreshCw
} from 'lucide-react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { getManagementComparisonAction, getManagementReport } from '../../actions/management';
import type { ManagementComparison, ManagementHistory, ManagementRow } from '../../../lib/management-analytics';

type Regime = 'cash' | 'competence';

const money = (v: number | null | undefined) => v == null ? 'â€”' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number | null | undefined) => v == null ? 'â€”' : `${v.toFixed(1).replace('.', ',')}%`;
const short = (period: string) => {
  const [year, month] = period.split('-');
  return `${month}/${year.slice(2)}`;
};
const previousMonth = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export default function HistoricoClient({ period, regime }: { period: string; regime: Regime }) {
  const [months, setMonths] = useState(6);
  const [history, setHistory] = useState<ManagementHistory | null>(null);
  const [comparison, setComparison] = useState<ManagementComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    const [res, cmp] = await Promise.all([
      getManagementReport(period, months, regime, forceRefresh),
      getManagementComparisonAction(period, previousMonth(period), regime, forceRefresh),
    ]);
    setLoading(false);
    if (!res.success) {
      setHistory(null);
      setComparison(null);
      setError(res.error || 'Falha ao carregar histÃ³rico.');
      return;
    }
    setHistory(res.data || null);
    setComparison(cmp.success ? cmp.data || null : null);
  }, [period, months, regime]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const chartData = (history?.rows || []).map(row => ({
    mes: short(row.period),
    receita: row.revenue,
    despesas: row.expenses,
    resultado: row.netResult,
    ocupacao: row.occupancyPct,
  }));

  const current = comparison?.current;
  const deltas = comparison?.comparisonAvailable ? comparison.deltas : null;

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 size={18} className="text-mrts-blue" /> HistÃ³rico gerencial
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            DRE oficial por regime, fechamentos/versÃµes + comercial realizado. Fontes e critÃ©rios no rodapÃ©.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={months}
            onChange={e => setMonths(Number(e.target.value))}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700"
            aria-label="Quantidade de meses"
          >
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
            <option value={24}>24 meses</option>
          </select>
          <button
            onClick={() => void load(true)}
            disabled={loading}
            className="bg-white border border-gray-200 text-slate-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 mb-5 flex items-center justify-center gap-2 text-gray-500 font-bold">
          <LoaderCircle className="animate-spin" size={18} /> Carregando histÃ³rico...
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 mb-5 text-sm font-medium">{error}</div>
      )}

      {!loading && history && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Receita atual</p>
              <p className="text-lg font-black text-slate-800 mt-1">{money(current?.revenue)}</p>
              <p className={`text-[11px] font-bold mt-1 ${(deltas?.revenue || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {deltas?.revenue == null ? 'sem comparaÃ§Ã£o' : `${deltas.revenue >= 0 ? '+' : ''}${money(deltas.revenue)}`}
              </p>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Despesas</p>
              <p className="text-lg font-black text-slate-800 mt-1">{money(current?.expenses)}</p>
              <p className={`text-[11px] font-bold mt-1 ${(deltas?.expenses || 0) <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {deltas?.expenses == null ? 'sem comparaÃ§Ã£o' : `${deltas.expenses >= 0 ? '+' : ''}${money(deltas.expenses)}`}
              </p>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Resultado lÃ­quido</p>
              <p className={`text-lg font-black mt-1 ${(current?.netResult || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(current?.netResult)}</p>
              <p className={`text-[11px] font-bold mt-1 ${(deltas?.netResult || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {deltas?.netResult == null ? 'sem comparaÃ§Ã£o' : `${deltas.netResult >= 0 ? '+' : ''}${money(deltas.netResult)}`}
              </p>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">OcupaÃ§Ã£o</p>
              <p className="text-lg font-black text-slate-800 mt-1">{pct(current?.occupancyPct)}</p>
              <p className={`text-[11px] font-bold mt-1 ${(deltas?.occupancyPts || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {deltas?.occupancyPts == null ? 'sem comparaÃ§Ã£o' : `${deltas.occupancyPts >= 0 ? '+' : ''}${deltas.occupancyPts.toFixed(1)} p.p.`}
              </p>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Margem de produtos</p>
              <p className="text-lg font-black text-slate-800 mt-1">{pct(current?.productMarginPct)}</p>
              <p className={`text-[11px] font-bold mt-1 ${(deltas?.productMarginPts || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {deltas?.productMarginPts == null ? 'sem comparaÃ§Ã£o' : `${deltas.productMarginPts >= 0 ? '+' : ''}${deltas.productMarginPts.toFixed(1)} p.p.`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
            <div className="xl:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-slate-800">EvoluÃ§Ã£o mensal</h3>
                  <p className="text-xs text-gray-400">Receita, despesas e resultado oficial do perÃ­odo selecionado.</p>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
                    <Tooltip formatter={(value: any, name: any) => [money(Number(value)), name]} />
                    <Legend />
                    <Line type="monotone" dataKey="receita" name="Receita" stroke="#4f46e5" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="despesas" name="Despesas" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="resultado" name="Resultado" stroke="#10b981" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-slate-800">Alertas inteligentes</h3>
              <p className="text-xs text-gray-400 mb-3">Regras com limiares explÃ­citos; nÃ£o sÃ£o previsÃµes.</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.alerts.length === 0 && <p className="text-sm text-gray-400">Nenhum alerta pelos critÃ©rios atuais.</p>}
                {history.alerts.map(alert => (
                  <div key={alert.id} className={`rounded-xl border p-3 ${alert.severity === 'ALTA' ? 'bg-red-50 border-red-100' : alert.severity === 'MEDIA' ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} className={alert.severity === 'ALTA' ? 'text-red-600 mt-0.5' : alert.severity === 'MEDIA' ? 'text-amber-600 mt-0.5' : 'text-slate-500 mt-0.5'} />
                      <div>
                        <p className="text-xs font-black text-slate-700">{alert.title}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{alert.description}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{alert.threshold}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {comparison && (
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-bold text-slate-800">ComparaÃ§Ã£o de perÃ­odos</h3>
                  <p className="text-xs text-gray-400">
                    {comparison.current.label} vs {comparison.previous.label} Â· regime {comparison.regime === 'cash' ? 'caixa' : 'competÃªncia'}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${comparison.comparisonAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {comparison.comparisonAvailable ? 'comparaÃ§Ã£o disponÃ­vel' : 'comparaÃ§Ã£o limitada'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-gray-400">Aluguel em comandas</p>
                  <p className="text-sm font-black text-slate-800 mt-1">{money(comparison.current.rentalRevenue)}</p>
                  <p className="text-[11px] text-gray-500">vs {money(comparison.previous.rentalRevenue)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-gray-400">Produtos/serviços em comandas</p>
                  <p className="text-sm font-black text-slate-800 mt-1">{money(comparison.current.productRevenue)}</p>
                  <p className="text-[11px] text-gray-500">vs {money(comparison.previous.productRevenue)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] uppercase font-bold text-gray-400">Margem de contribuiÃ§Ã£o</p>
                  <p className="text-sm font-black text-slate-800 mt-1">{money(comparison.current.productContribution)}</p>
                  <p className="text-[11px] text-gray-500">vs {money(comparison.previous.productContribution)}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">{comparison.comparisonNote}</p>
              {comparison.drivers.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-slate-600">
                  {comparison.drivers.map((driver, i) => <li key={i}>â€¢ {driver}</li>)}
                </ul>
              )}
              <p className="text-[10px] text-gray-400 mt-3">
                Fontes: {comparison.sources.join(', ')}. CritÃ©rios: {comparison.criteria.note}
              </p>
              {comparison.alerts.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {comparison.alerts.map(alert => (
                    <span key={alert.id} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-100">
                      {alert.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-5">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
              <Database size={15} className="text-mrts-blue" />
              <h3 className="font-bold text-slate-800 text-sm">RelatÃ³rio mensal e fontes</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="p-3">MÃªs</th>
                    <th className="p-3">Status / versÃ£o</th>
                    <th className="p-3 text-right">Receita</th>
                    <th className="p-3 text-right">CMV</th>
                    <th className="p-3 text-right">Despesas</th>
                    <th className="p-3 text-right">Resultado</th>
                    <th className="p-3 text-right">Margem</th>
                    <th className="p-3 text-right">OcupaÃ§Ã£o</th>
                    <th className="p-3 text-right">Aluguel</th>
                    <th className="p-3 text-right">ExtraordinÃ¡rio</th>
                    <th className="p-3 text-right">Produtos</th>
                    <th className="p-3 text-right">Margem produtos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.rows.map((row: ManagementRow) => (
                    <tr key={row.period} className="hover:bg-slate-50/60">
                      <td className="p-3 font-bold text-slate-700">{row.label}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.status === 'CLOSED' ? 'bg-slate-900 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                          {row.status === 'CLOSED' ? `v${row.version}` : 'aberto'}
                        </span>
                        <span className="ml-1 text-[10px] text-gray-400">{row.source}</span>
                        <span className="block text-[9px] text-gray-400 mt-0.5">
                          {row.rulesVersion === 'NEW_RULES' ? 'regras desde 11/2026' : 'metodologia histórica'}
                        </span>
                      </td>
                      <td className="p-3 text-right">{money(row.revenue)}</td>
                      <td className="p-3 text-right">{money(row.cmv)}</td>
                      <td className="p-3 text-right">{money(row.expenses)}</td>
                      <td className={`p-3 text-right font-bold ${(row.netResult || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(row.netResult)}</td>
                      <td className="p-3 text-right">{pct(row.netMargin)}</td>
                      <td className="p-3 text-right">{row.occupancyAvailable ? pct(row.occupancyPct) : 'â€”'}</td>
                      <td className="p-3 text-right">{money(row.rentalRevenue)}</td>
                      <td className="p-3 text-right text-amber-700">{row.extraHours ? `${row.extraHours}h Â· ${money(row.extraRevenue)}` : 'â€”'}</td>
                      <td className="p-3 text-right">{money(row.productRevenue)}</td>
                      <td className="p-3 text-right">{pct(row.productMarginPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500">
            <p className="font-bold text-slate-600 mb-1 flex items-center gap-1"><Calculator size={13} /> CritÃ©rios e fontes</p>
            <p>{history.criteria.note}</p>
            <p className="mt-1">{history.note}</p>
            <p className="mt-1">Fontes: {history.sources.join(', ')}. Gerado em {new Date(history.generatedAt).toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' })}.</p>
          </div>
        </>
      )}
    </div>
  );
}
