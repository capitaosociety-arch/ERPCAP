'use client'

import { useState } from 'react';
import Link from 'next/link';
import {
  Lightbulb, Target, Activity, ArrowRight, X,
  DollarSign, Wallet, Percent, Landmark, ClipboardList, Users, LoaderCircle,
  TrendingUp, TrendingDown, Minus, OctagonAlert, BrainCircuit
} from 'lucide-react';
import { getIntelligenceReport, type Analise, type IntelligenceReport, type Secao } from '../../actions/inteligencia';
import CopilotClient, { type CopilotAccess } from './CopilotClient';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type PeriodoKey = '7d' | '30d' | '90d' | 'month';

const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'month', label: 'Mês atual' },
];

const SECTION_META: Record<Secao, { titulo: string; icone: any; cores: { bg: string; border: string; text: string; badge: string; grad: string } }> = {
  RISCO: {
    titulo: 'Riscos',
    icone: OctagonAlert,
    cores: {
      bg: 'bg-red-50/60',
      border: 'border-red-100',
      text: 'text-red-700',
      badge: 'bg-red-100 text-red-700',
      grad: 'from-red-500 to-rose-500'
    }
  },
  OPORTUNIDADE: {
    titulo: 'Oportunidades',
    icone: Lightbulb,
    cores: {
      bg: 'bg-emerald-50/60',
      border: 'border-emerald-100',
      text: 'text-emerald-700',
      badge: 'bg-emerald-100 text-emerald-700',
      grad: 'from-emerald-500 to-teal-500'
    }
  },
  RECOMENDACAO: {
    titulo: 'Recomendações',
    icone: Target,
    cores: {
      bg: 'bg-blue-50/60',
      border: 'border-blue-100',
      text: 'text-blue-700',
      badge: 'bg-blue-100 text-blue-700',
      grad: 'from-blue-500 to-indigo-500'
    }
  },
  TENDENCIA: {
    titulo: 'Tendências',
    icone: Activity,
    cores: {
      bg: 'bg-violet-50/60',
      border: 'border-violet-100',
      text: 'text-violet-700',
      badge: 'bg-violet-100 text-violet-700',
      grad: 'from-violet-500 to-fuchsia-500'
    }
  }
};

const SECTION_ORDER: Secao[] = ['RISCO', 'OPORTUNIDADE', 'RECOMENDACAO', 'TENDENCIA'];

function money(v: number) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function InteligenciaClient({
  initialReport,
  initialError,
  copilot
}: {
  initialReport: IntelligenceReport | null;
  initialError?: string;
  copilot: CopilotAccess;
}) {
  const [tab, setTab] = useState<'analises' | 'copiloto'>('analises');
  const [periodo, setPeriodo] = useState<PeriodoKey>('30d');
  const [report, setReport] = useState<IntelligenceReport | null>(initialReport);
  const [error, setError] = useState<string | undefined>(initialError);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Analise | null>(null);
  const ModalMeta = selected ? SECTION_META[selected.secao] : null;

  const changePeriod = async (key: PeriodoKey) => {
    if (key === periodo) return;
    setPeriodo(key);
    setLoading(true);
    setError(undefined);
    const res = await getIntelligenceReport(key);
    setLoading(false);
    if (res.success) {
      setReport(res.report!);
    } else {
      setError(res.error);
    }
  };

  const k = report?.kpis;

  const kpiCards = k ? [
    { label: 'Receita de vendas', value: money(k.receitaVendas), icon: DollarSign, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Mensalidades', value: money(k.receitaMensalidades), icon: Wallet, tone: 'text-sky-600 bg-sky-50' },
    { label: 'Ticket médio', value: money(k.ticketMedio), icon: Percent, tone: 'text-indigo-600 bg-indigo-50' },
    { label: 'Margem bruta', value: `${k.margemBruta.toFixed(1).replace('.', ',')}%`, icon: TrendingUp, tone: 'text-amber-600 bg-amber-50' },
    { label: 'Resultado líquido', value: money(k.resultadoLiquido), icon: Landmark, tone: k.resultadoLiquido >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50' },
    { label: 'Comandas pagas', value: k.comandasPagas.toLocaleString('pt-BR'), icon: ClipboardList, tone: 'text-teal-600 bg-teal-50' },
    { label: 'Estoque abaixo do mínimo', value: k.estoqueAbaixoMinimo.toLocaleString('pt-BR'), icon: Target, tone: k.estoqueAbaixoMinimo > 0 ? 'text-red-600 bg-red-50' : 'text-slate-500 bg-slate-50' },
    { label: 'Mensalidades inadimplentes', value: k.mensalidadesInadimplentes.toLocaleString('pt-BR'), icon: Users, tone: k.mensalidadesInadimplentes > 0 ? 'text-orange-600 bg-orange-50' : 'text-slate-500 bg-slate-50' },
  ] : [];

  return (
    <div className="animate-in fade-in duration-500 pb-10">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <BrainCircuit className="text-mrts-blue" /> Central de Inteligência
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Análises geradas por regras sobre os dados reais do sistema. Período: <span className="font-bold text-gray-700">{report?.periodoLabel || '—'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-2xl border border-gray-100 p-1.5 shadow-sm">
          {PERIODOS.map(p => (
            <button
              key={p.key}
              onClick={() => changePeriod(p.key)}
              disabled={loading}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${periodo === p.key ? 'bg-mrts-blue text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-2 mb-6 bg-white rounded-2xl border border-gray-100 p-1.5 shadow-sm w-fit">
        <button
          onClick={() => setTab('analises')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'analises' ? 'bg-slate-900 text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          Análises por regras
        </button>
        <button
          onClick={() => setTab('copiloto')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${tab === 'copiloto' ? 'bg-mrts-blue text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <BrainCircuit size={15} /> Copiloto IA
        </button>
      </div>

      {tab === 'copiloto' && <CopilotClient access={copilot} />}

      {tab === 'analises' && (
      <div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 mb-6 font-medium text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-6 flex items-center justify-center gap-3 text-gray-500 font-bold">
          <LoaderCircle className="animate-spin" /> Analisando dados do período...
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {kpiCards.map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${card.tone}`}>
              <card.icon size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 truncate">{card.label}</p>
              <p className="text-lg font-black text-gray-800 truncate">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico de tendência */}
      {report && report.tendenciaSerie.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8 relative overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Receita de vendas no período</h2>
              <p className="text-gray-500 text-xs md:text-sm">Faturamento por dia/semana (fuso Cuiabá)</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.tendenciaSerie} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIntel" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} tickFormatter={(value) => `R$${value}`} />
                <Tooltip
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', padding: '16px' }}
                  formatter={(value: any) => [money(Number(value)), 'Receita']}
                  labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}
                  cursor={{ stroke: '#4f46e5', strokeWidth: 1, strokeDasharray: '5 5' }}
                />
                <Area
                  type="monotone"
                  dataKey="valor"
                  stroke="#4f46e5"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorIntel)"
                  activeDot={{ r: 6, fill: '#4f46e5', stroke: '#fff', strokeWidth: 3 }}
                  animationDuration={1200}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Seções de análises */}
      {report && SECTION_ORDER.map(secao => {
        const meta = SECTION_META[secao];
        const itens = report.analises.filter(a => a.secao === secao);
        if (itens.length === 0) return null;
        return (
          <section key={secao} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${meta.cores.grad} text-white flex items-center justify-center shadow`}>
                <meta.icone size={16} />
              </div>
              <h2 className="text-lg font-bold text-gray-800">{meta.titulo}</h2>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${meta.cores.badge}`}>{itens.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {itens.map(a => (
                <CardAnalise key={a.id} analise={a} onClick={() => setSelected(a)} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Nota de paridade */}
      {report && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-500">
          <p className="font-bold text-slate-600 mb-1">Sobre o Resultado Líquido</p>
          <p>
            O resultado líquido (regime de caixa) usa exatamente o mesmo cálculo do módulo Financeiro:
            receitas de vendas + outras receitas − CMV − despesas operacionais − impostos − despesas financeiras,
            no período selecionado. Valores parciais no período podem não coincidir com o DRE mensal do Financeiro.
          </p>
        </div>
      )}

      {/* Modal de detalhe */}
      {selected && ModalMeta && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4 gap-4">
              <div>
                <span className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold px-3 py-1 rounded-full ${ModalMeta?.cores.badge}`}>
                  <ModalMeta.icone size={12} /> {ModalMeta.titulo}
                </span>
                <h2 className="text-xl font-bold text-gray-800 mt-3">{selected.titulo}</h2>
                <p className="text-gray-500 text-sm mt-1">{selected.resumo}</p>
              </div>
              <button onClick={() => setSelected(null)} className="bg-slate-100 text-slate-500 w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-200 shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Indicador</p>
                <p className="text-2xl font-black text-gray-800">{selected.indicador} <span className="text-sm font-bold text-gray-400">{selected.unidade}</span></p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Impacto</p>
                <p className="font-bold text-gray-700">{selected.impacto}</p>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Comparação</p>
                <p className="text-gray-700 font-medium">{selected.comparacao}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Causa</p>
                <p className="text-gray-700 font-medium">{selected.causa}</p>
              </div>
              <div className="bg-mrts-blue/5 border border-mrts-blue/10 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-wider font-bold text-mrts-blue mb-1">Ação sugerida</p>
                <p className="text-gray-800 font-bold">{selected.acao}</p>
              </div>
              {selected.dados.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Dados que sustentam</p>
                  <ul className="space-y-1.5">
                    {selected.dados.map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-gray-700">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-mrts-blue shrink-0" />
                        <span className="font-medium">{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
              <Link
                href={selected.link}
                className="flex-[1] bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition flex items-center justify-center gap-2"
              >
                Ver relatório de origem <ArrowRight size={16} />
              </Link>
              <button onClick={() => setSelected(null)} className="px-6 font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 py-3 rounded-xl transition">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {!report && !loading && !error && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 font-medium">
          Nenhum dado disponível para exibição.
        </div>
      )}
      </div>
      )}
    </div>
  );
}

function CardAnalise({ analise, onClick }: { analise: Analise; onClick: () => void }) {
  const meta = SECTION_META[analise.secao];
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-2xl border ${meta.cores.border} shadow-sm p-5 transition-all hover:shadow-md hover:-translate-y-0.5 flex flex-col gap-2 group`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${meta.cores.grad} text-white flex items-center justify-center shrink-0`}>
          <meta.icone size={15} />
        </div>
        <div className="flex items-center gap-1.5">
          {analise.severidade && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              analise.severidade === 'ALTA' ? 'bg-red-100 text-red-700' : analise.severidade === 'MEDIA' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {analise.severidade}
            </span>
          )}
          {analise.tendencia && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
              analise.tendencia === 'CRESCENDO' ? 'bg-emerald-100 text-emerald-700' : analise.tendencia === 'CAINDO' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {analise.tendencia === 'CRESCENDO' ? <TrendingUp size={11} /> : analise.tendencia === 'CAINDO' ? <TrendingDown size={11} /> : <Minus size={11} />}
              {analise.tendencia === 'CRESCENDO' ? 'Crescendo' : analise.tendencia === 'CAINDO' ? 'Caindo' : 'Estável'}
            </span>
          )}
        </div>
      </div>

      <h3 className="font-bold text-gray-800 leading-snug">{analise.titulo}</h3>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-black text-gray-900">{analise.indicador}</span>
        {analise.unidade && <span className="text-xs font-bold text-gray-400">{analise.unidade}</span>}
      </div>
      <p className="text-sm text-gray-500 leading-relaxed line-clamp-3">{analise.resumo}</p>

      <div className="mt-auto pt-2 flex items-center justify-between">
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${meta.cores.badge}`}>
          {analise.impacto}
        </span>
        <span className={`inline-flex items-center gap-1 text-xs font-bold ${meta.cores.text} opacity-0 group-hover:opacity-100 transition`}>
          Detalhes <ArrowRight size={13} />
        </span>
      </div>
    </button>
  );
}
