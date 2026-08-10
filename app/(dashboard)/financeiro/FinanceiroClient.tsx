'use client';

import React, { useState, useTransition } from 'react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
    DollarSign, Wallet, Activity, Database, Users, Lock, Unlock, ArrowRight, Sheet, 
    Plus, Calendar, CheckCircle, XCircle, Trash2, Filter, AlertCircle, TrendingUp, TrendingDown, 
    Eye, CreditCard, Banknote, ShoppingBag, RotateCcw, Landmark, Edit2, Search, FileDown, Trophy
} from 'lucide-react';
import { downloadExcel, downloadMultiSheetExcel } from '../../../lib/excel-export';
import { downloadDrePdf } from '../../../lib/pdf-export';
import { createFinancialEntry, updateFinancialStatus, deleteFinancialEntry, updateFinancialEntry } from '../../actions/financeiro';
import { getRegisterSummary, deleteCashSessionAction, getSessionsForDepositAction, recordCashDepositAction, recordGlobalCashDepositAction } from '../../actions/caixa';
import { voidPaymentAction, editPaymentAction } from '../../actions/comandas';

import { useRouter, useSearchParams } from 'next/navigation';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#0ea5e9'];

export default function FinanceiroClient({ payload }: any) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const {
        totalRevenue, totalPendingPayable, totalPendingReceivable,
        dailyChart, methodChart,
        cashRegisters, financialEntries, dreMonths, dreDetails, fieldRentalStats
    } = payload;

    const [activeTab, setActiveTab] = useState('DASHBOARD'); // DASHBOARD, CASHIER, BILLING, DRE

    // Formata contagens que podem ser fracionadas por pagamento parcial (ex.: meio jogo)
    const fmtCount = (v: any) => {
        const n = Number(v || 0);
        return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
    };
    const [dreMonth, setDreMonth] = useState('');
    const [isPending, startTransition] = useTransition();
    const [showAddModal, setShowAddModal] = useState(false);
    const [filterType, setFilterType] = useState('ALL'); // ALL, PAYABLE, RECEIVABLE
    const [searchTerm, setSearchTerm] = useState('');
    const [billFrom, setBillFrom] = useState('');
    const [billTo, setBillTo] = useState('');
    const [editingEntry, setEditingEntry] = useState<any>(null);
    const [viewingEntry, setViewingEntry] = useState<any>(null);

    // Filtros de Data
    const [dateFrom, setDateFrom] = useState(searchParams.get('from') || '');
    const [dateTo, setDateTo] = useState(searchParams.get('to') || '');

    const handleApplyFilters = () => {
        const params = new URLSearchParams(searchParams.toString());
        if (dateFrom) params.set('from', dateFrom);
        else params.delete('from');

        if (dateTo) params.set('to', dateTo);
        else params.delete('to');

        startTransition(() => {
            router.push(`/financeiro?${params.toString()}`);
        });
    };

    const handleClearFilters = () => {
        setDateFrom('');
        setDateTo('');
        startTransition(() => {
            router.push('/financeiro');
        });
    };
    // States para o novo lançamento
    const [newEntry, setNewEntry] = useState({
        description: '',
        type: 'PAYABLE',
        amount: '',
        dueDate: new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' }),
        category: 'Diversos',
        notes: '',
        method: 'PIX',
        reference: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
        installments: 1
    });

    const [selectedCashRegister, setSelectedCashRegister] = useState<any>(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [editingPayment, setEditingPayment] = useState<{id: string, method: string, amount: number} | null>(null);

    // States para Depósitos
    const [depositSessions, setDepositSessions] = useState<any[]>([]);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [isGlobalDeposit, setIsGlobalDeposit] = useState(false);
    const [selectedSessionForDep, setSelectedSessionForDep] = useState<any>(null);
    const [depositAmount, setDepositAmount] = useState('');
    const [depositNotes, setDepositNotes] = useState('');

    const todayVal = dailyChart[dailyChart.length - 1]?.total || 0;

    const exportAllData = () => {
        const sheets = [
            {
                sheetName: 'Resumo Faturamento',
                data: dailyChart.map((d: any) => ({
                    'Data': d.date,
                    'Aluguel (R$)': d.aluguel,
                    'Produtos (R$)': d.produtos,
                    'Total (R$)': d.total
                }))
            },
            {
                sheetName: 'Contas e Vencimentos',
                data: financialEntries.map((e: any) => ({
                    'Descrição': e.description,
                    'Tipo': e.type === 'PAYABLE' ? 'A Pagar' : 'A Receber',
                    'Valor': e.amount,
                    'Vencimento': new Date(e.dueDate).toLocaleDateString('pt-BR'),
                    'Status': e.status === 'PAID' ? 'Pago' : 'Pendente',
                    'Categoria': e.category,
                    'Método': e.method
                }))
            },
            {
                sheetName: 'Sessões de Caixa',
                data: cashRegisters.map((c: any) => ({
                    'ID': c.id,
                    'Operador': c.user?.name || 'N/A',
                    'Abertura': new Date(c.openedAt).toLocaleString('pt-BR'),
                    'Fechamento': c.closedAt ? new Date(c.closedAt).toLocaleString('pt-BR') : 'Aberto',
                    'Saldo Inicial': c.openingBalance,
                    'Saldo Final Esperado': c.closingBalance || 'N/A'
                }))
            }
        ];

        downloadMultiSheetExcel(sheets, `Financeiro_Capitao_${new Date().toLocaleDateString('sv-SE')}`);
    };

    const handleCreateEntry = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEntry.description || !newEntry.amount || !newEntry.dueDate) return;

        startTransition(async () => {
            await createFinancialEntry({
                ...newEntry,
                type: newEntry.type as 'PAYABLE' | 'RECEIVABLE',
                amount: parseFloat(newEntry.amount),
                installments: parseInt(newEntry.installments.toString(), 10) || 1
            });
            setShowAddModal(false);
            setNewEntry({
                description: '',
                type: 'PAYABLE',
                amount: '',
                dueDate: new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' }),
                category: 'Diversos',
                notes: '',
                method: 'PIX',
                reference: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
                installments: 1
            });
        });
    };

    const handleUpdateStatus = async (id: string, status: any) => {
        startTransition(async () => {
            await updateFinancialStatus(id, status);
        });
    };

    const handleUpdateEntry = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEntry) return;
        if (!editingEntry.description || !editingEntry.amount || !editingEntry.dueDate) return;

        startTransition(async () => {
            try {
                await updateFinancialEntry(editingEntry.id, {
                    description: editingEntry.description,
                    type: editingEntry.type,
                    amount: parseFloat(String(editingEntry.amount).replace(',', '.')),
                    dueDate: editingEntry.dueDate,
                    category: editingEntry.category,
                    notes: editingEntry.notes,
                    method: editingEntry.method,
                    reference: editingEntry.reference
                });
                setEditingEntry(null);
                router.refresh();
            } catch (err: any) {
                alert("Erro ao editar lançamento: " + (err.message || "Tente novamente."));
            }
        });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
        startTransition(async () => {
            await deleteFinancialEntry(id);
        });
    };

    const handleDeleteSession = async (id: string) => {
        if (!confirm("ATENÇÃO: Deseja realmente EXCLUIR esta sessão de caixa e TODO o seu histórico de vendas e pagamentos? Esta ação removerá os dados de auditoria permanentemente e é recomendada apenas para limpar testes.")) return;
        startTransition(async () => {
            try {
                const res = await deleteCashSessionAction(id);
                if (res && !res.success) {
                    alert("Falha ao excluir: " + res.error);
                } else {
                    alert("Sessão excluída com sucesso!");
                }
            } catch (e: any) {
                alert("Erro técnico: " + e.message);
            }
        });
    };

    const handleViewDetails = async (cash: any) => {
        setLoadingDetails(true);
        setIsDetailsModalOpen(true);
        try {
            const summary = await getRegisterSummary(cash.id);
            setSelectedCashRegister(summary);
        } catch (e) {
            console.error(e);
            alert('Erro ao carregar os detalhes do caixa');
            setIsDetailsModalOpen(false);
        } finally {
            setLoadingDetails(false);
        }
    };

    const filteredEntries = financialEntries.filter((e: any) => {
        if (filterType !== 'ALL' && e.type !== filterType) return false;

        const due = new Date(e.dueDate);
        if (billFrom) {
            const from = new Date(billFrom + 'T00:00:00');
            if (due < from) return false;
        }
        if (billTo) {
            const to = new Date(billTo + 'T23:59:59');
            if (due > to) return false;
        }
        return true;
    });

    const searchedEntries = filteredEntries.filter((e: any) => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return true;
        return [e.description, e.category, e.reference, e.method, e.notes, e.status]
            .filter(Boolean)
            .some((field: any) => String(field).toLowerCase().includes(term));
    });

    const handleVoidPayment = async (paymentId: string) => {
        if (!confirm("Deseja realmente ESTORNAR este pagamento? O valor será removido do caixa e a comanda será reaberta se estiver fechada.")) return;

        startTransition(async () => {
            try {
                const res = await voidPaymentAction(paymentId);
                if (res && !res.success) {
                    alert("Falha no estorno: " + res.error);
                    return;
                }

                // Refresh summary
                if (selectedCashRegister) {
                    const data = await getRegisterSummary(selectedCashRegister.id);
                    setSelectedCashRegister({ ...selectedCashRegister, ...data });
                }
                alert("Pagamento estornado com sucesso!");
            } catch (err: any) {
                alert("Falha técnica no estorno: " + err.message);
            }
        });
    };

    const handleSavePaymentEdit = async () => {
        if (!editingPayment) return;
        if (!confirm("Deseja alterar os dados deste pagamento? Isso alterará os totais do caixa e relatórios.")) return;

        startTransition(async () => {
            try {
                const res = await editPaymentAction(editingPayment.id, editingPayment.method, editingPayment.amount);
                if (res && !res.success) {
                    alert("Falha ao editar: " + res.error);
                    return;
                }
                
                setEditingPayment(null);
                
                // Refresh summary
                if (selectedCashRegister) {
                    const data = await getRegisterSummary(selectedCashRegister.id);
                    setSelectedCashRegister({ ...selectedCashRegister, ...data });
                }
                alert("Pagamento alterado com sucesso!");
            } catch (err: any) {
                alert("Erro técnico ao editar pagamento: " + err.message);
            }
        });
    };

    // Funções de Depósito
    const fetchDepositSessions = async () => {
        try {
            const data = await getSessionsForDepositAction();
            setDepositSessions(data);
        } catch (err) {
            console.error("Erro ao buscar depósitos:", err);
        }
    };

    const handleRecordDeposit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!depositAmount) return;

        startTransition(async () => {
            if (isGlobalDeposit) {
                const res = await recordGlobalCashDepositAction(
                    parseFloat(depositAmount.replace(',', '.')),
                    depositNotes
                );
                if (res.success) {
                    alert("Depósito Global registrado com sucesso!");
                    setShowDepositModal(false);
                    setDepositAmount('');
                    setDepositNotes('');
                    fetchDepositSessions();
                } else {
                    alert("Erro ao registrar depósito global: " + res.error);
                }
            } else {
                if (!selectedSessionForDep) return;
                const res = await recordCashDepositAction(
                    selectedSessionForDep.id,
                    parseFloat(depositAmount.replace(',', '.')),
                    depositNotes
                );
                if (res.success) {
                    alert("Depósito registrado com sucesso!");
                    setShowDepositModal(false);
                    setDepositAmount('');
                    setDepositNotes('');
                    fetchDepositSessions();
                } else {
                    alert("Erro ao registrar depósito: " + res.error);
                }
            }
        });
    };

    return (
        <div className="animate-in fade-in duration-500 pb-20">

            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Capitão Society - Gestão Financeira</h1>
                    <p className="text-gray-500 text-sm mt-1">Controle de entradas, saídas e obrigações futuras.</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 hide-scrollbar">
                    <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1 shrink-0">
                        <button onClick={() => setActiveTab('DASHBOARD')} className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTab === 'DASHBOARD' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                            <Activity size={14} /> Dashboard
                        </button>
                        <button onClick={() => setActiveTab('BILLING')} className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTab === 'BILLING' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                            <Calendar size={14} /> Contas Pagar/Receber
                        </button>
                        <button onClick={() => setActiveTab('DRE')} className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTab === 'DRE' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                            <TrendingUp size={14} /> DRE Gerencial
                        </button>
                        <button onClick={() => setActiveTab('CASHIER')} className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTab === 'CASHIER' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                            <Wallet size={14} /> Sessões de Caixa
                        </button>
                    </div>
                    {activeTab === 'BILLING' && (
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="bg-mrts-blue text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2 hover:scale-105 active:scale-95 transition shrink-0"
                        >
                            <Plus size={16} /> Novo Lançamento
                        </button>
                    )}
                </div>
            </div>

            {activeTab === 'DASHBOARD' && (
                <>
                    {/* TOOLBAR: FILTROS E EXPORTAÇÃO */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-wrap items-center gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Início</label>
                            <div className="relative">
                                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none w-40"
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Fim</label>
                            <div className="relative">
                                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none w-40"
                                />
                            </div>
                        </div>
                        <div className="flex items-end gap-2 h-full mt-5">
                            <button
                                onClick={handleApplyFilters}
                                disabled={isPending}
                                className="bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition disabled:opacity-50 flex items-center gap-2"
                            >
                                <Filter size={14} /> {isPending ? 'Filtrando...' : 'Aplicar Filtros'}
                            </button>
                            <button
                                onClick={handleClearFilters}
                                className="bg-gray-100 text-gray-500 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-gray-200 transition"
                            >
                                Limpar
                            </button>
                        </div>
                        <div className="flex-1 min-w-[20px]"></div>
                        <button
                            onClick={exportAllData}
                            className="mt-5 bg-slate-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-slate-900/20 flex items-center gap-2 hover:scale-105 active:scale-95 transition border border-slate-700"
                        >
                            <Sheet size={16} className="text-emerald-400" /> Exportar Relatório Completo (Excel)
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white border text-left border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                            <p className="text-[10px] font-black text-gray-400 tracking-widest mb-1 relative z-10 flex items-center gap-2 uppercase">Receita Total</p>
                            <h2 className="text-2xl font-black text-slate-800 relative z-10">R$ {Number(totalRevenue || 0).toFixed(2).replace('.', ',')}</h2>
                            <div className="absolute right-0 bottom-0 p-2 opacity-5">
                                <TrendingUp size={64} className="text-emerald-500" />
                            </div>
                        </div>
                        <div className="bg-white border text-left border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                            <p className="text-[10px] font-black text-orange-400 tracking-widest mb-1 relative z-10 flex items-center gap-2 uppercase">Pendente a Receber</p>
                            <h2 className="text-2xl font-black text-slate-800 relative z-10">R$ {Number(totalPendingReceivable || 0).toFixed(2).replace('.', ',')}</h2>
                            <div className="absolute right-0 bottom-0 p-2 opacity-5">
                                <TrendingUp size={64} className="text-orange-500" />
                            </div>
                        </div>
                        <div className="bg-white border text-left border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden group border-l-4 border-l-red-500">
                            <p className="text-[10px] font-black text-red-400 tracking-widest mb-1 relative z-10 flex items-center gap-2 uppercase">Pendente a Pagar</p>
                            <h2 className="text-2xl font-black text-slate-800 relative z-10">R$ {Number(totalPendingPayable || 0).toFixed(2).replace('.', ',')}</h2>
                            <div className="absolute right-0 bottom-0 p-2 opacity-5">
                                <TrendingDown size={64} className="text-red-500" />
                            </div>
                        </div>
                        <div className="bg-slate-900 border text-left border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group">
                            <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1 relative z-10 flex items-center gap-2 uppercase">Saldo Previsto</p>
                            <h2 className="text-2xl font-black text-white relative z-10">R$ {Number((totalRevenue || 0) + (totalPendingReceivable || 0) - (totalPendingPayable || 0)).toFixed(2).replace('.', ',')}</h2>
                            <div className="absolute right-0 bottom-0 p-2 opacity-10">
                                <DollarSign size={64} className="text-white" />
                            </div>
                        </div>
                    </div>

                    {/* CARDS: ALUGUEL DE CAMPOS (caixa do diário) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {/* CARD: QUANTIDADE DE ALUGUEL DE CAMPOS */}
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                            <div className="absolute -right-6 -top-6 w-28 h-28 bg-emerald-500/10 rounded-full blur-3xl"></div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-11 h-11 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center">
                                    <Trophy size={22} />
                                </div>
                                <span className="text-[10px] font-black text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg uppercase tracking-wider">{fieldRentalStats?.periodLabel}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-4">
                                <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg uppercase tracking-wider">FUT5: {fmtCount(fieldRentalStats?.fut5Count)}</span>
                                <span className="text-[10px] font-black text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg uppercase tracking-wider">FUT7: {fmtCount(fieldRentalStats?.fut7Count)}</span>
                                <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg uppercase tracking-wider">Total: {fmtCount(fieldRentalStats?.totalGames)}</span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Aluguéis de Campo no Período</p>
                            <h3 className="text-3xl font-black text-white tracking-tight">{fmtCount(fieldRentalStats?.totalGames)}</h3>
                            <div className="w-full h-56 mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={fieldRentalStats?.dailySeries || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                                        <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: string) => String(Number(v.slice(-2)))} />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <RTooltip
                                            formatter={(value: any, name: any) => [`${fmtCount(value)} aluguel${Number(value) === 1 ? '' : 'eis'}`, name]}
                                            labelFormatter={(label: any) => new Date(String(label) + 'T12:00:00').toLocaleDateString('pt-BR')}
                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontSize: '12px' }}
                                            cursor={{ fill: '#0f172a' }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700, fontFamily: 'monospace' }} />
                                        <Bar dataKey="fut5Count" name="FUT5" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={12} />
                                        <Bar dataKey="fut7Count" name="FUT7" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={12} />
                                        <Bar dataKey="totalCount" name="Total" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={12} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* CARD: VOLUME FINANCEIRO DE ALUGUEL DE CAMPOS */}
                        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm relative overflow-hidden">
                            <div className="absolute -right-6 -top-6 w-28 h-28 bg-blue-500/10 rounded-full blur-3xl"></div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-11 h-11 bg-blue-50 text-mrts-blue rounded-xl flex items-center justify-center">
                                    <DollarSign size={22} />
                                </div>
                                <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">{fieldRentalStats?.periodLabel}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-4">
                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">FUT5: R$ {Number(fieldRentalStats?.fut5Amount || 0).toFixed(2).replace('.', ',')}</span>
                                <span className="text-[10px] font-black text-sky-600 bg-sky-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">FUT7: R$ {Number(fieldRentalStats?.fut7Amount || 0).toFixed(2).replace('.', ',')}</span>
                                <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">Total: R$ {Number(fieldRentalStats?.totalAmount || 0).toFixed(2).replace('.', ',')}</span>
                            </div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Volume Financeiro</p>
                            <h3 className="text-3xl font-black text-slate-800 tracking-tight">R$ {Number(fieldRentalStats?.totalAmount || 0).toFixed(2).replace('.', ',')}</h3>
                            <div className="w-full h-56 mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={fieldRentalStats?.dailySeries || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: string) => String(Number(v.slice(-2)))} />
                                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(val: number) => `R$ ${val}`} />
                                        <RTooltip
                                            formatter={(value: any, name: any) => [`R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`, name]}
                                            labelFormatter={(label: any) => new Date(String(label) + 'T12:00:00').toLocaleDateString('pt-BR')}
                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontSize: '12px' }}
                                            cursor={{ fill: '#f8fafc' }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700, fontFamily: 'monospace' }} />
                                        <Bar dataKey="fut5Amount" name="FUT5" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={12} />
                                        <Bar dataKey="fut7Amount" name="FUT7" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={12} />
                                        <Bar dataKey="totalAmount" name="Total" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={12} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* EVOLUTION CHART */}
                        <div className="col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col items-start min-w-0">
                            <div className="flex justify-between items-center w-full mb-6">
                                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">Desempenho por Setor</h3>
                                <div className="flex gap-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Aluguel</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Produtos/Bar</span>
                                    </div>
                                </div>
                            </div>
                            <div className="w-full h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={dailyChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(val) => `R$ ${val}`} />
                                        <RTooltip
                                            formatter={(value: any, name: any) => [
                                                `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`,
                                                name === 'aluguel' ? 'Aluguel de Campos' : 'Bar / Produtos'
                                            ] as [string, string]}
                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="aluguel"
                                            name="aluguel"
                                            stackId="1"
                                            stroke="#10b981"
                                            strokeWidth={3}
                                            fill="#10b981"
                                            fillOpacity={0.1}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="produtos"
                                            name="produtos"
                                            stackId="1"
                                            stroke="#3b82f6"
                                            strokeWidth={3}
                                            fill="#3b82f6"
                                            fillOpacity={0.1}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* COMPOSIÇÃO DE FORMAS DE PAGAMENTO */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col min-w-0">
                            <h3 className="font-bold text-lg text-slate-800 mb-6">Métodos de Entrada</h3>
                            {methodChart.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-sm text-gray-400 font-medium">Sem dados.</div>
                            ) : (
                                <div className="w-full h-64 mb-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={methodChart} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value">
                                                {methodChart.map((e: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                            </Pie>
                                            <RTooltip formatter={(v: any) => `R$ ${Number(v || 0).toFixed(2)}`} />
                                            <Legend iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'BILLING' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap justify-between items-center gap-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex gap-2">
                            <button onClick={() => setFilterType('ALL')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${filterType === 'ALL' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Todos</button>
                            <button onClick={() => setFilterType('PAYABLE')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${filterType === 'PAYABLE' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Contas a Pagar</button>
                            <button onClick={() => setFilterType('RECEIVABLE')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${filterType === 'RECEIVABLE' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Contas a Receber</button>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="date"
                                    value={billFrom}
                                    onChange={(e) => setBillFrom(e.target.value)}
                                    title="Vencimento de"
                                    className="bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none w-40"
                                />
                            </div>
                            <span className="text-[10px] font-black text-gray-400 uppercase">até</span>
                            <div className="relative">
                                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="date"
                                    value={billTo}
                                    onChange={(e) => setBillTo(e.target.value)}
                                    title="Vencimento até"
                                    className="bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none w-40"
                                />
                            </div>
                            {(billFrom || billTo) && (
                                <button
                                    onClick={() => { setBillFrom(''); setBillTo(''); }}
                                    className="text-[10px] font-bold text-red-500 hover:text-red-600 px-2 py-2 rounded-lg hover:bg-red-50 transition"
                                    title="Limpar datas"
                                >
                                    Limpar datas
                                </button>
                            )}
                        </div>
                        <div className="flex flex-1 min-w-[200px] max-w-sm items-center gap-2">
                            <div className="relative flex-1">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar lançamento (descrição, categoria, ref., método...)"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="text-gray-400 text-xs font-medium flex items-center gap-2">
                            <Filter size={14} /> {searchedEntries.length} lançamentos encontrados
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse whitespace-nowrap">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-gray-100 text-[10px] uppercase text-gray-400 font-black tracking-widest">
                                        <th className="p-4">Descrição / Categoria</th>
                                        <th className="p-4">Vencimento</th>
                                        <th className="p-4">Valor</th>
                                        <th className="p-4">Pagamento / Ref.</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4 px-6 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {searchedEntries.map((e: any) => (
                                        <tr key={e.id} className="hover:bg-slate-50/50 transition">
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-800 text-sm">{e.description}</span>
                                                    <span className="text-[10px] text-gray-400 font-bold uppercase">{e.category} {e.installmentNum ? `| Parc. ${e.installmentNum}/${e.installmentTotal}` : ''}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-2 text-sm font-black text-slate-700">
                                                        <Calendar size={14} className="text-gray-400" />
                                                        {new Date(e.dueDate).toLocaleDateString('pt-BR')}
                                                        {e.status === 'PENDING' && new Date(e.dueDate) < new Date() && (
                                                            <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black italic animate-pulse">ATRASADO</span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-gray-400 font-medium pl-5">Lançamento: {new Date(e.createdAt).toLocaleDateString('pt-BR')}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`text-sm font-black ${e.type === 'PAYABLE' ? 'text-red-500' : 'text-emerald-500'}`}>
                                                    {e.type === 'PAYABLE' ? '-' : '+'} R$ {Number(e.amount || 0).toFixed(2).replace('.', ',')}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-600 uppercase">{e.method || '-'}</span>
                                                    <span className="text-[10px] text-gray-400 font-medium">Ref: {e.reference || '-'}</span>
                                                    {e.status === 'PAID' && e.paymentDate && (
                                                        <span className="text-[10px] text-emerald-600 font-bold mt-0.5">Pago em: {new Date(e.paymentDate).toLocaleDateString('pt-BR')}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                {e.status === 'PAID' ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                                        <CheckCircle size={12} /> Pago
                                                    </span>
                                                ) : e.status === 'CANCELED' ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                                                        Cancelado
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-orange-500 bg-orange-50 px-2 py-1 rounded-lg">
                                                        <AlertCircle size={12} /> Pendente
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 px-6 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => setViewingEntry(e)}
                                                        className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg transition" title="Ver detalhes do lançamento"
                                                    >
                                                        <Eye size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingEntry({
                                                            id: e.id,
                                                            description: e.description,
                                                            type: e.type,
                                                            amount: String(e.amount),
                                                            dueDate: new Date(e.dueDate).toLocaleDateString('sv-SE'),
                                                            category: e.category,
                                                            notes: e.notes || '',
                                                            method: e.method || 'PIX',
                                                            reference: e.reference || ''
                                                        })}
                                                        className="p-2 bg-slate-50 text-slate-500 hover:bg-slate-700 hover:text-white rounded-lg transition" title="Editar lançamento"
                                                    >
                                                        <Edit2 size={18} />
                                                    </button>
                                                    {e.status === 'PENDING' && (
                                                        <button
                                                            onClick={() => handleUpdateStatus(e.id, 'PAID')}
                                                            disabled={isPending}
                                                            className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg transition" title="Marcar como Pago"
                                                        >
                                                            <CheckCircle size={18} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDelete(e.id)}
                                                        disabled={isPending}
                                                        className="p-2 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition" title="Excluir"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {searchedEntries.length === 0 && (
                                        <tr><td colSpan={6} className="p-10 text-center text-gray-400 text-sm font-medium">Nenhum lançamento encontrado para os filtros selecionados.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'DRE' && (() => {
                const months = dreMonths || [];
                const selected = dreMonth || (months.length > 0 ? months[months.length - 1].key : '');
                const monthData = months.find((m: any) => m.key === selected);

                // Categorias de despesas do mês selecionado
                const expenseCats = monthData ? Object.entries(monthData.despesas || {}) : [];

                // Total de despesas operacionais + financeiras + impostos
                const totalExpenses = monthData ? (monthData.totalDespesasOp + monthData.despesasFinanceiras + monthData.impostos) : 0;

                return (
                    <div className="space-y-6">
                        {/* TOOLBAR */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Calendar size={16} className="text-gray-400" />
                                <select
                                    value={selected}
                                    onChange={(e) => setDreMonth(e.target.value)}
                                    className="bg-gray-50 border border-gray-200 rounded-xl pl-3 pr-8 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                                >
                                    {months.map((m: any) => {
                                        const [mm, yyyy] = m.key.split('/');
                                        const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                                        return <option key={m.key} value={m.key}>{monthNames[parseInt(mm)-1]}/{yyyy}</option>;
                                    })}
                                </select>
                            </div>
                            <div className="text-xs text-gray-400 font-medium">
                                Regime de caixa — receitas recebidas e despesas pagas no período.
                            </div>
                            <div className="flex-1"></div>
                            {monthData && (
                                <button
                                    onClick={() => {
                                        const sheet = [
                                            {
                                                sheetName: 'DRE Gerencial',
                                                data: [
                                                    { 'Conta': 'Receita de Vendas (PDV/Comandas)', 'Valor': monthData.receitasVendas, 'Percentual': '' },
                                                    { 'Conta': 'Outras Receitas', 'Valor': monthData.receitasOutras, 'Percentual': '' },
                                                    { 'Conta': 'Receita Bruta Total', 'Valor': monthData.totalReceitas, 'Percentual': '100%' },
                                                    { 'Conta': '(-) CMV (Custo das Mercadorias Vendidas)', 'Valor': -monthData.cmv, 'Percentual': `${monthData.totalReceitas > 0 ? ((monthData.cmv / monthData.totalReceitas) * 100).toFixed(1) : 0}%` },
                                                    { 'Conta': 'Lucro Bruto', 'Valor': monthData.lucroBruto, 'Percentual': `${monthData.margemBruta}%` },
                                                    ...expenseCats.map(([k, v]: any) => ({ 'Conta': `(-) ${k}`, 'Valor': -v, 'Percentual': `${monthData.totalReceitas > 0 ? ((v / monthData.totalReceitas) * 100).toFixed(1) : 0}%` })),
                                                    { 'Conta': '(-) Despesas Financeiras', 'Valor': -monthData.despesasFinanceiras, 'Percentual': '' },
                                                    { 'Conta': '(-) Impostos', 'Valor': -monthData.impostos, 'Percentual': '' },
                                                    { 'Conta': 'EBITDA', 'Valor': monthData.ebitda, 'Percentual': `${monthData.margemEbitda}%` },
                                                    { 'Conta': 'Resultado Líquido', 'Valor': monthData.resultadoLiquido, 'Percentual': `${monthData.margemLiquida}%` }
                                                ]
                                            }
                                        ];
                                        downloadMultiSheetExcel(sheet, `DRE_Gerencial_${selected.replace('/','_')}`);
                                    }}
                                    className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-slate-900/20 flex items-center gap-2 hover:scale-105 active:scale-95 transition"
                                >
                                    <Sheet size={16} className="text-emerald-400" /> Exportar Excel
                                </button>
                            )}
                            {monthData && (
                                <button
                                    onClick={() => {
                                        downloadDrePdf(dreMonths, dreDetails, selected);
                                    }}
                                    className="bg-white border-2 border-slate-800 text-slate-800 px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-slate-900/10 flex items-center gap-2 hover:scale-105 active:scale-95 transition"
                                >
                                    <FileDown size={16} className="text-red-500" /> Exportar PDF
                                </button>
                            )}
                        </div>

                        {/* CARDS RESUMO */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden">
                                <p className="text-[10px] font-black text-gray-400 tracking-widest mb-1 uppercase flex items-center gap-2"><TrendingUp size={14} className="text-emerald-500" /> Receita Bruta</p>
                                <h2 className="text-2xl font-black text-slate-800">R$ {Number(monthData?.totalReceitas || 0).toFixed(2).replace('.', ',')}</h2>
                                <div className="absolute right-0 bottom-0 p-2 opacity-5"><TrendingUp size={64} className="text-emerald-500" /></div>
                            </div>
                            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden">
                                <p className="text-[10px] font-black text-gray-400 tracking-widest mb-1 uppercase flex items-center gap-2"><Activity size={14} className="text-blue-500" /> Lucro Bruto</p>
                                <h2 className="text-2xl font-black text-slate-800">R$ {Number(monthData?.lucroBruto || 0).toFixed(2).replace('.', ',')}</h2>
                                <p className="text-[10px] font-bold text-gray-400 mt-1">{monthData?.margemBruta || 0}% de margem</p>
                            </div>
                            <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden">
                                <p className="text-[10px] font-black text-gray-400 tracking-widest mb-1 uppercase flex items-center gap-2"><Landmark size={14} className="text-indigo-500" /> EBITDA</p>
                                <h2 className={`text-2xl font-black ${(monthData?.ebitda || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>R$ {Number(monthData?.ebitda || 0).toFixed(2).replace('.', ',')}</h2>
                                <p className="text-[10px] font-bold text-gray-400 mt-1">{monthData?.margemEbitda || 0}% de margem</p>
                            </div>
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                                <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1 uppercase flex items-center gap-2"><DollarSign size={14} className="text-white" /> Resultado Líquido</p>
                                <h2 className={`text-2xl font-black ${(monthData?.resultadoLiquido || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>R$ {Number(monthData?.resultadoLiquido || 0).toFixed(2).replace('.', ',')}</h2>
                                <p className="text-[10px] font-bold text-slate-400 mt-1">{monthData?.margemLiquida || 0}% de margem</p>
                            </div>
                        </div>

                        {/* DEMONSTRATIVO DRE */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="p-5 bg-slate-50 border-b border-gray-100 flex justify-between items-center">
                                    <div>
                                        <h3 className="font-black text-slate-800 text-sm">Demonstrativo de Resultados (DRE)</h3>
                                        <p className="text-[11px] text-gray-400 font-medium mt-0.5">{selected}</p>
                                    </div>
                                </div>

                                {!monthData || monthData.totalReceitas === 0 && totalExpenses === 0 ? (
                                    <div className="p-12 text-center text-gray-400 font-medium">Sem movimentação financeira neste mês.</div>
                                ) : (
                                    <div className="divide-y divide-gray-50">
                                        {/* RECEITAS */}
                                        <div className="bg-emerald-50/40 px-6 py-2">
                                            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">1. Receitas</span>
                                        </div>
                                        <div className="px-6 py-3 flex justify-between items-center">
                                            <span className="text-sm font-medium text-slate-600 pl-4">Vendas (PDV / Comandas)</span>
                                            <span className="text-sm font-bold text-emerald-600">R$ {Number(monthData.receitasVendas).toFixed(2).replace('.', ',')}</span>
                                        </div>
                                        <div className="px-6 py-3 flex justify-between items-center">
                                            <span className="text-sm font-medium text-slate-600 pl-4">Outras Receitas (contas a receber pagas)</span>
                                            <span className="text-sm font-bold text-emerald-600">R$ {Number(monthData.receitasOutras).toFixed(2).replace('.', ',')}</span>
                                        </div>
                                        <div className="px-6 py-3 flex justify-between items-center bg-emerald-50/40">
                                            <span className="text-sm font-black text-slate-800">Receita Bruta Total</span>
                                            <span className="text-base font-black text-emerald-600">R$ {Number(monthData.totalReceitas).toFixed(2).replace('.', ',')}</span>
                                        </div>

                                        {/* CMV */}
                                        <div className="px-6 py-3 flex justify-between items-center">
                                            <span className="text-sm font-medium text-slate-600 pl-4">(-) CMV — Custo das Mercadorias Vendidas</span>
                                            <span className="text-sm font-bold text-red-500">- R$ {Number(monthData.cmv).toFixed(2).replace('.', ',')}</span>
                                        </div>
                                        <div className="px-6 py-3 flex justify-between items-center bg-slate-50">
                                            <span className="text-sm font-black text-slate-800">= Lucro Bruto</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-black text-gray-400">{monthData.margemBruta}%</span>
                                                <span className="text-base font-black text-blue-600">R$ {Number(monthData.lucroBruto).toFixed(2).replace('.', ',')}</span>
                                            </div>
                                        </div>

                                        {/* DESPESAS */}
                                        <div className="bg-red-50/40 px-6 py-2">
                                            <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">2. Despesas Operacionais</span>
                                        </div>
                                        {expenseCats.length === 0 ? (
                                            <div className="px-6 py-3 text-sm text-gray-400 pl-8">Nenhuma despesa operacional lançada neste mês.</div>
                                        ) : expenseCats.map(([cat, val]: any) => (
                                            <div key={cat} className="px-6 py-3 flex justify-between items-center">
                                                <span className="text-sm font-medium text-slate-600 pl-4">{cat}</span>
                                                <span className="text-sm font-bold text-red-500">- R$ {Number(val).toFixed(2).replace('.', ',')}</span>
                                            </div>
                                        ))}
                                        {monthData.despesasFinanceiras > 0 && (
                                            <div className="px-6 py-3 flex justify-between items-center">
                                                <span className="text-sm font-medium text-slate-600 pl-4">Despesas Financeiras (juros/tarifas)</span>
                                                <span className="text-sm font-bold text-red-500">- R$ {Number(monthData.despesasFinanceiras).toFixed(2).replace('.', ',')}</span>
                                            </div>
                                        )}
                                        {monthData.impostos > 0 && (
                                            <div className="px-6 py-3 flex justify-between items-center">
                                                <span className="text-sm font-medium text-slate-600 pl-4">Impostos e Taxas</span>
                                                <span className="text-sm font-bold text-red-500">- R$ {Number(monthData.impostos).toFixed(2).replace('.', ',')}</span>
                                            </div>
                                        )}
                                        <div className="px-6 py-3 flex justify-between items-center bg-slate-50">
                                            <span className="text-sm font-black text-slate-800">Total de Despesas</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-black text-gray-400">{monthData.totalReceitas > 0 ? ((totalExpenses / monthData.totalReceitas) * 100).toFixed(1) : 0}%</span>
                                                <span className="text-base font-black text-red-500">- R$ {Number(totalExpenses).toFixed(2).replace('.', ',')}</span>
                                            </div>
                                        </div>

                                        {/* EBITDA */}
                                        <div className="px-6 py-3 flex justify-between items-center bg-indigo-50/50">
                                            <span className="text-sm font-black text-indigo-700">= EBITDA (Resultado Operacional)</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-black text-indigo-400">{monthData.margemEbitda}%</span>
                                                <span className={`text-base font-black ${monthData.ebitda >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>R$ {Number(monthData.ebitda).toFixed(2).replace('.', ',')}</span>
                                            </div>
                                        </div>

                                        {/* RESULTADO LÍQUIDO */}
                                        <div className="px-6 py-4 flex justify-between items-center bg-slate-900">
                                            <span className="text-sm font-black text-white">= Resultado Líquido do Período</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-black text-slate-400">{monthData.margemLiquida}%</span>
                                                <span className={`text-lg font-black ${monthData.resultadoLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>R$ {Number(monthData.resultadoLiquido).toFixed(2).replace('.', ',')}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* COMPARATIVO MENSAL */}
                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col min-w-0">
                                <h3 className="font-bold text-sm text-slate-800 mb-6">Evolução Mensal</h3>
                                {months.length === 0 ? (
                                    <div className="flex items-center justify-center h-full text-sm text-gray-400 font-medium">Sem dados.</div>
                                ) : (
                                    <div className="w-full h-72">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={months.map((m: any) => ({
                                                name: m.key,
                                                'Receitas': m.totalReceitas,
                                                'Resultado': m.resultadoLiquido
                                            }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(val) => `R$ ${val}`} />
                                                <RTooltip
                                                    formatter={(value: any, name: any) => [`R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`, name]}
                                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                                                    cursor={{ fill: '#f8fafc' }}
                                                />
                                                <Bar dataKey="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={24} />
                                                <Bar dataKey="Resultado" fill="#1e293b" radius={[4, 4, 0, 0]} maxBarSize={24} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                                <p className="text-[10px] text-gray-400 font-medium mt-4 text-center">Comparativo de receitas e resultado líquido por mês no período filtrado.</p>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {activeTab === 'CASHIER' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 bg-slate-50 border-b border-gray-100">
                        <h3 className="font-bold text-slate-800 text-sm">Histórico e Auditoria de Caixas Registradoras</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse whitespace-nowrap">
                            <thead>
                                <tr className="bg-white border-b border-gray-100 text-[10px] uppercase text-gray-400 font-black tracking-wider text-center">
                                    <th className="p-4 text-left">Operador / Turno</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-emerald-600 bg-emerald-50/30">Dinheiro</th>
                                    <th className="p-4 text-blue-600 bg-blue-50/30">PIX</th>
                                    <th className="p-4 text-orange-600 bg-orange-50/30">Débito</th>
                                    <th className="p-4 text-indigo-600 bg-indigo-50/30">Crédito</th>
                                    <th className="p-4 border-l border-gray-100">Fundo Troco</th>
                                    <th className="p-4 border-r border-gray-100">Saldo Final</th>
                                    <th className="p-4 bg-red-50/20">Audit. Vendas</th>
                                    <th className="p-4 bg-emerald-50/20">Audit. Física</th>
                                    <th className="p-4 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {cashRegisters.map((cash: any) => {
                                    // Cálculo detalhado por método para auditoria física
                                    const byMethod = (cash.payments || []).reduce((acc: any, p: any) => {
                                        acc[p.method] = (acc[p.method] || 0) + p.amount;
                                        return acc;
                                    }, { CASH: 0, PIX: 0, DEBIT: 0, CREDIT: 0 });

                                    // --- AUDITORIA DE VENDAS (Audit 1) ---
                                    // Somatório ÚNICO de itens e descontos das ordens liquidadas nesta sessão
                                    const uniqueOrdersMap = new Map();
                                    (cash.payments || []).forEach((p: any) => {
                                        if (p.order && !uniqueOrdersMap.has(p.order.id)) {
                                            uniqueOrdersMap.set(p.order.id, p.order);
                                        }
                                    });
                                    const uniqueOrders = Array.from(uniqueOrdersMap.values());

                                    const totalGrossSold = uniqueOrders.reduce((acc, order) => {
                                        const itemsSum = order.items?.reduce((sum: number, it: any) => sum + it.subtotal, 0) || 0;
                                        return acc + itemsSum;
                                    }, 0);
                                    const totalDiscounts = uniqueOrders.reduce((acc, order) => acc + (order.discount || 0), 0);
                                    const totalPaymentsReceived = (cash.payments || []).reduce((acc: number, p: any) => acc + p.amount, 0);

                                    // Diferença de Vendas: (O que deveria ter pago) - (O que foi pago)
                                    // Deve ser zero se tudo que foi vendido foi pago (considerando descontos)
                                    const auditVendas = (totalGrossSold - totalDiscounts) - totalPaymentsReceived;

                                    // --- AUDITORIA FÍSICA (Audit 2) ---
                                    // Diferença de Gaveta: (Declarado) - (Esperado em espécie)
                                    const expectedCash = cash.openingBal + (byMethod.CASH || 0);
                                    const auditFisico = cash.closingBal !== null ? cash.closingBal - expectedCash : 0;

                                    return (
                                        <tr key={cash.id} className="hover:bg-blue-50/20 transition text-center group">
                                            <td className="p-4 text-left">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center shrink-0 group-hover:bg-mrts-blue group-hover:text-white transition-colors">
                                                        {cash.user?.name?.charAt(0) || <Users size={14} />}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-800 text-sm leading-tight">{cash.user?.name}</p>
                                                        <p className="text-[10px] text-gray-400 font-medium">Início: {new Date(cash.openedAt).toLocaleDateString('pt-BR')} {new Date(cash.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                {cash.status === 'OPEN' ? (
                                                    <span className="inline-flex items-center gap-1.5 text-[9px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-black tracking-wide uppercase">
                                                        <Unlock size={10} /> Aberto
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 text-[9px] bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-bold tracking-wide uppercase">
                                                        <Lock size={10} /> Fechado
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 font-bold text-slate-700 text-sm bg-emerald-50/10">R$ {Number(byMethod.CASH || 0).toFixed(2).replace('.', ',')}</td>
                                            <td className="p-4 font-bold text-slate-700 text-sm bg-blue-50/10">R$ {Number(byMethod.PIX || 0).toFixed(2).replace('.', ',')}</td>
                                            <td className="p-4 font-bold text-slate-700 text-sm bg-orange-50/10">R$ {Number(byMethod.DEBIT || 0).toFixed(2).replace('.', ',')}</td>
                                            <td className="p-4 font-bold text-slate-700 text-sm bg-indigo-50/10">R$ {Number(byMethod.CREDIT || 0).toFixed(2).replace('.', ',')}</td>

                                            <td className="p-4 font-medium text-slate-500 text-sm border-l border-gray-100">R$ {Number(cash.openingBal || 0).toFixed(2).replace('.', ',')}</td>
                                            <td className="p-4 font-black text-slate-800 text-sm border-r border-gray-100">{cash.closingBal !== null ? `R$ ${Number(cash.closingBal || 0).toFixed(2).replace('.', ',')}` : '-'}</td>

                                            <td className="p-4">
                                                {cash.status === 'CLOSED' ? (
                                                    <span
                                                        className={`text-[10px] px-2 py-0.5 rounded font-black border ${Math.abs(auditVendas) < 0.01 ? 'bg-gray-50 text-gray-400 border-gray-100' : 'bg-red-50 text-red-500 border-red-100'}`}
                                                        title={`Gross: ${Number(totalGrossSold || 0).toFixed(2)} | Disc: ${Number(totalDiscounts || 0).toFixed(2)} | Paid: ${Number(totalPaymentsReceived || 0).toFixed(2)}`}
                                                    >
                                                        {Math.abs(auditVendas) < 0.01 ? 'INTEGRO' : `R$ ${Number(auditVendas || 0).toFixed(2)}`}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300 text-[10px] italic">Em curso</span>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                {cash.status === 'CLOSED' ? (
                                                    Math.abs(auditFisico) < 0.01 ? (
                                                        <span className="text-[10px] px-2 py-0.5 rounded font-black border bg-emerald-50 text-emerald-600 border-emerald-100">
                                                            CONFERIDO
                                                        </span>
                                                    ) : auditFisico < 0 ? (
                                                        <span className="text-[10px] px-2 py-0.5 rounded font-black border bg-red-50 text-red-600 border-red-100">
                                                            R$ {Number(auditFisico || 0).toFixed(2).replace('.', ',')} (FALTA)
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] px-2 py-0.5 rounded font-black border bg-blue-50 text-blue-600 border-blue-100">
                                                            + R$ {Number(auditFisico || 0).toFixed(2).replace('.', ',')} (SOBRA)
                                                        </span>
                                                    )
                                                ) : (
                                                    <span className="text-gray-300 text-[10px] italic">-</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={() => handleViewDetails(cash)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-lg transition" title="Ver Detalhes do Turno">
                                                        <Eye size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSession(cash.id)}
                                                        className="bg-red-50 hover:bg-red-500 text-red-500 hover:text-white p-2 rounded-lg transition"
                                                        title="Excluir Histórico de Sessão (Admin Only)"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                        <button onClick={exportAllData} className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold shadow-sm hover:bg-emerald-100 transition text-sm">
                            <Sheet size={16} /> Exportar Excel
                        </button>
                    </div>
                </div>
            )}


            {/* MODAL NOVO LANÇAMENTO */}
            {showAddModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl animate-in zoom-in-95 overflow-hidden border border-gray-100">
                        <form onSubmit={handleCreateEntry}>
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><DollarSign className="text-mrts-blue" /> Registro de Movimentação</h2>
                                <button type="button" onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 bg-white p-2 rounded-full shadow-sm">
                                    <XCircle size={20} />
                                </button>
                            </div>

                            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Tipo de Registro</label>
                                        <select
                                            value={newEntry.type}
                                            onChange={(e) => setNewEntry({ ...newEntry, type: e.target.value as any })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                        >
                                            <option value="PAYABLE">Conta a Pagar (Saída)</option>
                                            <option value="RECEIVABLE">Conta a Receber (Entrada)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Categoria</label>
                                        <select
                                            value={newEntry.category}
                                            onChange={(e) => setNewEntry({ ...newEntry, category: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                        >
                                            <option value="Diversos">Diversos</option>
                                            <option value="Fornecedor">Fornecedor</option>
                                            <option value="Aluguel">Aluguel</option>
                                            <option value="Energia">Energia / Água</option>
                                            <option value="Internet">Internet / Software</option>
                                            <option value="Salário">Salário / Comissões</option>
                                            <option value="Marketing">Marketing / Tráfego</option>
                                            <option value="Manutenção">Manutenção</option>
                                            <option value="Impostos">Impostos / Taxas</option>
                                            <option value="Equipamentos">Equipamentos / Móveis</option>
                                            <option value="Limpeza">Limpeza / Higiene</option>
                                            <option value="Pró-labore">Pró-labore</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Descrição Curta</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Compra de Bebidas Distribuidora X"
                                        value={newEntry.description}
                                        onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Valor Total (R$)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder="0,00"
                                            value={newEntry.amount}
                                            onChange={(e) => setNewEntry({ ...newEntry, amount: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-black text-slate-900 transition text-lg"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Mês de Referência (Competência)</label>
                                        <input
                                            type="text"
                                            placeholder="MM/AAAA"
                                            value={newEntry.reference}
                                            onChange={(e) => setNewEntry({ ...newEntry, reference: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Forma de Pagamento</label>
                                        <select
                                            value={newEntry.method}
                                            onChange={(e) => setNewEntry({ ...newEntry, method: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                        >
                                            <option value="PIX">Pix</option>
                                            <option value="DINHEIRO">Dinheiro</option>
                                            <option value="BOLETO">Boleto</option>
                                            <option value="CARTÃO">Cartão (Crédito/Débito)</option>
                                            <option value="TRANSFERÊNCIA">Transferência / TED</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Número de Parcelas</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="48"
                                            value={newEntry.installments}
                                            onChange={(e) => setNewEntry({ ...newEntry, installments: parseInt(e.target.value) || 1 })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Vencimento (1ª Parcela)</label>
                                        <input
                                            type="date"
                                            value={newEntry.dueDate}
                                            onChange={(e) => setNewEntry({ ...newEntry, dueDate: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Observações (Opcional)</label>
                                    <textarea
                                        value={newEntry.notes}
                                        onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 outline-none focus:border-mrts-blue font-medium text-slate-600 transition h-20 resize-none"
                                    />
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50 border-t border-gray-100 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 bg-white text-gray-500 font-bold py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="flex-[2] bg-slate-900 text-white font-black py-3 rounded-xl hover:bg-slate-800 shadow-xl shadow-slate-900/20 active:scale-95 transition flex items-center justify-center gap-2"
                                >
                                    {isPending ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : (newEntry.installments > 1 ? `Gerar ${newEntry.installments} Parcelas` : 'Confirmar Lançamento')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingEntry && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl animate-in zoom-in-95 overflow-hidden border border-gray-100">
                        <form onSubmit={handleUpdateEntry}>
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><Edit2 className="text-mrts-blue" /> Editar Lançamento</h2>
                                <button type="button" onClick={() => setEditingEntry(null)} className="text-gray-400 hover:text-gray-600 bg-white p-2 rounded-full shadow-sm">
                                    <XCircle size={20} />
                                </button>
                            </div>

                            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Tipo de Registro</label>
                                        <select
                                            value={editingEntry.type}
                                            onChange={(e) => setEditingEntry({ ...editingEntry, type: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                        >
                                            <option value="PAYABLE">Conta a Pagar (Saída)</option>
                                            <option value="RECEIVABLE">Conta a Receber (Entrada)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Categoria</label>
                                        <input
                                            type="text"
                                            list="entryCategories"
                                            value={editingEntry.category}
                                            onChange={(e) => setEditingEntry({ ...editingEntry, category: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                        />
                                        <datalist id="entryCategories">
                                            <option value="Diversos" />
                                            <option value="Fornecedor" />
                                            <option value="Aluguel" />
                                            <option value="Energia / Água" />
                                            <option value="Internet / Software" />
                                            <option value="Salário / Comissões" />
                                            <option value="Marketing / Tráfego" />
                                            <option value="Manutenção" />
                                            <option value="Impostos / Taxas" />
                                            <option value="Equipamentos / Móveis" />
                                            <option value="Limpeza / Higiene" />
                                            <option value="Pró-labore" />
                                        </datalist>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Descrição Curta</label>
                                    <input
                                        type="text"
                                        value={editingEntry.description}
                                        onChange={(e) => setEditingEntry({ ...editingEntry, description: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Valor (R$)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={editingEntry.amount}
                                            onChange={(e) => setEditingEntry({ ...editingEntry, amount: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-black text-slate-900 transition text-lg"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Vencimento</label>
                                        <input
                                            type="date"
                                            value={editingEntry.dueDate}
                                            onChange={(e) => setEditingEntry({ ...editingEntry, dueDate: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Forma de Pagamento</label>
                                        <select
                                            value={editingEntry.method}
                                            onChange={(e) => setEditingEntry({ ...editingEntry, method: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                        >
                                            <option value="PIX">Pix</option>
                                            <option value="DINHEIRO">Dinheiro</option>
                                            <option value="BOLETO">Boleto</option>
                                            <option value="CARTÃO">Cartão (Crédito/Débito)</option>
                                            <option value="TRANSFERÊNCIA">Transferência / TED</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Mês de Referência (Competência)</label>
                                        <input
                                            type="text"
                                            placeholder="MM/AAAA"
                                            value={editingEntry.reference}
                                            onChange={(e) => setEditingEntry({ ...editingEntry, reference: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Observações (Opcional)</label>
                                    <textarea
                                        value={editingEntry.notes}
                                        onChange={(e) => setEditingEntry({ ...editingEntry, notes: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 outline-none focus:border-mrts-blue font-medium text-slate-600 transition h-20 resize-none"
                                    />
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50 border-t border-gray-100 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setEditingEntry(null)}
                                    className="flex-1 bg-white text-gray-500 font-bold py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="flex-[2] bg-slate-900 text-white font-black py-3 rounded-xl hover:bg-slate-800 shadow-xl shadow-slate-900/20 active:scale-95 transition flex items-center justify-center gap-2"
                                >
                                    {isPending ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Salvar Alterações'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL DETALHES DO LANÇAMENTO (CONTA A PAGAR/RECEBER) */}
            {viewingEntry && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 overflow-hidden border border-gray-100 max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-slate-900 text-white">
                            <h2 className="text-base sm:text-lg font-black flex items-center gap-2">
                                <Eye size={20} className="text-mrts-blue" /> Detalhes do Lançamento
                            </h2>
                            <button onClick={() => setViewingEntry(null)} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition">
                                <XCircle size={20} />
                            </button>
                        </div>

                        <div className="p-5 space-y-3 overflow-y-auto bg-slate-50">
                            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Descrição</p>
                                <p className="font-bold text-slate-800">{viewingEntry.description}</p>
                                <p className="text-[11px] text-gray-500 mt-1">
                                    <span className="font-black uppercase">{viewingEntry.category}</span>
                                    {viewingEntry.installmentNum ? ` | Parcela ${viewingEntry.installmentNum}/${viewingEntry.installmentTotal}` : ''}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tipo</p>
                                    <p className={`text-sm font-black ${viewingEntry.type === 'PAYABLE' ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {viewingEntry.type === 'PAYABLE' ? 'Conta a Pagar (Saída)' : 'Conta a Receber (Entrada)'}
                                    </p>
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Valor</p>
                                    <p className={`text-xl font-black ${viewingEntry.type === 'PAYABLE' ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {viewingEntry.type === 'PAYABLE' ? '-' : '+'} R$ {Number(viewingEntry.amount || 0).toFixed(2).replace('.', ',')}
                                    </p>
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Vencimento</p>
                                    <p className="text-sm font-bold text-slate-700">{new Date(viewingEntry.dueDate).toLocaleDateString('pt-BR')}</p>
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                                    {viewingEntry.status === 'PAID' ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg"><CheckCircle size={12} /> Pago</span>
                                    ) : viewingEntry.status === 'CANCELED' ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">Cancelado</span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-orange-500 bg-orange-50 px-2 py-1 rounded-lg"><AlertCircle size={12} /> Pendente</span>
                                    )}
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Forma de Pagamento</p>
                                    <p className="text-sm font-bold text-slate-700 uppercase">{viewingEntry.method || '-'}</p>
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Mês de Referência</p>
                                    <p className="text-sm font-bold text-slate-700">{viewingEntry.reference || '-'}</p>
                                </div>
                                {viewingEntry.paymentDate && (
                                    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pago em</p>
                                        <p className="text-sm font-bold text-emerald-600">{new Date(viewingEntry.paymentDate).toLocaleDateString('pt-BR')}</p>
                                    </div>
                                )}
                                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Lançado em</p>
                                    <p className="text-sm font-bold text-slate-700">{new Date(viewingEntry.createdAt).toLocaleString('pt-BR')}</p>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Observações</p>
                                {viewingEntry.notes ? (
                                    <p className="text-sm font-medium text-slate-700 italic whitespace-pre-wrap leading-relaxed">&quot;{viewingEntry.notes}&quot;</p>
                                ) : (
                                    <p className="text-sm text-gray-400 italic">Nenhuma observação registrada.</p>
                                )}
                            </div>

                            {viewingEntry.updatedAt && new Date(viewingEntry.updatedAt).getTime() !== new Date(viewingEntry.createdAt).getTime() && (
                                <p className="text-[10px] text-gray-400 font-medium text-center">Última atualização: {new Date(viewingEntry.updatedAt).toLocaleString('pt-BR')}</p>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-slate-50 flex gap-3">
                            <button onClick={() => setViewingEntry(null)} className="flex-1 bg-white text-gray-500 font-bold py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition text-sm">
                                Fechar
                            </button>
                            <button
                                onClick={() => { setEditingEntry({ id: viewingEntry.id, description: viewingEntry.description, type: viewingEntry.type, amount: String(viewingEntry.amount), dueDate: new Date(viewingEntry.dueDate).toLocaleDateString('sv-SE'), category: viewingEntry.category, notes: viewingEntry.notes || '', method: viewingEntry.method || 'PIX', reference: viewingEntry.reference || '' }); setViewingEntry(null); }}
                                className="flex-[2] bg-slate-900 text-white font-black py-2.5 rounded-xl hover:bg-slate-800 shadow-xl shadow-slate-900/20 transition text-sm flex items-center justify-center gap-2"
                            >
                                <Edit2 size={16} /> Editar Lançamento
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DETALHES DA SESSÃO DO CAIXA */}
            {isDetailsModalOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl animate-in zoom-in flex flex-col overflow-hidden border border-gray-100 max-h-[90vh]">
                        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-slate-900 text-white">
                            <h2 className="text-xl font-black flex items-center gap-2">
                                <Wallet size={22} className="text-mrts-blue" /> Auditoria Detalhada de Sessão (Caixa)
                            </h2>
                            <button onClick={() => { setIsDetailsModalOpen(false); setSelectedCashRegister(null); }} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition">
                                <XCircle size={20} />
                            </button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto bg-slate-50">
                            {loadingDetails ? (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                    <div className="w-10 h-10 border-4 border-gray-200 border-t-mrts-blue rounded-full animate-spin mb-4"></div>
                                    <p className="font-bold">Buscando espelho completo de vendas...</p>
                                </div>
                            ) : selectedCashRegister ? (
                                <div className="space-y-6">
                                    <div className="bg-white border text-center border-gray-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-blue-500 to-green-500 left-0"></div>
                                        <h3 className="text-lg font-bold text-slate-800 mb-1">Apuração Bruta de Receitas Deste Turno</h3>
                                        <p className="text-4xl font-black text-slate-900">R$ {Number(selectedCashRegister.sumAllPayments || 0).toFixed(2).replace('.', ',')}</p>
                                    </div>

                                    {selectedCashRegister.closingNotes && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
                                            <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <AlertCircle size={14} /> Observações de Fechamento
                                            </h4>
                                            <p className="text-sm font-medium text-amber-900 italic">&quot;{selectedCashRegister.closingNotes}&quot;</p>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Tabela Resumo Pagamentos */}
                                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                                            <h4 className="text-sm uppercase tracking-wider font-bold text-gray-500 mb-6 flex items-center gap-2"><CreditCard size={18} /> Dinheiro, Cartões e Transações</h4>
                                            <div className="space-y-4">
                                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                                    <p className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Fundo de Troco Operacional (Entrada)</p>
                                                    <p className="text-xl font-black text-slate-800">R$ {Number(selectedCashRegister.openingBal || 0).toFixed(2).replace('.', ',')}</p>
                                                </div>

                                                <div className="space-y-3">
                                                    <p className="text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider px-1">Histórico de Pagamentos por Venda</p>
                                                    {selectedCashRegister.salesHistory && selectedCashRegister.salesHistory.length > 0 ? (
                                                        selectedCashRegister.salesHistory.map((sale: any) => (
                                                            <div key={sale.orderId} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-3">
                                                                <div className="bg-slate-50 border-b border-gray-100 p-3 flex flex-col justify-between">
                                                                    <div className="flex justify-between items-center">
                                                                        <div>
                                                                            <p className="text-xs font-bold text-slate-800">{sale.notes}</p>
                                                                            <p className="text-[10px] text-gray-500">Valor Bruto: R$ {Number(sale.totalBruto || 0).toFixed(2).replace('.', ',')}</p>
                                                                        </div>
                                                                        {sale.discount > 0 && (
                                                                            <span className="text-[10px] bg-red-50 text-red-600 px-2 py-1 rounded font-black uppercase">
                                                                                Desconto Info: - R$ {Number(sale.discount || 0).toFixed(2).replace('.', ',')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {sale.items && sale.items.length > 0 && (
                                                                        <div className="mt-2 pt-2 border-t border-gray-200/60 space-y-1">
                                                                            {sale.items.map((it: any, idx: number) => (
                                                                                <div key={idx} className="flex justify-between items-center text-[10px] text-slate-500">
                                                                                    <span>{it.quantity}x {it.name}</span>
                                                                                    <span className="font-bold">R$ {Number(it.subtotal || 0).toFixed(2).replace('.', ',')}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="p-2 space-y-1 bg-white">
                                                                    {sale.payments.map((p: any) => (
                                                                        <div key={p.id} className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-slate-50 transition group">
                                                                            {editingPayment?.id === p.id ? (
                                                                                <div className="flex-1 flex flex-wrap items-center gap-2 py-1">
                                                                                    <select 
                                                                                        value={editingPayment!.method} 
                                                                                        onChange={e => setEditingPayment({...editingPayment!, method: e.target.value})}
                                                                                        className="text-xs font-bold border rounded p-1.5 outline-none focus:border-mrts-blue bg-white"
                                                                                    >
                                                                                        <option value="CASH">Dinheiro</option>
                                                                                        <option value="PIX">Pix</option>
                                                                                        <option value="DEBIT">Débito</option>
                                                                                        <option value="CREDIT">Crédito</option>
                                                                                    </select>
                                                                                    <input 
                                                                                        type="number" 
                                                                                        step="0.01"
                                                                                        value={editingPayment!.amount} 
                                                                                        onChange={e => setEditingPayment({...editingPayment!, amount: Number(e.target.value)})}
                                                                                        className="text-xs font-bold border rounded p-1.5 w-24 outline-none focus:border-mrts-blue bg-white"
                                                                                    />
                                                                                    <button onClick={handleSavePaymentEdit} disabled={isPending} className="bg-emerald-500 text-white px-3 py-1.5 rounded-md text-[10px] font-bold shadow-sm hover:bg-emerald-600 transition">
                                                                                        {isPending ? '...' : 'Salvar'}
                                                                                    </button>
                                                                                    <button onClick={() => setEditingPayment(null)} disabled={isPending} className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-[10px] font-bold hover:bg-gray-300 transition">
                                                                                        Cancelar
                                                                                    </button>
                                                                                </div>
                                                                            ) : (
                                                                                <>
                                                                                    <div className="flex-1">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="font-bold text-slate-700 text-[11px] uppercase">{p.method === 'CASH' ? 'Dinheiro' : p.method === 'PIX' ? 'Pix' : p.method === 'DEBIT' ? 'Débito' : 'Crédito'}</span>
                                                                                        </div>
                                                                                        <p className="text-[9px] text-gray-400 font-medium">{new Date(p.date).toLocaleTimeString('pt-BR')}</p>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="font-black text-green-600 text-xs">Pago: R$ {Number(p.amount || 0).toFixed(2).replace('.', ',')}</span>
                                                                                        <button
                                                                                            onClick={() => setEditingPayment({id: p.id, method: p.method, amount: p.amount})}
                                                                                            className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                                                            title="Editar Pagamento (Admin)"
                                                                                        >
                                                                                            <Edit2 size={12} />
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => handleVoidPayment(p.id)}
                                                                                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                                                            title="Estornar Pagamento"
                                                                                        >
                                                                                            <RotateCcw size={12} />
                                                                                        </button>
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="text-center py-6 text-gray-400 italic text-xs font-bold bg-white rounded-xl border border-dashed border-gray-200">
                                                            Nenhum pagamento registrado nesta sessão.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="bg-slate-800 text-white rounded-xl p-4 border border-slate-700 shadow-inner">
                                                    <p className="text-[10px] font-bold text-slate-300 mb-1 uppercase tracking-wider">Dinheiro em Gaveta Esperado (Sistema)</p>
                                                    <p className="text-xl font-black flex items-center gap-2"><Banknote size={20} className="text-slate-400" /> R$ {Number(selectedCashRegister.expectedCashInDrawer || 0).toFixed(2).replace('.', ',')}</p>
                                                </div>
                                                <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-700 shadow-inner">
                                                    <p className="text-[10px] font-bold text-green-400 mb-1 uppercase tracking-wider">Dinheiro em Gaveta Declarado (Físico)</p>
                                                    <p className="text-xl font-black flex items-center gap-2"><Banknote size={20} className="text-green-500" /> {selectedCashRegister.closingBal !== null ? `R$ ${Number(selectedCashRegister.closingBal).toFixed(2).replace('.', ',')}` : 'Caixa Aberto'}</p>
                                                </div>
                                            </div>

                                            {selectedCashRegister.closingBal !== null && (
                                                <div className={`mt-4 rounded-xl p-4 border text-center ${
                                                    Math.abs(selectedCashRegister.closingBal - selectedCashRegister.expectedCashInDrawer) < 0.01 
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                                        : (selectedCashRegister.closingBal - selectedCashRegister.expectedCashInDrawer) < 0 
                                                            ? 'bg-red-50 text-red-700 border-red-100' 
                                                            : 'bg-blue-50 text-blue-700 border-blue-100'
                                                }`}>
                                                    <p className="text-[10px] font-black uppercase tracking-widest mb-1">Diferença de Caixa (Divergência Física)</p>
                                                    <p className="text-lg font-black">
                                                        {Math.abs(selectedCashRegister.closingBal - selectedCashRegister.expectedCashInDrawer) < 0.01 
                                                            ? 'CONFERIDO E SEGURO (SEM DIVERGÊNCIA)' 
                                                            : (selectedCashRegister.closingBal - selectedCashRegister.expectedCashInDrawer) < 0 
                                                                ? `FALTA: - R$ ${Math.abs(selectedCashRegister.closingBal - selectedCashRegister.expectedCashInDrawer).toFixed(2).replace('.', ',')}` 
                                                                : `SOBRA: + R$ ${Math.abs(selectedCashRegister.closingBal - selectedCashRegister.expectedCashInDrawer).toFixed(2).replace('.', ',')}`
                                                        }
                                                    </p>
                                                </div>
                                            )}
                                            {selectedCashRegister.totalSessionDiscounts > 0 && (
                                                <div className="mt-4 bg-red-50 text-red-600 rounded-xl p-4 border border-red-100">
                                                    <p className="text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-2">
                                                        <TrendingDown size={14} /> Total de Descontos Concedidos
                                                    </p>
                                                    <p className="text-xl font-black">R$ {Number(selectedCashRegister.totalSessionDiscounts || 0).toFixed(2).replace('.', ',')}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Tabela Resumo Produtos */}
                                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col">
                                            <h4 className="text-sm uppercase tracking-wider font-bold text-gray-500 mb-6 flex items-center gap-2"><ShoppingBag size={18} /> Inventário Liquidado na Sessão</h4>
                                            <div className="overflow-y-auto flex-1 pr-2 space-y-2 relative h-64 hide-scrollbar">
                                                {selectedCashRegister.productsSold.length === 0 && <p className="text-sm text-gray-400 italic text-center py-10 font-bold">Nenhum espelho de estoque consumido.</p>}
                                                {selectedCashRegister.productsSold.map((prod: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-center bg-slate-50/80 p-3 rounded-xl border border-gray-100 hover:border-mrts-blue transition">
                                                        <div className="flex-1 min-w-0 pr-3">
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <p className="font-bold text-slate-800 text-sm truncate">{prod.name}</p>
                                                                {prod.hasDiscount && (
                                                                    <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter">Desconto</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[11px] uppercase tracking-wide text-mrts-blue font-black">{prod.quantity} volumes líquidos</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="font-black text-slate-900 text-sm">R$ {Number(prod.total || 0).toFixed(2).replace('.', ',')}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {selectedCashRegister.ordersWithDiscount && selectedCashRegister.ordersWithDiscount.length > 0 && (
                                        <div className="mt-8 border-t border-gray-100 pt-8">
                                            <h4 className="text-sm uppercase tracking-wider font-bold text-gray-500 mb-6 flex items-center gap-2">
                                                <TrendingDown size={18} className="text-red-500" /> Detalhamento de Vendas com Desconto
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {selectedCashRegister.ordersWithDiscount.map((ord: any) => (
                                                    <div key={ord.id} className="bg-white border border-red-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition">
                                                        <div className="flex justify-between items-start mb-3">
                                                            <p className="font-bold text-slate-800 text-sm truncate pr-2">Comanda: {ord.notes || 'Sem identificação'}</p>
                                                            <span className="bg-red-50 text-red-600 text-[10px] px-2 py-1 rounded font-black uppercase shrink-0">- R$ {Number(ord.discount || 0).toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1 mb-2">
                                                            {ord.items.map((it: string, idx: number) => (
                                                                <span key={idx} className="text-[9px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-gray-100">{it}</span>
                                                            ))}
                                                        </div>
                                                        <p className="text-[10px] text-gray-400 font-medium">Total Bruto Sem Desconto: R$ {Number(ord.totalBruto || 0).toFixed(2)}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL REGISTRAR DEPÓSITO */}
            {showDepositModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 overflow-hidden border border-gray-100">
                        <form onSubmit={handleRecordDeposit}>
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                        <Landmark className="text-mrts-blue" /> {isGlobalDeposit ? 'Depósito Global do Ciclo' : 'Registrar Depósito'}
                                    </h2>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                        {isGlobalDeposit ? 'Zerar todos os caixas pendentes' : `Sessão: ${selectedSessionForDep?.operatorName} | ${selectedSessionForDep?.closedAt ? new Date(selectedSessionForDep.closedAt).toLocaleDateString() : ''}`}
                                    </p>
                                </div>
                                <button type="button" onClick={() => setShowDepositModal(false)} className="text-gray-400 hover:text-gray-600 bg-white p-2 rounded-full shadow-sm">
                                    <XCircle size={20} />
                                </button>
                            </div>

                            <div className="p-8 space-y-6">
                                {!isGlobalDeposit && selectedSessionForDep && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                            <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Montante Declarado</p>
                                            <p className="text-lg font-black text-slate-700">R$ {Number(selectedSessionForDep.declaredAmount || 0).toFixed(2)}</p>
                                        </div>
                                        <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                                            <p className="text-[9px] font-black text-red-400 uppercase mb-1">Pendente em Mão</p>
                                            <p className="text-lg font-black text-red-600">R$ {Number(selectedSessionForDep.remainingAmount || 0).toFixed(2)}</p>
                                        </div>
                                    </div>
                                )}

                                {isGlobalDeposit && (
                                    <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 text-center">
                                        <p className="text-[10px] font-black text-emerald-600 uppercase mb-2 tracking-widest">Total Acumulado (Resíduo de Caixas)</p>
                                        <p className="text-4xl font-black text-emerald-700 flex items-center justify-center gap-2">
                                            <Banknote size={32} /> R$ {depositSessions.reduce((acc, s) => acc + (s.remainingAmount || 0), 0).toFixed(2).replace('.', ',')}
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                        <Banknote size={14} className="text-mrts-blue" /> Valor do Depósito (R$)
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={depositAmount}
                                        onChange={(e) => setDepositAmount(e.target.value)}
                                        placeholder="0,00"
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 outline-none focus:border-mrts-blue font-black text-2xl text-slate-800 transition placeholder:text-gray-200"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-2 italic">* Informe o valor exato que foi transferido para a conta bancária.</p>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Observações / Comprovante</label>
                                    <textarea
                                        value={depositNotes}
                                        onChange={(e) => setDepositNotes(e.target.value)}
                                        rows={2}
                                        placeholder="Ex: Depósito via envelope, transferência Bradesco..."
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 outline-none focus:border-mrts-blue font-medium text-sm text-slate-700 transition"
                                    ></textarea>
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50 border-t border-gray-100 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowDepositModal(false)}
                                    className="flex-1 bg-white text-gray-500 font-bold py-3 rounded-2xl border border-gray-200 hover:bg-gray-50 transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="flex-[2] bg-mrts-blue text-white font-black py-3 rounded-2xl shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isPending ? 'PROCESSANDO...' : <><Landmark size={18} /> CONFIRMAR DEPÓSITO</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
