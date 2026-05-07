'use client'

import { useState } from 'react'
import { DollarSign, Coffee, Users, ShoppingBag, X, Receipt, CreditCard, Landmark, Banknote } from "lucide-react"

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
        grossProfit: number
    }
    payments: PaymentDetail[]
    userName: string
    userRole: string
}

export default function DashboardClient({ stats, payments, userName, userRole }: DashboardClientProps) {
    const [isModalOpen, setIsModalOpen] = useState(false)

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
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Bem-vindo, {userName} 👋</h1>
            <p className="text-gray-500 mb-8">Aqui está o resumo da sua operação de hoje.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                {/* Último Faturamento - Clicável */}
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="bg-white p-5 rounded-2xl shadow-soft border border-gray-100 flex items-center gap-4 text-left transition-all hover:shadow-xl hover:border-emerald-200 hover:-translate-y-1 group"
                >
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-gray-500">Último Faturamento</p>
                        <h3 className="text-xl font-bold text-gray-800">R$ {stats.todayRevenue.toFixed(2).replace('.',',')}</h3>
                        <p className="text-[10px] text-emerald-600 font-bold uppercase mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Ver detalhes</p>
                    </div>
                </button>

                {/* NOVO: Lucro Bruto */}
                <div className="bg-white p-5 rounded-2xl shadow-soft border border-gray-100 flex items-center gap-4 transition-all hover:shadow-xl hover:border-blue-200 hover:-translate-y-1 group">
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Landmark size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-gray-500">Lucro Bruto (Turno)</p>
                        <h3 className="text-xl font-bold text-emerald-600">R$ {stats.grossProfit.toFixed(2).replace('.',',')}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-soft border border-gray-100 flex items-center gap-4 transition-all hover:shadow-xl hover:border-amber-200 hover:-translate-y-1 group">
                    <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Coffee size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-gray-500">Comandas Abertas</p>
                        <h3 className="text-xl font-bold text-gray-800">{stats.openOrders}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-soft border border-gray-100 flex items-center gap-4 transition-all hover:shadow-xl hover:border-purple-200 hover:-translate-y-1 group">
                    <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <ShoppingBag size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-gray-500">Produtos Ativos</p>
                        <h3 className="text-xl font-bold text-gray-800">{stats.totalProducts}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-soft border border-gray-100 flex items-center gap-4 transition-all hover:shadow-xl hover:border-orange-200 hover:-translate-y-1 group">
                    <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Users size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-gray-500">Equipe</p>
                        <h3 className="text-xl font-bold text-gray-800">{stats.totalUsers}</h3>
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
