'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '../../../lib/supabase-browser'
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts'
import { 
    DollarSign, Coffee, Users, ShoppingBag, X, Receipt, CreditCard, 
    Landmark, Banknote, Activity, Utensils, TrendingUp, PieChart,
    Calendar, ArrowUpRight, Zap
} from "lucide-react"

interface PaymentDetail {
    id: string
    amount: number
    method: string
    date: Date
    order?: {
        customerName: string | null
    }
    user?: {
        name: string | null
    }
    type: 'ORDER' | 'SUBSCRIPTION'
}

interface DashboardClientProps {
    stats: {
        totalUsers: number
        totalProducts: number
        openOrders: number
        todayRevenue: number
        occupancyRate: number
        barTicketAverage: number
        fieldRevenue: Record<string, number>
        dailyProfit: number
        totalRentals: number
    }
    payments: PaymentDetail[]
    userName: string
    userRole: string
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function DashboardClient({ stats, payments, userName, userRole }: DashboardClientProps) {
    const router = useRouter()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    // Configuração Segura do Tempo Real
    useEffect(() => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const channel = supabase
            .channel('dashboard-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Payment' }, () => router.refresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Rental' }, () => router.refresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Order' }, () => router.refresh())
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [router])

    const fieldData = Object.entries(stats.fieldRevenue).map(([name, value]) => ({
        name,
        value,
    })).sort((a, b) => b.value - a.value);

    const getMethodIcon = (method: string) => {
        switch (method) {
            case 'CREDIT': return <CreditCard size={16} className="text-blue-500" />
            case 'DEBIT': return <CreditCard size={16} className="text-purple-500" />
            case 'PIX': return <Landmark size={16} className="text-emerald-500" />
            case 'CASH': return <Banknote size={16} className="text-amber-500" />
            default: return <Receipt size={16} className="text-gray-500" />
        }
    }

    const translateMethod = (method: string) => {
        switch (method) {
            case 'CREDIT': return 'Crédito'
            case 'DEBIT': return 'Débito'
            case 'PIX': return 'Pix'
            case 'CASH': return 'Dinheiro'
            case 'SUBSCRIPTION': return 'Mensalidade'
            default: return method
        }
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
            {/* Header com Glassmorphism */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white/50 backdrop-blur-xl p-6 rounded-[2rem] border border-white shadow-sm">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Capitão Dashboard</h1>
                        <span className="bg-slate-900 text-white text-[10px] px-2 py-1 rounded-full font-black uppercase tracking-widest">Admin</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 font-medium">
                        <Calendar size={14} />
                        <span>{currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                        <span className="text-slate-300">|</span>
                        <span className="font-mono">{currentTime.toLocaleTimeString('pt-BR')}</span>
                    </div>
                </div>
                <div className="flex gap-3">
                    <div className="bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-2xl flex items-center gap-3 shadow-sm shadow-emerald-500/10">
                        <div className="relative">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                            <div className="absolute inset-0 w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
                        </div>
                        <span className="text-emerald-700 text-xs font-black uppercase tracking-wider">Live Metrics</span>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Lucro Líquido (Real) */}
                <div className="relative overflow-hidden bg-slate-900 p-6 rounded-[2rem] shadow-2xl border border-slate-800 flex flex-col justify-between h-40 transition-all hover:scale-[1.02] active:scale-95 group cursor-default">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all"></div>
                    <div className="flex justify-between items-start">
                        <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center">
                            <TrendingUp size={20} />
                        </div>
                        <div className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg flex items-center gap-1 uppercase tracking-tighter">
                            <Zap size={10} /> Realtime
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Lucro Líquido Hoje</p>
                        <h3 className="text-2xl font-black text-white tracking-tight">R$ {stats.dailyProfit.toFixed(2).replace('.',',')}</h3>
                    </div>
                </div>

                {/* Taxa de Ocupação */}
                <div className="bg-white p-6 rounded-[2rem] shadow-soft border border-gray-100 flex flex-col justify-between h-40 transition-all hover:shadow-xl hover:scale-[1.02] group cursor-default">
                    <div className="flex justify-between items-start">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center">
                            <Activity size={20} />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stats.totalRentals} jogos</span>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Taxa de Ocupação</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{stats.occupancyRate.toFixed(1)}%</h3>
                            <div className="w-full max-w-[80px] bg-gray-100 h-1.5 rounded-full overflow-hidden mb-1.5">
                                <div 
                                    className="bg-indigo-500 h-full rounded-full transition-all duration-1000" 
                                    style={{ width: `${stats.occupancyRate}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Ticket Médio Bar */}
                <div className="bg-white p-6 rounded-[2rem] shadow-soft border border-gray-100 flex flex-col justify-between h-40 transition-all hover:shadow-xl hover:scale-[1.02] group cursor-default">
                    <div className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center">
                        <Utensils size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Ticket Médio Bar</p>
                        <h3 className="text-3xl font-black text-slate-800 tracking-tighter">R$ {stats.barTicketAverage.toFixed(2).replace('.',',')}</h3>
                    </div>
                </div>

                {/* Faturamento do Dia */}
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="bg-white p-6 rounded-[2rem] shadow-soft border border-gray-100 flex flex-col justify-between h-40 text-left transition-all hover:shadow-xl hover:border-emerald-200 hover:scale-[1.02] group"
                >
                    <div className="flex justify-between items-start">
                        <div className="w-10 h-10 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <DollarSign size={20} />
                        </div>
                        <ArrowUpRight size={16} className="text-gray-300 group-hover:text-emerald-500 transition-colors" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Faturamento Bruto</p>
                        <h3 className="text-3xl font-black text-slate-800 tracking-tighter">R$ {stats.todayRevenue.toFixed(2).replace('.',',')}</h3>
                        <p className="text-[9px] text-emerald-600 font-black uppercase mt-1 tracking-tighter opacity-70 group-hover:opacity-100">Ver detalhes</p>
                    </div>
                </button>
            </div>

            {/* Faturamento por Campo — Recharts Premium */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] shadow-soft border border-gray-100 flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center">
                                <PieChart size={16}/>
                            </div>
                            <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Receita por Campo</h3>
                        </div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ranking Financeiro</div>
                    </div>
                    
                    <div className="h-72 w-full">
                        {fieldData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-gray-400 text-sm italic">Sem movimentação nos campos hoje.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={fieldData} layout="vertical" margin={{ left: 40, right: 20 }}>
                                    <XAxis type="number" hide />
                                    <YAxis 
                                        dataKey="name" 
                                        type="category" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }} 
                                        width={100}
                                    />
                                    <Tooltip 
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                                        formatter={(v: any) => `R$ ${Number(v).toFixed(2)}`}
                                    />
                                    <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={32}>
                                        {fieldData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-1 flex flex-col gap-6">
                    <div className="flex-1 bg-white p-6 rounded-[2rem] shadow-soft border border-gray-100 flex flex-col justify-center items-center text-center group transition-all hover:bg-slate-50 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Coffee size={80} />
                        </div>
                        <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                            <Coffee size={24} />
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Comandas Abertas</p>
                        <h3 className="text-4xl font-black text-slate-800 tracking-tighter">{stats.openOrders}</h3>
                    </div>
                    
                    <div className="flex-1 bg-white p-6 rounded-[2rem] shadow-soft border border-gray-100 flex flex-col justify-center items-center text-center group transition-all hover:bg-slate-50 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <ShoppingBag size={80} />
                        </div>
                        <div className="w-12 h-12 bg-purple-50 text-purple-500 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                            <ShoppingBag size={24} />
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Catálogo Ativo</p>
                        <h3 className="text-4xl font-black text-slate-800 tracking-tighter">{stats.totalProducts}</h3>
                    </div>
                </div>
            </div>

            {/* Modal de Detalhes — Premium Backdrop */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-400">
                        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Fluxo de Caixa</h2>
                                <p className="text-xs text-slate-500 font-medium">Relatório detalhado do caixa atual</p>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="w-10 h-10 bg-white border border-gray-200 flex items-center justify-center rounded-full hover:bg-red-50 hover:text-red-500 transition-all active:scale-90"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="max-h-[50vh] overflow-y-auto p-8 custom-scrollbar">
                            {payments.length === 0 ? (
                                <div className="text-center py-20 flex flex-col items-center gap-3">
                                    <Receipt size={40} className="text-gray-200" />
                                    <p className="text-gray-400 text-sm font-medium">Nenhum lançamento detectado no caixa ativo.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {payments.map((p) => (
                                        <div key={p.id} className="flex items-center justify-between p-5 rounded-3xl border border-gray-50 hover:border-indigo-100 hover:bg-indigo-50/20 transition-all group">
                                            <div className="flex items-center gap-5">
                                                <div className="w-12 h-12 bg-white shadow-sm border border-gray-100 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    {getMethodIcon(p.method)}
                                                </div>
                                                <div>
                                                    <p className="font-black text-slate-700 text-sm">
                                                        {p.type === 'SUBSCRIPTION' ? 'PAGAMENTO MENSALIDADE' : (p.order?.customerName || 'VENDA DIRETA')}
                                                    </p>
                                                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                                        <span className="text-indigo-500">{translateMethod(p.method)}</span>
                                                        <span className="opacity-30">•</span>
                                                        <span>{new Date(p.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}h</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-black text-slate-900">R$ {p.amount.toFixed(2).replace('.',',')}</p>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{p.user?.name || 'Sistema'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-8 bg-slate-900 text-white flex justify-between items-center relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-10">
                                <DollarSign size={80} />
                            </div>
                            <div>
                                <span className="font-black opacity-60 text-[10px] uppercase tracking-[0.2em] block mb-1">Faturamento Consolidado</span>
                                <span className="text-3xl font-black tracking-tighter italic">R$ {stats.todayRevenue.toFixed(2).replace('.',',')}</span>
                            </div>
                            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-[10px] font-black uppercase tracking-widest">
                                Caixa Ativo
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
