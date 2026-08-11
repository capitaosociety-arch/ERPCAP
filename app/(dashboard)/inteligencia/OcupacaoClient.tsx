'use client'

import { useState, useMemo } from 'react';
import {
  BrainCircuit, LoaderCircle, CalendarDays, TrendingUp, TrendingDown, Timer,
  DollarSign, Coffee, Lightbulb, Target, ShieldCheck, Clock, BarChart3,
  CheckCircle2, XCircle, AlertTriangle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ComposedChart, Legend
} from 'recharts';
import { getOcupacaoReport, registrarDecisaoRecomendacao } from '../../actions/ocupacao';
import type { ReporteOcupacao, SimulacaoResult, ElasticidadeItem, OcupacaoConfig, HistoricoRecomendacao } from '../../../lib/ocupacao';

type PeriodoKey = '7d' | '30d' | '90d' | 'month';

const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'month', label: 'Mês atual' },
];

const DOW = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const CLASS_ESTILO: Record<string, { cor: string; bg: string; texto: string }> = {
  MUITO_OCIOSO: { cor: '#ef4444', bg: 'bg-red-50', texto: 'text-red-700' },
  OCIOSO: { cor: '#f97316', bg: 'bg-orange-50', texto: 'text-orange-700' },
  SAUDAVEL: { cor: '#10b981', bg: 'bg-emerald-50', texto: 'text-emerald-700' },
  ALTA_DEMANDA: { cor: '#3b82f6', bg: 'bg-blue-50', texto: 'text-blue-700' },
  SATURADO: { cor: '#8b5cf6', bg: 'bg-violet-50', texto: 'text-violet-700' },
};

function money(v: number) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function pct(v: number) {
  return `${(v || 0).toFixed(1).replace('.', ',')}%`;
}

type HistoricoItem = HistoricoRecomendacao;

type ReportePage = ReporteOcupacao & {
  simulacao?: SimulacaoResult | null;
  elasticidade?: ElasticidadeItem[];
  historico?: HistoricoItem[];
};

export default function OcupacaoClient({
  initialReport,
  initialError,
  faixas,
  isAdmin
}: {
  initialReport: ReportePage | null;
  initialError?: string;
  faixas: { id: string; campo: string; startHour: number; endHour: number; minPrice: number; maxPrice: number; rotulo: string }[];
  isAdmin: boolean;
}) {
  const [periodo, setPeriodo] = useState<PeriodoKey>('30d');
  const [campo, setCampo] = useState<'fut5' | 'fut7' | 'ambos'>('ambos');
  const [dow, setDow] = useState<number | null>(null);
  const [faixa, setFaixa] = useState<string | null>(null);
  const [report, setReport] = useState<ReportePage | null>(initialReport);
  const [error, setError] = useState<string | undefined>(initialError);
  const [loading, setLoading] = useState(false);

  const [simCampo, setSimCampo] = useState<'fut5' | 'fut7'>('fut5');
  const [simHora, setSimHora] = useState(17);
  const [simPreco, setSimPreco] = useState('');
  const [simResult, setSimResult] = useState<SimulacaoResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const [decisaoId, setDecisaoId] = useState<string | null>(null);
  const [decisaoPreco, setDecisaoPreco] = useState('');

  const aplicarFiltros = async (p: PeriodoKey, c?: 'fut5' | 'fut7' | 'ambos', d?: number | null, f?: string | null) => {
    setLoading(true);
    setError(undefined);
    const res = await getOcupacaoReport({
      periodo: p,
      campo: c ?? campo,
      diaSemana: d === undefined ? dow : d,
      faixa: f === undefined ? faixa : f
    });
    setLoading(false);
    if (res.success) setReport(res.report ?? null);
    else setError(res.error);
  };

  const changePeriodo = async (p: PeriodoKey) => {
    if (p === periodo) return;
    setPeriodo(p);
    await aplicarFiltros(p);
  };
  const changeCampo = async (c: 'fut5' | 'fut7' | 'ambos') => {
    setCampo(c);
    await aplicarFiltros(periodo, c);
  };
  const changeDow = async (d: number | null) => {
    setDow(d);
    await aplicarFiltros(periodo, campo, d);
  };
  const changeFaixa = async (f: string | null) => {
    setFaixa(f);
    await aplicarFiltros(periodo, campo, dow, f);
  };

  const runSim = async () => {
    const preco = parseFloat(simPreco.replace(',', '.'));
    if (!preco || preco <= 0) return;
    setSimLoading(true);
    const res = await getOcupacaoReport({
      periodo,
      campo,
      simularPrecoNovo: preco,
      simularCampo: simCampo,
      simularHora: simHora
    });
    setSimLoading(false);
    if (res.success && res.report) setSimResult((res.report as any).simulacao || null);
    else setError(res.error);
  };

  const decidir = async (id: string, decisao: 'ACEITA' | 'REJEITADA') => {
    const preco = decisao === 'ACEITA' ? parseFloat(decisaoPreco.replace(',', '.')) : null;
    if (decisao === 'ACEITA' && (!preco || preco <= 0)) {
      alert('Informe o preço que será aplicado.');
      return;
    }
    setDecisaoId(id);
    const res = await registrarDecisaoRecomendacao({
      recomendacaoId: id,
      decisao,
      precoAplicado: preco,
      periodoTesteDias: 30
    });
    setDecisaoId(null);
    alert(res.mensagem || res.error || 'Concluído.');
    if (res.success) {
      const rr = await getOcupacaoReport({ periodo, campo, diaSemana: dow, faixa });
      if (rr.success) setReport(rr.report ?? null);
    }
  };

  const ind = report?.indicadores;
  const config = report?.config as OcupacaoConfig | undefined;

  const cardData = ind ? [
    { label: 'Ocupação média', value: pct(ind.ocupacaoMedia), icon: BarChart3, tone: 'text-blue-600 bg-blue-50' },
    { label: 'Horário mais ocupado', value: ind.horarioMaisOcupado ? `${ind.horarioMaisOcupado.rotulo}` : '—', sub: ind.horarioMaisOcupado ? `${ind.horarioMaisOcupado.campoLabel} · ${pct(ind.horarioMaisOcupado.taxaOcupacao)}` : 'Sem reservas', icon: TrendingUp, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Horário mais ocioso', value: ind.horarioMaisOcioso ? `${ind.horarioMaisOcioso.rotulo}` : '—', sub: ind.horarioMaisOcioso ? `${ind.horarioMaisOcioso.campoLabel} · ${pct(ind.horarioMaisOcioso.taxaOcupacao)}` : 'Sem dados', icon: TrendingDown, tone: 'text-red-600 bg-red-50' },
    { label: 'Receita por hora disponível', value: money(ind.receitaPorHoraDisponivel), icon: Timer, tone: 'text-violet-600 bg-violet-50' },
    { label: 'Faturamento dos campos', value: money(ind.faturamentoCampos), icon: DollarSign, tone: 'text-sky-600 bg-sky-50' },
    { label: 'Consumo do bar associado', value: money(ind.consumoBarAssociado), icon: Coffee, tone: 'text-amber-600 bg-amber-50' },
    { label: 'Oportunidade estimada', value: money(ind.oportunidadeEstimada), sub: 'receita perdida por ociosidade', icon: Lightbulb, tone: 'text-emerald-600 bg-emerald-50' },
  ] : [];

  const heatmapData = useMemo(() => {
    const rows: { hora: string; [k: string]: string | number }[] = [];
    if (!report || !config) return rows;
    for (let h = config.abertura; h < config.fechamento; h++) {
      const row: { hora: string; [k: string]: string | number } = { hora: `${String(h).padStart(2, '0')}h` };
      DOW.forEach((d, di) => {
        const cells = report.heatmap.filter(c => c.startHour === h && c.dow === di && (campo === 'ambos' || c.campo === campo));
        const occ = cells.length > 0 ? cells.reduce((a, c) => a + c.taxaOcupacao, 0) / cells.length : 0;
        row[d] = Math.round(occ);
      });
      rows.push(row);
    }
    return rows;
  }, [report, config, campo]);

  const classCor = (occ: number, config?: OcupacaoConfig) => {
    if (!config) return '#e2e8f0';
    if (occ >= config.saturadoLimite) return '#8b5cf6';
    if (occ >= config.altaDemandaLimite) return '#3b82f6';
    if (occ >= config.saudavelLimite) return '#10b981';
    if (occ >= config.ociosoLimite) return '#f97316';
    return '#ef4444';
  };

  const ocupPorHora = useMemo(() => {
    return (report?.porHorario || [])
      .filter(s => campo === 'ambos' || s.campo === campo)
      .map(s => ({ rotulo: s.rotulo, campo: s.campoLabel, ocupacao: s.taxaOcupacao, receita: s.receitaTotal, aluguel: s.faturamentoAluguel, bar: s.consumoBar, preco: s.precoAtual }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo));
  }, [report, campo]);

  const ocupPorFaixa = useMemo(() => {
    return (report?.porFaixa || [])
      .filter(s => campo === 'ambos' || s.campo === campo)
      .map(s => {
        const rec = (report?.recomendacoes || []).find(r => r.campo === s.campo && r.startHour === s.startHour);
        return {
          ...s,
          precoSugerido: rec?.precoSugerido ?? null,
          categoria: rec?.categoria ?? null,
          acaoComercial: rec?.acaoComercial ?? '',
          justificativa: rec?.justificativa ?? '',
          nivelConfianca: rec?.nivelConfianca ?? null,
          diferencaReais: rec?.diferencaReais ?? null,
          diferencaPct: rec?.diferencaPct ?? null,
          estimativaReceita: rec?.estimativaReceita ?? null,
          ocupacaoDesejada: rec?.ocupacaoDesejada ?? null
        };
      });
  }, [report, campo]);

  const recomendacoes = report?.recomendacoes || [];

  return (
    <div className="animate-in fade-in duration-500 pb-10">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <BrainCircuit className="text-mrts-blue" /> Inteligência de Ocupação
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Ocupação e precificação dos campos com base nos dados reais do sistema. Período: <span className="font-bold text-gray-700">{report?.periodo || '—'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-2xl border border-gray-100 p-1.5 shadow-sm">
          {PERIODOS.map(p => (
            <button key={p.key} onClick={() => changePeriodo(p.key)} disabled={loading}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${periodo === p.key ? 'bg-mrts-blue text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 flex flex-wrap items-center gap-3">
        <span className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5"><CalendarDays size={14} className="text-mrts-blue" /> Filtros</span>
        <div className="flex gap-1.5">
          {(['ambos', 'fut5', 'fut7'] as const).map(c => (
            <button key={c} onClick={() => changeCampo(c)} disabled={loading}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${campo === c ? 'bg-slate-800 text-white shadow-sm' : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
              {c === 'ambos' ? 'Todos os campos' : c === 'fut5' ? 'Campo menor' : 'Campo maior'}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-gray-200" />
        <select value={dow == null ? 'todos' : String(dow)} onChange={e => changeDow(e.target.value === 'todos' ? null : Number(e.target.value))} disabled={loading}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-600 focus:outline-none">
          <option value="todos">Todos os dias</option>
          {DOW.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <select value={faixa ?? 'todas'} onChange={e => changeFaixa(e.target.value === 'todas' ? null : e.target.value)} disabled={loading}
          className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-600 focus:outline-none">
          <option value="todas">Todas as faixas de horário</option>
          {faixas.filter(f => campo === 'ambos' || f.campo === campo).map(f => (
            <option key={f.id} value={`${f.startHour}-${f.endHour}`}>{f.rotulo}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 mb-6 font-medium text-sm">{error}</div>
      )}

      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-6 flex items-center justify-center gap-3 text-gray-500 font-bold">
          <LoaderCircle className="animate-spin" /> Analisando ocupação e preços...
        </div>
      )}

      {!loading && report && !report.semDados && (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-8">
            {cardData.map(card => (
              <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${card.tone}`}><card.icon size={20} /></div>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 truncate">{card.label}</p>
                  <p className="text-lg font-black text-gray-800 truncate">{card.value}</p>
                  {card.sub && <p className="text-[11px] font-bold text-gray-400 truncate">{card.sub}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            {/* Heatmap */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-1">Heatmap dia da semana × horário</h2>
              <p className="text-gray-500 text-xs mb-4">Cores por classificação de ocupação (configurável em Ocupação).</p>
              <div className="overflow-x-auto">
                <table className="w-full text-center">
                  <thead>
                    <tr>
                      <th className="text-[10px] font-bold text-gray-400 uppercase p-1">Hora</th>
                      {DOW.map(d => <th key={d} className="text-[10px] font-bold text-gray-400 uppercase p-1">{d.slice(0, 3)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapData.map(row => (
                      <tr key={row.hora}>
                        <td className="text-[10px] font-bold text-gray-500 p-1">{row.hora}</td>
                        {DOW.map(d => {
                          const occ = Number(row[d] || 0);
                          const cor = classCor(occ, config);
                          return (
                            <td key={d} className="p-0.5">
                              <div className="rounded-md h-6 flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: cor, opacity: occ === 0 ? 0.35 : 0.9 }}>
                                {occ > 0 ? `${occ}%` : ''}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3 mt-3 text-[10px] font-bold text-gray-500">
                <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#ef4444' }} /> Muito ocioso</span>
                <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#f97316' }} /> Ocioso</span>
                <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#10b981' }} /> Saudável</span>
                <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#3b82f6' }} /> Alta demanda</span>
                <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: '#8b5cf6' }} /> Saturado</span>
              </div>
            </div>

            {/* Preço x ocupação */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Preço × Ocupação</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={ocupPorHora} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                    <XAxis dataKey="rotulo" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} dy={8} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v: number) => `R$${v}`} />
                    <Tooltip contentStyle={{ borderRadius: 20, border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }} formatter={(value: any, name: any) => [name === 'Preço' ? money(Number(value)) : `${Number(value)}%`, name]} labelStyle={{ fontWeight: 'bold' }} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="ocupacao" name="Ocupação" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={16} />
                    <Line yAxisId="right" type="monotone" dataKey="preco" name="Preço" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Ocupação por horário */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Ocupação por horário</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ocupPorHora} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                    <XAxis dataKey="rotulo" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip contentStyle={{ borderRadius: 20, border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }} formatter={(value: any) => [`${Number(value).toFixed(1)}%`, 'Ocupação']} labelStyle={{ fontWeight: 'bold' }} />
                    <Bar dataKey="ocupacao" name="Ocupação" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Receita por horário */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Receita por horário (aluguel + bar)</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ocupPorHora} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                    <XAxis dataKey="rotulo" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(v: number) => `R$${v}`} />
                    <Tooltip contentStyle={{ borderRadius: 20, border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }} formatter={(value: any, name: any) => [money(Number(value)), name]} labelStyle={{ fontWeight: 'bold' }} />
                    <Legend />
                    <Bar dataKey="aluguel" name="Aluguel" stackId="a" fill="#0ea5e9" maxBarSize={16} />
                    <Bar dataKey="bar" name="Bar" stackId="a" fill="#f59e0b" maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
            <h2 className="text-lg font-bold text-gray-800 mb-1">Horários e preços</h2>
            <p className="text-gray-500 text-xs mb-4">Preço sugerido é recomendação — nunca aplicado automaticamente.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider font-bold text-gray-400 border-b border-gray-100">
                    <th className="py-2 pr-3">Horário</th>
                    <th className="py-2 pr-3">Campo</th>
                    <th className="py-2 pr-3 text-right">Preço atual</th>
                    <th className="py-2 pr-3 text-right">Ocupação</th>
                    <th className="py-2 pr-3 text-right">Receita</th>
                    <th className="py-2 pr-3 text-right">Bar</th>
                    <th className="py-2 pr-3 text-right">Receita total</th>
                    <th className="py-2 pr-3">Classificação</th>
                    <th className="py-2 pr-3 text-right">Preço sugerido</th>
                    <th className="py-2 pr-3">Ação recomendada</th>
                  </tr>
                </thead>
                <tbody>
                  {ocupPorFaixa.map((s, i) => {
                    const est = CLASS_ESTILO[s.classificacao] || CLASS_ESTILO.SAUDAVEL;
                    return (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="py-2.5 pr-3 font-bold text-gray-700 whitespace-nowrap">{s.rotulo}</td>
                        <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">{s.campoLabel}</td>
                        <td className="py-2.5 pr-3 text-right text-gray-700 whitespace-nowrap">{money(s.precoAtual)}</td>
                        <td className="py-2.5 pr-3 text-right font-bold whitespace-nowrap">{pct(s.taxaOcupacao)}</td>
                        <td className="py-2.5 pr-3 text-right text-gray-600 whitespace-nowrap">{money(s.faturamentoAluguel)}</td>
                        <td className="py-2.5 pr-3 text-right text-amber-600 whitespace-nowrap">{money(s.consumoBar)}</td>
                        <td className="py-2.5 pr-3 text-right font-bold text-gray-800 whitespace-nowrap">{money(s.receitaTotal)}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${est.bg} ${est.texto}`}>{s.classificacao.replace('_', ' ')}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                          {s.precoSugerido != null ? (
                            <span className={`font-bold ${s.precoSugerido > s.precoAtual ? 'text-emerald-600' : s.precoSugerido < s.precoAtual ? 'text-orange-600' : 'text-gray-600'}`}>
                              {money(s.precoSugerido)}
                              {s.diferencaReais != null && s.diferencaReais !== 0 && <span className="text-[10px] text-gray-400"> ({s.diferencaReais > 0 ? '+' : ''}{money(s.diferencaReais)})</span>}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-gray-500 max-w-[220px]">{s.acaoComercial || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recomendações */}
          {recomendacoes.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2"><Lightbulb className="text-amber-500" /> Recomendações de preço</h2>
              <p className="text-gray-500 text-xs mb-4">Cada sugestão considera a receita total da reserva (aluguel + bar).</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recomendacoes.map(r => (
                  <div key={r.fingerprint} className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span className="font-bold text-gray-800">{r.campoLabel} · {r.faixa}</span>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-800 text-white">{r.categoria.replace('_', ' ')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                      <div className="bg-white rounded-xl p-2.5 border border-gray-100">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Preço atual</p>
                        <p className="font-black text-gray-800">{money(r.precoAtual)}</p>
                      </div>
                      <div className="bg-white rounded-xl p-2.5 border border-gray-100">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Preço sugerido</p>
                        <p className={`font-black ${r.precoSugerido > r.precoAtual ? 'text-emerald-600' : r.precoSugerido < r.precoAtual ? 'text-orange-600' : 'text-gray-800'}`}>{money(r.precoSugerido)}</p>
                        <p className="text-[10px] text-gray-400">{r.diferencaReais > 0 ? '+' : ''}{money(r.diferencaReais)} ({r.diferencaPct > 0 ? '+' : ''}{r.diferencaPct.toFixed(1).replace('.', ',')}%)</p>
                      </div>
                      <div className="bg-white rounded-xl p-2.5 border border-gray-100">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Ocupação atual</p>
                        <p className="font-black text-gray-800">{pct(r.ocupacaoAtual)}</p>
                        <p className="text-[10px] text-gray-400">desejada {pct(r.ocupacaoDesejada)}</p>
                      </div>
                      <div className="bg-white rounded-xl p-2.5 border border-gray-100">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Receita</p>
                        <p className="font-black text-gray-800">{money(r.receitaAtual)}</p>
                        <p className="text-[10px] text-gray-400">estimada {money(r.estimativaReceita)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{r.justificativa}</p>
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed"><Target size={12} className="inline mr-1 text-mrts-blue" />{r.acaoComercial}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] font-bold text-gray-400">Confiança: {(r.nivelConfianca * 100).toFixed(0).replace('.', ',')}%</span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-1"><ShieldCheck size={11} className="text-emerald-500" /> {r.dadosUtilizados.slice(0, 2).join(' · ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Simulação */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
            <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2"><BarChart3 className="text-mrts-blue" /> Simulação de preço</h2>
            <p className="text-gray-500 text-xs mb-4">Cenários Conservador / Provável / Otimista. A simulação é uma PREVISÃO, nunca garantia.</p>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase">Campo</label>
                <select value={simCampo} onChange={e => setSimCampo(e.target.value as 'fut5' | 'fut7')} className="block bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700">
                  <option value="fut5">Campo menor</option>
                  <option value="fut7">Campo maior</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase">Hora</label>
                <select value={simHora} onChange={e => setSimHora(Number(e.target.value))} className="block bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700">
                  {Array.from({ length: 18 }, (_, i) => i + 6).map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase">Novo preço (R$)</label>
                <input value={simPreco} onChange={e => setSimPreco(e.target.value)} placeholder="ex.: 140" className="block bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 w-28" />
              </div>
              <button onClick={runSim} disabled={simLoading} className="bg-mrts-blue text-white font-bold px-4 py-2 rounded-xl hover:bg-blue-800 transition disabled:opacity-40 flex items-center gap-2">
                {simLoading ? <LoaderCircle className="animate-spin" size={15} /> : <BarChart3 size={15} />} Simular
              </button>
            </div>
            {simResult && (
              <div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 flex items-center gap-2 text-xs text-slate-600">
                  <AlertTriangle size={13} className="text-amber-500 shrink-0" /> {simResult.aviso}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {simResult.cenarios.map(c => (
                    <div key={c.nome} className="border border-gray-100 rounded-2xl p-4 bg-gray-50/50">
                      <p className="font-bold text-gray-800 mb-2">{c.nome}</p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">Ocupação</span><span className="font-bold">{pct(c.ocupacao)} <span className="text-[10px] text-gray-400">({c.variacaoOcupacao > 0 ? '+' : ''}{c.variacaoOcupacao.toFixed(1)}pp)</span></span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Horas ocupadas</span><span className="font-bold">{c.horasOcupadas.toFixed(1).replace('.', ',')}h</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Aluguel</span><span className="font-bold text-sky-600">{money(c.receitaAluguel)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Bar</span><span className="font-bold text-amber-600">{money(c.consumoBar)}</span></div>
                        <div className="flex justify-between border-t border-gray-100 pt-1.5 mt-1.5"><span className="text-gray-600 font-bold">Receita total</span><span className={`font-black ${c.variacaoReceita >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(c.receitaTotal)} <span className="text-[10px]">({c.variacaoReceita > 0 ? '+' : ''}{money(c.variacaoReceita)})</span></span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Elasticidade */}
          {report.elasticidade && report.elasticidade.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2"><TrendingUp className="text-mrts-blue" /> Elasticidade de preço</h2>
              <p className="text-gray-500 text-xs mb-4">Compara preço/ocupação/receita antes e depois de alterações aprovadas por administrador.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider font-bold text-gray-400 border-b border-gray-100">
                      <th className="py-2 pr-3">Faixa</th>
                      <th className="py-2 pr-3 text-right">Preço</th>
                      <th className="py-2 pr-3 text-right">Ocupação antes</th>
                      <th className="py-2 pr-3 text-right">Ocupação depois</th>
                      <th className="py-2 pr-3 text-right">Receita antes</th>
                      <th className="py-2 pr-3 text-right">Receita depois</th>
                      <th className="py-2 pr-3 text-right">Bar antes</th>
                      <th className="py-2 pr-3 text-right">Bar depois</th>
                      <th className="py-2 pr-3">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.elasticidade.map(e => (
                      <tr key={e.id} className="border-b border-gray-50">
                        <td className="py-2.5 pr-3 font-bold text-gray-700 whitespace-nowrap">{e.campoLabel} · {e.faixa}</td>
                        <td className="py-2.5 pr-3 text-right text-gray-700 whitespace-nowrap">{money(e.precoAnterior)} → <span className="font-bold">{money(e.precoNovo)}</span> <span className="text-[10px] text-gray-400">({e.deltaPct > 0 ? '+' : ''}{e.deltaPct.toFixed(1).replace('.', ',')}%)</span></td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap">{pct(e.ocupacaoAntes)}</td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap">{e.ocupacaoDepois != null ? pct(e.ocupacaoDepois) : '⏳'}</td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap">{money(e.receitaAntes)}</td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap">{e.receitaDepois != null ? money(e.receitaDepois) : '⏳'}</td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap">{money(e.consumoBarAntes)}</td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap">{e.consumoBarDepois != null ? money(e.consumoBarDepois) : '⏳'}</td>
                        <td className="py-2.5 pr-3">
                          {e.resultado ? (
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${e.resultado === 'MELHOROU' ? 'bg-emerald-100 text-emerald-700' : e.resultado === 'AUMENTOU_OCUPACAO' ? 'bg-blue-100 text-blue-700' : e.resultado === 'REDUZIU_MARGEM' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                              {e.resultado.replace('_', ' ')}
                            </span>
                          ) : <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-700">Em avaliação</span>}
                          <p className="text-[10px] text-gray-400 mt-0.5 max-w-[180px]">{e.avaliacao}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Histórico de decisões */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
            <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2"><Clock className="text-mrts-blue" /> Histórico de decisões</h2>
            <p className="text-gray-500 text-xs mb-4">Recomendações geradas pelo Copiloto e suas decisões. {isAdmin ? 'Como administrador você pode aprovar (aplica o preço) ou rejeitar.' : 'Somente administradores podem aprovar ou rejeitar.'}</p>
            {report.historico && report.historico.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider font-bold text-gray-400 border-b border-gray-100">
                      <th className="py-2 pr-3">Campo / Faixa</th>
                      <th className="py-2 pr-3">Categoria</th>
                      <th className="py-2 pr-3 text-right">Preço</th>
                      <th className="py-2 pr-3 text-right">Confiança</th>
                      <th className="py-2 pr-3">Decisão</th>
                      <th className="py-2 pr-3">Aprovado por</th>
                      <th className="py-2 pr-3">Data</th>
                      {isAdmin && <th className="py-2 pr-3">Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {report.historico.map((h: HistoricoItem) => (
                      <tr key={h.id} className="border-b border-gray-50">
                        <td className="py-2.5 pr-3 font-bold text-gray-700 whitespace-nowrap">{h.campo === 'fut5' ? 'Campo menor' : h.campo === 'fut7' ? 'Campo maior' : h.campo} {h.faixa ? `· ${h.faixa}` : ''}</td>
                        <td className="py-2.5 pr-3"><span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600">{h.categoria.replace('_', ' ')}</span></td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap">{money(h.precoAtual)} → <span className="font-bold">{money(h.precoSugerido)}</span></td>
                        <td className="py-2.5 pr-3 text-right">{(h.nivelConfianca * 100).toFixed(0).replace('.', ',')}%</td>
                        <td className="py-2.5 pr-3">
                          {h.decisao === 'ACEITA' ? <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700">Aceita{h.precoAplicado != null ? ` · ${money(h.precoAplicado)}` : ''}</span>
                            : h.decisao === 'REJEITADA' ? <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-100 text-red-700">Rejeitada</span>
                            : <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-500">Pendente</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-gray-500">{h.adminName || '—'}</td>
                        <td className="py-2.5 pr-3 text-gray-500">{new Date(h.createdAt).toLocaleDateString('pt-BR')}</td>
                        {isAdmin && (
                          <td className="py-2.5 pr-3">
                            {h.decisao === 'PENDENTE' ? (
                              <div className="flex items-center gap-2">
                                <input value={decisaoId === h.id ? decisaoPreco : ''} onChange={e => { setDecisaoId(h.id); setDecisaoPreco(e.target.value); }} placeholder="Preço a aplicar" className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold w-24" />
                                <button onClick={() => decidir(h.id, 'ACEITA')} disabled={decisaoId === h.id && !decisaoPreco} className="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-lg" title="Aprovar (aplica o preço)"><CheckCircle2 size={16} /></button>
                                <button onClick={() => decidir(h.id, 'REJEITADA')} className="text-red-500 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg" title="Rejeitar"><XCircle size={16} /></button>
                              </div>
                            ) : h.resultado && (
                              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-500">{h.resultado.replace('_', ' ')}</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Nenhuma recomendação registrada ainda. Pergunte ao Copiloto sobre ocupação e preços para gerar as primeiras.</p>
            )}
          </div>
        </>
      )}

      {!loading && report && report.semDados && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 font-medium">
          Nenhuma reserva ou cancelamento no período — não há dados suficientes para analisar ocupação e preços.
        </div>
      )}

      {!loading && !report && !error && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 font-medium">
          Nenhum dado disponível para exibição.
        </div>
      )}
    </div>
  );
}
