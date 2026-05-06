'use client';

import { useState, useTransition } from 'react';
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
    DollarSign, Wallet, Activity, Database, Users, Lock, Unlock, ArrowRight, Sheet, 
    Plus, Calendar, CheckCircle, XCircle, Trash2, Filter, AlertCircle, TrendingUp, TrendingDown, Eye, CreditCard, Banknote, ShoppingBag 
} from 'lucide-react';
import { downloadExcel } from '../../../lib/excel-export';
import { createFinancialEntry, updateFinancialStatus, deleteFinancialEntry } from '../../actions/financeiro';
import { getRegisterSummary, deleteCashSessionAction, getSessionsForDepositAction, recordCashDepositAction, recordGlobalCashDepositAction } from '../../actions/caixa';
import { voidPaymentAction } from '../../actions/comandas';
import { RotateCcw, Landmark, History } from 'lucide-react';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#0ea5e9'];

export default function FinanceiroClient({ payload }: any) {
  const { 
    totalRevenue, totalPendingPayable, totalPendingReceivable, 
    dailyChart, methodChart, cashRegisters, financialEntries 
  } = payload;
  
  const [activeTab, setActiveTab] = useState('DASHBOARD'); // DASHBOARD, CASHIER, BILLING
  const [isPending, startTransition] = useTransition();
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterType, setFilterType] = useState('ALL'); // ALL, PAYABLE, RECEIVABLE
  
  // States para o novo lançamento
  const [newEntry, setNewEntry] = useState({
    description: '',
    type: 'PAYABLE',
    amount: '',
    dueDate: new Date().toISOString().split('T')[0],
    category: 'Diversos',
    notes: '',
    method: 'PIX',
    reference: `${new Date().getMonth() + 1}/${new Date().getFullYear()}`,
    installments: 1
  });

  const [selectedCashRegister, setSelectedCashRegister] = useState<any>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // States para Depósitos
  const [depositSessions, setDepositSessions] = useState<any[]>([]);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [isGlobalDeposit, setIsGlobalDeposit] = useState(false);
  const [selectedSessionForDep, setSelectedSessionForDep] = useState<any>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNotes, setDepositNotes] = useState('');

  const todayVal = dailyChart[dailyChart.length - 1]?.valor || 0;
  
  const handleExportExcel = () => {
      const exportData = cashRegisters.map((cash: any) => {
          const shiftEntries = cash.payments?.reduce((acc:number, p:any) => acc + p.amount, 0) || 0;
          return {
              "Operador": cash.user?.name || "-",
              "Status": cash.status === "OPEN" ? "Aberto" : "Fechado",
              "Abertura": new Date(cash.openedAt).toLocaleString('pt-BR'),
              "Fechamento": cash.closedAt ? new Date(cash.closedAt).toLocaleString('pt-BR') : "-",
              "Fundo Troco Inicial (R$)": cash.openingBal || 0,
              "Total Recebido Vendas (R$)": shiftEntries,
              "Saldo Final Conferido (R$)": cash.closingBal || 0,
              "Diferença / Quebra (R$)": cash.closingBal !== null ? cash.closingBal - (shiftEntries + cash.openingBal) : 0
          };
      });
      downloadExcel(exportData, "Relatorio_Movimentacao_Caixas");
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
            dueDate: new Date().toISOString().split('T')[0],
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
      if (filterType === 'ALL') return true;
      return e.type === filterType;
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
                <Activity size={14}/> Dashboard
            </button>
            <button onClick={() => setActiveTab('BILLING')} className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTab === 'BILLING' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                <Calendar size={14}/> Contas Pagar/Receber
            </button>
            <button onClick={() => setActiveTab('CASHIER')} className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTab === 'CASHIER' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                <Wallet size={14}/> Sessões de Caixa
            </button>
          </div>
          {activeTab === 'BILLING' && (
              <button 
                onClick={() => setShowAddModal(true)}
                className="bg-mrts-blue text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2 hover:scale-105 active:scale-95 transition shrink-0"
              >
                  <Plus size={16}/> Novo Lançamento
              </button>
          )}
        </div>
      </div>

      {activeTab === 'DASHBOARD' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white border text-left border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                    <p className="text-[10px] font-black text-gray-400 tracking-widest mb-1 relative z-10 flex items-center gap-2 uppercase">Receita (30d)</p>
                    <h2 className="text-2xl font-black text-slate-800 relative z-10">R$ {totalRevenue.toFixed(2).replace('.',',')}</h2>
                    <div className="absolute right-0 bottom-0 p-2 opacity-5">
                        <TrendingUp size={64} className="text-emerald-500"/>
                    </div>
                </div>
                <div className="bg-white border text-left border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                    <p className="text-[10px] font-black text-orange-400 tracking-widest mb-1 relative z-10 flex items-center gap-2 uppercase">Pendente a Receber</p>
                    <h2 className="text-2xl font-black text-slate-800 relative z-10">R$ {totalPendingReceivable.toFixed(2).replace('.',',')}</h2>
                    <div className="absolute right-0 bottom-0 p-2 opacity-5">
                        <TrendingUp size={64} className="text-orange-500"/>
                    </div>
                </div>
                <div className="bg-white border text-left border-gray-100 rounded-2xl p-5 shadow-sm relative overflow-hidden group border-l-4 border-l-red-500">
                    <p className="text-[10px] font-black text-red-400 tracking-widest mb-1 relative z-10 flex items-center gap-2 uppercase">Pendente a Pagar</p>
                    <h2 className="text-2xl font-black text-slate-800 relative z-10">R$ {totalPendingPayable.toFixed(2).replace('.',',')}</h2>
                    <div className="absolute right-0 bottom-0 p-2 opacity-5">
                        <TrendingDown size={64} className="text-red-500"/>
                    </div>
                </div>
                <div className="bg-slate-900 border text-left border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group">
                    <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1 relative z-10 flex items-center gap-2 uppercase">Saldo Previsto</p>
                    <h2 className="text-2xl font-black text-white relative z-10">R$ {(totalRevenue + totalPendingReceivable - totalPendingPayable).toFixed(2).replace('.',',')}</h2>
                    <div className="absolute right-0 bottom-0 p-2 opacity-10">
                        <DollarSign size={64} className="text-white"/>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* EVOLUTION CHART */}
                <div className="col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col items-start min-w-0">
                    <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">Fluxo Diário <span className="text-xs font-medium text-gray-400 font-mono">(30 Dias)</span></h3>
                    <div className="w-full h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={dailyChart}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}/>
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(val) => `R$ ${val}`}/>
                                <RTooltip 
                                    formatter={(value: any) => [`R$ ${parseFloat(value.toString()).toFixed(2).replace('.',',')}`, 'Vendas']}
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                                />
                                <Line type="monotone" dataKey="valor" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
                            </LineChart>
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
                                        {methodChart.map((e:any, i:number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <RTooltip formatter={(v: any) => `R$ ${parseFloat(v.toString()).toFixed(2)}`} />
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
              <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                  <div className="flex gap-2">
                      <button onClick={() => setFilterType('ALL')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${filterType === 'ALL' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Todos</button>
                      <button onClick={() => setFilterType('PAYABLE')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${filterType === 'PAYABLE' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Contas a Pagar</button>
                      <button onClick={() => setFilterType('RECEIVABLE')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${filterType === 'RECEIVABLE' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Contas a Receber</button>
                  </div>
                  <div className="text-gray-400 text-xs font-medium flex items-center gap-2">
                      <Filter size={14}/> {filteredEntries.length} lançamentos encontrados
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
                          {filteredEntries.map((e: any) => (
                              <tr key={e.id} className="hover:bg-slate-50/50 transition">
                                  <td className="p-4">
                                      <div className="flex flex-col">
                                          <span className="font-bold text-slate-800 text-sm">{e.description}</span>
                                          <span className="text-[10px] text-gray-400 font-bold uppercase">{e.category} {e.installmentNum ? `| Parc. ${e.installmentNum}/${e.installmentTotal}` : ''}</span>
                                      </div>
                                  </td>
                                  <td className="p-4">
                                      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                                          <Calendar size={14} className="text-gray-400"/>
                                          {new Date(e.dueDate).toLocaleDateString('pt-BR')}
                                          {e.status === 'PENDING' && new Date(e.dueDate) < new Date() && (
                                              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black italic animate-pulse">ATRASADO</span>
                                          )}
                                      </div>
                                  </td>
                                  <td className="p-4">
                                      <span className={`text-sm font-black ${e.type === 'PAYABLE' ? 'text-red-500' : 'text-emerald-500'}`}>
                                          {e.type === 'PAYABLE' ? '-' : '+'} R$ {e.amount.toFixed(2).replace('.',',')}
                                      </span>
                                  </td>
                                  <td className="p-4">
                                      <div className="flex flex-col">
                                          <span className="text-xs font-bold text-slate-600 uppercase">{e.method || '-'}</span>
                                          <span className="text-[10px] text-gray-400 font-medium">Ref: {e.reference || '-'}</span>
                                      </div>
                                  </td>
                                  <td className="p-4">
                                      {e.status === 'PAID' ? (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                              <CheckCircle size={12}/> Pago
                                          </span>
                                      ) : e.status === 'CANCELED' ? (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                                               Cancelado
                                          </span>
                                      ) : (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-orange-500 bg-orange-50 px-2 py-1 rounded-lg">
                                              <AlertCircle size={12}/> Pendente
                                          </span>
                                      )}
                                  </td>
                                  <td className="p-4 px-6 text-right">
                                      <div className="flex justify-end gap-2">
                                          {e.status === 'PENDING' && (
                                              <button 
                                                onClick={() => handleUpdateStatus(e.id, 'PAID')}
                                                disabled={isPending}
                                                className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg transition" title="Marcar como Pago"
                                              >
                                                  <CheckCircle size={18}/>
                                              </button>
                                          )}
                                          <button 
                                            onClick={() => handleDelete(e.id)}
                                            disabled={isPending}
                                            className="p-2 bg-red-50 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition" title="Excluir"
                                          >
                                              <Trash2 size={18}/>
                                          </button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                          {filteredEntries.length === 0 && (
                              <tr><td colSpan={6} className="p-10 text-center text-gray-400 text-sm font-medium">Nenhum lançamento encontrado para os filtros selecionados.</td></tr>
                          )}
                      </tbody>
                  </table>
                  </div>
              </div>
          </div>
      )}

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
                                            {cash.user?.name?.charAt(0) || <Users size={14}/>}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm leading-tight">{cash.user?.name}</p>
                                            <p className="text-[10px] text-gray-400 font-medium">Início: {new Date(cash.openedAt).toLocaleDateString('pt-BR')} {new Date(cash.openedAt).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4">
                                    {cash.status === 'OPEN' ? (
                                        <span className="inline-flex items-center gap-1.5 text-[9px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-black tracking-wide uppercase">
                                            <Unlock size={10}/> Aberto
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 text-[9px] bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-bold tracking-wide uppercase">
                                            <Lock size={10}/> Fechado
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 font-bold text-slate-700 text-sm bg-emerald-50/10">R$ {byMethod.CASH.toFixed(2).replace('.',',')}</td>
                                <td className="p-4 font-bold text-slate-700 text-sm bg-blue-50/10">R$ {byMethod.PIX.toFixed(2).replace('.',',')}</td>
                                <td className="p-4 font-bold text-slate-700 text-sm bg-orange-50/10">R$ {byMethod.DEBIT.toFixed(2).replace('.',',')}</td>
                                <td className="p-4 font-bold text-slate-700 text-sm bg-indigo-50/10">R$ {byMethod.CREDIT.toFixed(2).replace('.',',')}</td>
                                
                                <td className="p-4 font-medium text-slate-500 text-sm border-l border-gray-100">R$ {cash.openingBal.toFixed(2).replace('.',',')}</td>
                                <td className="p-4 font-black text-slate-800 text-sm border-r border-gray-100">{cash.closingBal !== null ? `R$ ${cash.closingBal.toFixed(2).replace('.',',')}` : '-'}</td>
                                
                                <td className="p-4">
                                    {cash.status === 'CLOSED' ? (
                                        <span 
                                            className={`text-[10px] px-2 py-0.5 rounded font-black border ${Math.abs(auditVendas) < 0.01 ? 'bg-gray-50 text-gray-400 border-gray-100' : 'bg-red-50 text-red-500 border-red-100'}`}
                                            title={`Gross: ${totalGrossSold.toFixed(2)} | Disc: ${totalDiscounts.toFixed(2)} | Paid: ${totalPaymentsReceived.toFixed(2)}`}
                                        >
                                            {Math.abs(auditVendas) < 0.01 ? 'INTEGRO' : `R$ ${auditVendas.toFixed(2)}`}
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
                                                R$ {auditFisico.toFixed(2).replace('.',',')} (FALTA)
                                            </span>
                                        ) : (
                                            <span className="text-[10px] px-2 py-0.5 rounded font-black border bg-blue-50 text-blue-600 border-blue-100">
                                                + R$ {auditFisico.toFixed(2).replace('.',',')} (SOBRA)
                                            </span>
                                        )
                                    ) : (
                                        <span className="text-gray-300 text-[10px] italic">-</span>
                                    )}
                                </td>
                                <td className="p-4 text-center">
                                    <div className="flex justify-center gap-2">
                                        <button onClick={() => handleViewDetails(cash)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-lg transition" title="Ver Detalhes do Turno">
                                            <Eye size={16}/>
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteSession(cash.id)} 
                                            className="bg-red-50 hover:bg-red-500 text-red-500 hover:text-white p-2 rounded-lg transition" 
                                            title="Excluir Histórico de Sessão (Admin Only)"
                                        >
                                            <Trash2 size={16}/>
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
                    <button onClick={handleExportExcel} className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold shadow-sm hover:bg-emerald-100 transition text-sm">
                        <Sheet size={16}/> Exportar Excel
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
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><DollarSign className="text-mrts-blue"/> Registro de Movimentação</h2>
                        <button type="button" onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 bg-white p-2 rounded-full shadow-sm">
                            <XCircle size={20}/>
                        </button>
                    </div>

                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Tipo de Registro</label>
                                <select 
                                    value={newEntry.type}
                                    onChange={(e) => setNewEntry({...newEntry, type: e.target.value as any})}
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
                                    onChange={(e) => setNewEntry({...newEntry, category: e.target.value})}
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
                                onChange={(e) => setNewEntry({...newEntry, description: e.target.value})}
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
                                    onChange={(e) => setNewEntry({...newEntry, amount: e.target.value})}
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
                                    onChange={(e) => setNewEntry({...newEntry, reference: e.target.value})}
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Forma de Pagamento</label>
                                <select 
                                    value={newEntry.method}
                                    onChange={(e) => setNewEntry({...newEntry, method: e.target.value})}
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
                                    onChange={(e) => setNewEntry({...newEntry, installments: parseInt(e.target.value) || 1})}
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
                                    onChange={(e) => setNewEntry({...newEntry, dueDate: e.target.value})}
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 outline-none focus:border-mrts-blue font-bold text-slate-700 transition"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Observações (Opcional)</label>
                            <textarea 
                                value={newEntry.notes}
                                onChange={(e) => setNewEntry({...newEntry, notes: e.target.value})}
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
                                <p className="text-4xl font-black text-slate-900">R$ {selectedCashRegister.sumAllPayments.toFixed(2).replace('.', ',')}</p>
                            </div>

                            {selectedCashRegister.closingNotes && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
                                    <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <AlertCircle size={14}/> Observações de Fechamento
                                    </h4>
                                    <p className="text-sm font-medium text-amber-900 italic">&quot;{selectedCashRegister.closingNotes}&quot;</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Tabela Resumo Pagamentos */}
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                                    <h4 className="text-sm uppercase tracking-wider font-bold text-gray-500 mb-6 flex items-center gap-2"><CreditCard size={18}/> Dinheiro, Cartões e Transações</h4>
                                    <div className="space-y-4">
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                            <p className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Fundo de Troco Operacional (Entrada)</p>
                                            <p className="text-xl font-black text-slate-800">R$ {selectedCashRegister.openingBal.toFixed(2).replace('.', ',')}</p>
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
                                                                    <p className="text-[10px] text-gray-500">Valor Bruto: R$ {sale.totalBruto.toFixed(2).replace('.', ',')}</p>
                                                                </div>
                                                                {sale.discount > 0 && (
                                                                    <span className="text-[10px] bg-red-50 text-red-600 px-2 py-1 rounded font-black uppercase">
                                                                        Desconto Info: - R$ {sale.discount.toFixed(2).replace('.', ',')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {sale.items && sale.items.length > 0 && (
                                                                <div className="mt-2 pt-2 border-t border-gray-200/60 space-y-1">
                                                                    {sale.items.map((it: any, idx: number) => (
                                                                        <div key={idx} className="flex justify-between items-center text-[10px] text-slate-500">
                                                                            <span>{it.quantity}x {it.name}</span>
                                                                            <span className="font-bold">R$ {it.subtotal.toFixed(2).replace('.', ',')}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="p-2 space-y-1 bg-white">
                                                            {sale.payments.map((p: any) => (
                                                                <div key={p.id} className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-slate-50 transition group">
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-bold text-slate-700 text-[11px] uppercase">{p.method === 'CASH' ? 'Dinheiro' : p.method === 'PIX' ? 'Pix' : p.method === 'DEBIT' ? 'Débito' : 'Crédito'}</span>
                                                                        </div>
                                                                        <p className="text-[9px] text-gray-400 font-medium">{new Date(p.date).toLocaleTimeString('pt-BR')}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-black text-green-600 text-xs">Pago: R$ {p.amount.toFixed(2).replace('.', ',')}</span>
                                                                        <button 
                                                                            onClick={() => handleVoidPayment(p.id)}
                                                                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                                            title="Estornar Pagamento"
                                                                        >
                                                                            <RotateCcw size={12} />
                                                                        </button>
                                                                    </div>
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
                                    <div className="mt-8 bg-slate-900 text-white rounded-xl p-5 border border-slate-700 shadow-inner ring-4 ring-slate-900/5">
                                        <p className="text-[11px] font-bold text-green-400 mb-1 uppercase tracking-wider">Dinheiro Em Gaveta Declarado</p>
                                        <p className="text-3xl font-black flex items-center gap-2"><Banknote size={28}/> R$ {selectedCashRegister.expectedCashInDrawer.toFixed(2).replace('.', ',')}</p>
                                    </div>
                                    {selectedCashRegister.totalSessionDiscounts > 0 && (
                                        <div className="mt-4 bg-red-50 text-red-600 rounded-xl p-4 border border-red-100">
                                            <p className="text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-2">
                                                <TrendingDown size={14}/> Total de Descontos Concedidos
                                            </p>
                                            <p className="text-xl font-black">R$ {selectedCashRegister.totalSessionDiscounts.toFixed(2).replace('.', ',')}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Tabela Resumo Produtos */}
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col">
                                    <h4 className="text-sm uppercase tracking-wider font-bold text-gray-500 mb-6 flex items-center gap-2"><ShoppingBag size={18}/> Inventário Liquidado na Sessão</h4>
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
                                                    <p className="font-black text-slate-900 text-sm">R$ {prod.total.toFixed(2).replace('.', ',')}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {selectedCashRegister.ordersWithDiscount && selectedCashRegister.ordersWithDiscount.length > 0 && (
                                <div className="mt-8 border-t border-gray-100 pt-8">
                                    <h4 className="text-sm uppercase tracking-wider font-bold text-gray-500 mb-6 flex items-center gap-2">
                                        <TrendingDown size={18} className="text-red-500"/> Detalhamento de Vendas com Desconto
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {selectedCashRegister.ordersWithDiscount.map((ord: any) => (
                                            <div key={ord.id} className="bg-white border border-red-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition">
                                                <div className="flex justify-between items-start mb-3">
                                                    <p className="font-bold text-slate-800 text-sm truncate pr-2">Comanda: {ord.notes || 'Sem identificação'}</p>
                                                    <span className="bg-red-50 text-red-600 text-[10px] px-2 py-1 rounded font-black uppercase shrink-0">- R$ {ord.discount.toFixed(2)}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {ord.items.map((it: string, idx: number) => (
                                                        <span key={idx} className="text-[9px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-gray-100">{it}</span>
                                                    ))}
                                                </div>
                                                <p className="text-[10px] text-gray-400 font-medium">Total Bruto Sem Desconto: R$ {ord.totalBruto.toFixed(2)}</p>
                                            </div>
                                        ))}
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
                                <Landmark className="text-mrts-blue"/> {isGlobalDeposit ? 'Depósito Global do Ciclo' : 'Registrar Depósito'}
                            </h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                {isGlobalDeposit ? 'Zerar todos os caixas pendentes' : `Sessão: ${selectedSessionForDep?.operatorName} | ${selectedSessionForDep?.closedAt ? new Date(selectedSessionForDep.closedAt).toLocaleDateString() : ''}`}
                            </p>
                          </div>
                          <button type="button" onClick={() => setShowDepositModal(false)} className="text-gray-400 hover:text-gray-600 bg-white p-2 rounded-full shadow-sm">
                              <XCircle size={20}/>
                          </button>
                      </div>

                      <div className="p-8 space-y-6">
                            {!isGlobalDeposit && selectedSessionForDep && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                        <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Montante Declarado</p>
                                        <p className="text-lg font-black text-slate-700">R$ {selectedSessionForDep.declaredAmount.toFixed(2)}</p>
                                    </div>
                                    <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                                        <p className="text-[9px] font-black text-red-400 uppercase mb-1">Pendente em Mão</p>
                                        <p className="text-lg font-black text-red-600">R$ {selectedSessionForDep.remainingAmount.toFixed(2)}</p>
                                    </div>
                                </div>
                            )}

                            {isGlobalDeposit && (
                                <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 text-center">
                                    <p className="text-[10px] font-black text-emerald-600 uppercase mb-2 tracking-widest">Total Acumulado (Resíduo de Caixas)</p>
                                    <p className="text-4xl font-black text-emerald-700 flex items-center justify-center gap-2">
                                       <Banknote size={32}/> R$ {depositSessions.reduce((acc, s) => acc + (s.remainingAmount || 0), 0).toFixed(2).replace('.',',')}
                                    </p>
                                </div>
                            )}

                          <div>
                              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                  <Banknote size={14} className="text-mrts-blue"/> Valor do Depósito (R$)
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
                              {isPending ? 'PROCESSANDO...' : <><Landmark size={18}/> CONFIRMAR DEPÓSITO</>}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
                        </div>
                      ) : null}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
