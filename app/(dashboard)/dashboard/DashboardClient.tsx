'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase-browser'
import { 
    DollarSign, Coffee, Users, ShoppingBag, X, Receipt, CreditCard, 
    Landmark, Banknote, Activity, Utensils, TrendingUp, PieChart 
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

export default function DashboardClient({ stats, payments, userName, userRole }: DashboardClientProps) {
    const router = useRouter()
    const [isModalOpen, setIsModalOpen] = useState(false)

    // Configuração do Tempo Real
    useEffect(() => {
        const channel = supabase
            .channel('dashboard-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'Payment' },
                () => router.refresh()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'Rental' },
                () => router.refresh()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'Order' },
                () => router.refresh()
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [router])

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
        <div className="animate-in fade-in duration-500 pb-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">Painel Executivo, {userName} 👋</h1>
                    <p className="text-slate-500 font-medium">Indicadores de desempenho em tempo real.</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-2xl flex items-center gap-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-emerald-700 text-xs font-bold uppercase tracking-wider">Sistema Online</span>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* Lucro Líquido (Real) */}
                <div className="bg-slate-900 p-5 rounded-3xl shadow-xl border border-slate-800 flex items-center gap-4 transition-all hover:-translate-y-1 group">
                    <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-emerald-500/20">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lucro Líquido Hoje</p>
                        <h3 className="text-xl font-black text-white">R$ {stats.dailyProfit.toFixed(2).replace('.',',')}</h3>
                    </div>
                </div>

                {/* Taxa de Ocupação */}
                <div className="bg-white p-5 rounded-3xl shadow-soft border border-gray-100 flex items-center gap-4 transition-all hover:shadow-xl hover:-translate-y-1 group">
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Activity size={24} />
                    </div>
                    <div className="flex-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Taxa de Ocupação</p>
                        <div className="flex items-end gap-2">
                            <h3 className="text-xl font-black text-slate-800">{stats.occupancyRate.toFixed(1)}%</h3>
                            <span className="text-[10px] text-gray-400 mb-1 font-medium">{stats.totalRentals} jogos</span>
                        </div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div 
                                className="bg-indigo-500 h-full rounded-full transition-all duration-1000" 
                                style={{ width: `${stats.occupancyRate}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* Ticket Médio Bar */}
                <div className="bg-white p-5 rounded-3xl shadow-soft border border-gray-100 flex items-center gap-4 transition-all hover:shadow-xl hover:-translate-y-1 group">
                    <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Utensils size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ticket Médio Bar</p>
                        <h3 className="text-xl font-black text-slate-800">R$ {stats.barTicketAverage.toFixed(2).replace('.',',')}</h3>
                    </div>
                </div>

                {/* Faturamento do Dia (Clicável) */}
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="bg-white p-5 rounded-3xl shadow-soft border border-gray-100 flex items-center gap-4 text-left transition-all hover:shadow-xl hover:border-emerald-200 hover:-translate-y-1 group"
                >
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Faturamento Bruto</p>
                        <h3 className="text-xl font-black text-slate-800">R$ {stats.todayRevenue.toFixed(2).replace('.',',')}</h3>
                        <p className="text-[9px] text-emerald-600 font-black uppercase mt-1 opacity-0 group-hover:opacity-100 transition-opacity tracking-tighter">Clique para ver detalhes</p>
                    </div>
                </button>
            </div>

            {/* Faturamento por Campo e Stats Rápidos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-soft border border-gray-100">
                    <div className="flex items-center gap-2 mb-6">
                        <PieChart size={18} className="text-indigo-500"/>
                        <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Faturamento por Campo (Hoje)</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {Object.entries(stats.fieldRevenue).length === 0 ? (
                            <p className="text-gray-400 text-sm italic col-span-2 py-4">Nenhuma locação realizada nos campos hoje.</p>
                        ) : (
                            Object.entries(stats.fieldRevenue).map(([name, value]) => (
                                <div key={name} className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex justify-between items-center">
                                    <span className="font-bold text-slate-600 text-sm">{name}</span>
                                    <span className="font-black text-indigo-600">R$ {value.toFixed(2).replace('.',',')}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="lg:col-span-1 grid grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-3xl shadow-soft border border-gray-100 flex flex-col justify-center items-center text-center group transition-all hover:bg-slate-50">
                        <Coffee size={20} className="text-amber-500 mb-2 group-hover:scale-125 transition-transform" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Comandas Abertas</p>
                        <h3 className="text-2xl font-black text-slate-800">{stats.openOrders}</h3>
                    </div>
                    <div className="bg-white p-5 rounded-3xl shadow-soft border border-gray-100 flex flex-col justify-center items-center text-center group transition-all hover:bg-slate-50">
                        <ShoppingBag size={20} className="text-purple-500 mb-2 group-hover:scale-125 transition-transform" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Produtos Ativos</p>
                        <h3 className="text-2xl font-black text-slate-800">{stats.totalProducts}</h3>
                    </div>
                </div>
            </div>

            {/* Modal de Detalhes */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">Detalhamento de Faturamento</h2>
                                <p className="text-sm text-gray-500">Pagamentos vinculados ao último caixa</p>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                            >
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>
                        
                        <div className="max-h-[60vh] overflow-y-auto p-6">
                            {payments.length === 0 ? (
                                <div className="text-center py-10 text-gray-500">Nenhum pagamento registrado hoje.</div>
                            ) : (
                                <div className="space-y-3">
                                    {payments.map((p) => (
                                        <div key={p.id} className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                                                    {getMethodIcon(p.method)}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-800">
                                                        {p.type === 'SUBSCRIPTION' ? 'Mensalidade' : (p.order?.customerName || 'Venda Balcão')}
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                                        <span>{translateMethod(p.method)}</span>
                                                        <span>•</span>
                                                        <span>{new Date(p.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}h</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-emerald-600">R$ {p.amount.toFixed(2).replace('.',',')}</p>
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wider">{p.user?.name || 'Sistema'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-emerald-600 text-white flex justify-between items-center">
                            <span className="font-medium opacity-90 text-sm uppercase tracking-widest">Total Acumulado</span>
                            <span className="text-2xl font-black">R$ {stats.todayRevenue.toFixed(2).replace('.',',')}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
