'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { Plus, Edit3, X, User as UserIcon, Calendar, CheckCircle, AlertTriangle, Clock, CreditCard, Trash2, Trophy, DollarSign, Gauge, Settings, RefreshCw, Star, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend } from 'recharts';
import { upsertCustomer, paySubscription, createRental, deleteCustomer, updateSubscriptionPayment, deleteSubscriptionPayment, updateRental, deleteRental, setRentalStatus } from '../../actions/customers';
import { getScores, saveScoreConfig, recalcScore, getScoreHistory, getScoreConfig } from '../../actions/score';

const TZ = 'America/Cuiaba';

const CLASS_ORDER = ['PREMIUM', 'FREQUENTE', 'REGULAR', 'EM_RISCO', 'INATIVO'];

const CLASS_META: Record<string, { label: string; color: string; bg: string }> = {
    PREMIUM: { label: 'Premium', color: 'text-amber-700', bg: 'bg-amber-100 border-amber-200' },
    FREQUENTE: { label: 'Frequente', color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-200' },
    REGULAR: { label: 'Regular', color: 'text-sky-700', bg: 'bg-sky-100 border-sky-200' },
    EM_RISCO: { label: 'Em risco', color: 'text-orange-700', bg: 'bg-orange-100 border-orange-200' },
    INATIVO: { label: 'Inativo', color: 'text-red-700', bg: 'bg-red-100 border-red-200' },
};

const FATOR_LABEL: Record<string, string> = {
    frequencia: 'Frequência',
    gastoAluguel: 'Gasto em Aluguéis',
    consumoBar: 'Consumo no Bar',
    pontualidade: 'Pontualidade',
    cancelamentos: 'Cancelamentos',
    faltas: 'Faltas',
    recencia: 'Recência',
    recorrencia: 'Recorrência',
    inadimplencia: 'Inadimplência',
};

function toDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

function todayStr(): string {
  return toDateStr(new Date());
}

function monthStartStr(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  return `${y}-${m}-01`;
}

export default function ClientesClient({ initialCustomers, fieldRentalLancamentos }: any) {
  const [customers] = useState(initialCustomers);
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, OVERDUE
  const [classFilter, setClassFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState(monthStartStr());
  const [dateTo, setDateTo] = useState(todayStr());

  // Score state
  const [scores, setScores] = useState<Record<string, any>>({});
  const [scoresLoading, setScoresLoading] = useState(true);
  const [scoreConfig, setScoreConfig] = useState<any>(null);
  const [showScoreConfig, setShowScoreConfig] = useState(false);
  const [pesosForm, setPesosForm] = useState<any>(null);
  const [pesosSaving, setPesosSaving] = useState(false);
  const [scoreHistory, setScoreHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Modals
  const [isCustomerModalOpen, setCustomerModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  
  // Forms
  const [formData, setFormData] = useState<any>({});
  
  const [isPending, startTransition] = useTransition();

  // Formata contagens que podem ser fracionadas por pagamento parcial (ex.: meio jogo)
  const fmtCount = (v: any) => {
      const n = Number(v || 0);
      return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  };

  const openCustomerModal = (customer?: any) => {
      setSelectedCustomer(customer || null);
      if (customer) {
          setFormData({
              id: customer.id,
              name: customer.name,
              phone: customer.phone || "",
              notes: customer.notes || "",
              hasSubscription: !!customer.subscription,
              planName: customer.subscription?.planName || "Mensalidade Padrão",
              amount: customer.subscription?.amount || 100,
              dueDate: customer.subscription?.dueDate || 5
          });
      } else {
          setFormData({
              id: undefined, name: "", phone: "", notes: "", hasSubscription: false, planName: "Mensalidade Padrão", amount: 100, dueDate: 5
          });
      }
      setCustomerModalOpen(true);
  };

  const handleSaveCustomer = () => {
      if (!formData.name) return;
      
      const payload: any = {
          id: formData.id,
          name: formData.name,
          phone: formData.phone,
          notes: formData.notes,
      };

      if (formData.hasSubscription) {
          payload.subscription = {
              planName: formData.planName,
              amount: parseFloat(formData.amount.toString().replace(',','.')),
              dueDate: parseInt(formData.dueDate)
          };
      }

      startTransition(async () => {
          try {
              await upsertCustomer(payload);
              alert("Registro salvo com sucesso.");
              setCustomerModalOpen(false);
              window.location.reload();
          } catch(e) {
              alert("Erro ao salvar cliente.");
          }
      });
  };

  const handlePaySubscription = (subId: string, amount: number) => {
      if(!confirm("Registrar pagamento desta mensalidade e avançar vencimento?")) return;
      
      startTransition(async () => {
          await paySubscription(subId, amount);
          alert("Pagamento registrado!");
          window.location.reload();
      });
  };

  // Editing Subscription Payment (mensalidade)
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [paymentForm, setPaymentForm] = useState<any>({});

  const openEditPayment = (payment: any) => {
      setEditingPayment(payment);
      setPaymentForm({
          amount: payment.amount,
          paymentDate: new Date(payment.paymentDate).toLocaleDateString('sv-SE')
      });
  };

  const handleSavePaymentEdit = () => {
      if (!editingPayment) return;
      const amount = parseFloat(paymentForm.amount.toString().replace(',', '.'));
      if (isNaN(amount) || amount <= 0) { alert("Valor inválido."); return; }

      startTransition(async () => {
          await updateSubscriptionPayment(editingPayment.id, amount, paymentForm.paymentDate);
          alert("Lançamento de mensalidade atualizado!");
          setEditingPayment(null);
          window.location.reload();
      });
  };

  const handleDeletePayment = (payment: any) => {
      if(!confirm("Excluir este lançamento de mensalidade? Esta ação não pode ser desfeita.")) return;
      startTransition(async () => {
          await deleteSubscriptionPayment(payment.id);
          alert("Lançamento excluído!");
          window.location.reload();
      });
  };

  // Editing Rental (locação)
  const [editingRental, setEditingRental] = useState<any>(null);

  const openEditRental = (rent: any) => {
      setEditingRental(rent);
      const start = new Date(rent.startTime);
      const end = new Date(rent.endTime);
      const pad = (n: number) => String(n).padStart(2, '0');
      setRentalResource(rent.resource);
      setRentalDate(start.toLocaleDateString('sv-SE'));
      setRentalStart(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
      setRentalEnd(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
      setRentalAmount(rent.totalAmount);
  };

  const handleSaveRentalEdit = () => {
      if (!editingRental || !rentalResource) return;

      startTransition(async () => {
          await updateRental(editingRental.id, rentalResource, rentalDate, rentalStart, rentalEnd, parseFloat(rentalAmount.toString().replace(',','.')));
          alert("Locação atualizada!");
          setEditingRental(null);
          window.location.reload();
      });
  };

  const handleDeleteRental = (rent: any) => {
      if(!confirm("Excluir esta locação? Esta ação não pode ser desfeita.")) return;
      startTransition(async () => {
          await deleteRental(rent.id);
          alert("Locação excluída!");
          window.location.reload();
      });
  };

  // Reserving Rental fields
  const [rentalResource, setRentalResource] = useState("");
  const [rentalDate, setRentalDate] = useState(new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Cuiaba' }));
  const [rentalStart, setRentalStart] = useState("10:00");
  const [rentalEnd, setRentalEnd] = useState("11:00");
  const [rentalAmount, setRentalAmount] = useState(0);

  const handleCreateRental = () => {
      if(!selectedCustomer || !rentalResource) return;
      
      startTransition(async () => {
          await createRental(selectedCustomer.id, rentalResource, rentalDate, rentalStart, rentalEnd, parseFloat(rentalAmount.toString().replace(',','.')));
          alert("Agendamento criado!");
          window.location.reload();
      });
  };

  const handleDeleteCustomer = () => {
      if (!selectedCustomer) return;
      if (!confirm("CUIDADO: Tem certeza que deseja excluir permanentemente este cliente? Esta ação não pode ser desfeita e removerá também assinaturas e agendamentos vinculados.")) return;

      startTransition(async () => {
          const res = await deleteCustomer(selectedCustomer.id);
          if (res.success) {
              alert("Cliente excluído com sucesso.");
              setCustomerModalOpen(false);
              window.location.reload();
          } else {
              alert(res.error || "Erro ao excluir cliente.");
          }
      });
  };

  useEffect(() => {
    (async () => {
      try {
        const [res, cfg] = await Promise.all([getScores(), getScoreConfig()]);
        const map: Record<string, any> = {};
        (res.scores || []).forEach((s: any) => { map[s.id] = s; });
        setScores(map);
        setScoreConfig(cfg);
        setPesosForm(cfg?.pesos ? { ...cfg.pesos } : null);
      } catch (e) {
        console.error("Erro ao carregar scores:", e);
      } finally {
        setScoresLoading(false);
      }
    })();
  }, []);

  const openScoreConfig = () => {
    setPesosForm(scoreConfig?.pesos ? { ...scoreConfig.pesos } : null);
    setShowScoreConfig(true);
  };

  const handleSaveScoreConfig = () => {
    if (!pesosForm) return;
    setPesosSaving(true);
    startTransition(async () => {
      try {
        const res = await saveScoreConfig(pesosForm, scoreConfig?.limiares);
        if (res?.success) {
          alert("Pesos atualizados! Todos os scores foram recalculados.");
          setShowScoreConfig(false);
          window.location.reload();
        } else {
          alert(res?.error || "Erro ao salvar configuração.");
        }
      } catch (e: any) {
        alert(e?.message || "Erro ao salvar configuração.");
      } finally {
        setPesosSaving(false);
      }
    });
  };

  const handleRecalcScore = (customerId: string) => {
    startTransition(async () => {
      try {
        const res = await recalcScore(customerId);
        if (res?.cliente) {
          setScores((prev) => ({ ...prev, [customerId]: res.cliente }));
          alert(`Score recalculado: ${res.cliente.score} (${res.cliente.classificacao}).`);
        }
      } catch (e: any) {
        alert(e?.message || "Erro ao recalcular score.");
      }
    });
  };

  const handleShowHistory = async (customerId: string) => {
    try {
      const res = await getScoreHistory(customerId);
      setScoreHistory(res?.history || []);
      setShowHistory(true);
    } catch (e) {
      alert("Erro ao carregar histórico.");
    }
  };

  const handleRentalStatus = (rent: any, status: string) => {
    if (!rent) return;
    startTransition(async () => {
      try {
        await setRentalStatus(rent.id, status);
        alert("Status da reserva atualizado.");
        window.location.reload();
      } catch (e: any) {
        alert(e?.message || "Erro ao atualizar status.");
      }
    });
  };

  const checkIsOverdue = (sub: any) => {
      if(!sub) return false;
      return new Date(sub.nextDueDate) < new Date();
  };

  const filteredCustomers = customers.filter((c: any) => {
      if (activeTab === 'OVERDUE') return checkIsOverdue(c.subscription);
      if (classFilter !== 'ALL' && scores[c.id]?.classificacao !== classFilter) return false;
      return true;
  });

  const gamesStats = useMemo(() => {
      const from = dateFrom || monthStartStr();
      const to = dateTo || todayStr();

      const isFut5 = (name: string) => /fut5|fut\s*5|futebol\s*5/i.test(name);
      const isFut7 = (name: string) => /fut7|fut\s*7|futebol\s*7/i.test(name);

      // Jogos lançados nas sessões de caixa (PDV/comandas), fonte da verdade
      const lancamentos: any[] = fieldRentalLancamentos || [];
      const filtered = lancamentos.filter((l: any) => l.day >= from && l.day <= to);

      // Inicializar todos os dias do período
      const dailySeries: Record<string, { day: string; fut5Count: number; fut7Count: number; totalCount: number; fut5Amount: number; fut7Amount: number; totalAmount: number }> = {};
      const cursor = new Date(from + 'T00:00:00');
      const last = new Date(to + 'T00:00:00');
      while (cursor <= last) {
          const key = toDateStr(cursor);
          dailySeries[key] = { day: key, fut5Count: 0, fut7Count: 0, totalCount: 0, fut5Amount: 0, fut7Amount: 0, totalAmount: 0 };
          cursor.setDate(cursor.getDate() + 1);
      }

      filtered.forEach((l: any) => {
          const d = dailySeries[l.day];
          if (d) {
              const qty = l.qty || 0;
              const amt = l.amount || 0;
              d.totalCount += qty;
              d.totalAmount += amt;
              if (isFut5(l.name)) { d.fut5Count += qty; d.fut5Amount += amt; }
              else if (isFut7(l.name)) { d.fut7Count += qty; d.fut7Amount += amt; }
          }
      });

      const fmt = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
      const series = Object.values(dailySeries).sort((a, b) => a.day.localeCompare(b.day));
      const sum = (pick: (d: any) => number) => series.reduce((acc, d) => acc + pick(d), 0);

      return {
          monthLabel: `${fmt(from)} a ${fmt(to)}`,
          totalGames: sum((d) => d.totalCount),
          totalAmount: sum((d) => d.totalAmount),
          fut5Count: sum((d) => d.fut5Count),
          fut7Count: sum((d) => d.fut7Count),
          fut5Amount: sum((d) => d.fut5Amount),
          fut7Amount: sum((d) => d.fut7Amount),
          dailySeries: series
      };
  }, [fieldRentalLancamentos, dateFrom, dateTo]);

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Clientes & Assinaturas</h1>
          <p className="text-gray-500 text-sm mt-1">CRM, Mensalidades e locação de horários (Mesas).</p>
        </div>
        <div className="flex gap-4">
            <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1">
                <button onClick={() => setActiveTab('ALL')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                    <UserIcon size={16}/> Todos
                </button>
                <button onClick={() => setActiveTab('OVERDUE')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'OVERDUE' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                    <AlertTriangle size={16}/> Vencidos
                </button>
            </div>
            <button onClick={() => openCustomerModal()} className="bg-mrts-blue text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 flex items-center gap-2 hover:bg-mrts-hover hover:-translate-y-0.5 transition-all">
                <Plus size={18} /> Novo Cliente
            </button>
            <button onClick={openScoreConfig} className="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md flex items-center gap-2 hover:bg-slate-800 hover:-translate-y-0.5 transition-all" title="Configurar pesos do Score">
                <Settings size={16} /> Score
            </button>
        </div>
      </div>

      {/* FILTRO POR CLASSIFICAÇÃO DO SCORE */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 mr-1">
              <Gauge size={15} className="text-mrts-blue" /> Score
          </span>
          <button onClick={() => setClassFilter('ALL')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${classFilter === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
              Todos
          </button>
          {CLASS_ORDER.map((c) => {
              const meta = CLASS_META[c];
              return (
                  <button key={c} onClick={() => setClassFilter(classFilter === c ? 'ALL' : c)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border ${classFilter === c ? meta.bg + ' ' + meta.color : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                      {meta.label}
                  </button>
              );
          })}
          {scoresLoading && <span className="text-[10px] text-gray-400 font-bold uppercase">Calculando…</span>}
      </div>

      {/* CARDS E GRÁFICOS DE JOGOS */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Trophy size={16} className="text-emerald-500" /> Jogos & Locações
          </h2>
          <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      title="Data inicial"
                      className="bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none w-40"
                  />
              </div>
              <span className="text-[10px] font-black text-gray-400 uppercase">até</span>
              <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      title="Data final"
                      className="bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none w-40"
                  />
              </div>
              <button
                  onClick={() => { setDateFrom(monthStartStr()); setDateTo(todayStr()); }}
                  className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 px-2 py-2 rounded-lg hover:bg-emerald-50 transition"
                  title="Voltar para o mês atual"
              >
                  Este mês
              </button>
          </div>
      </div>

      <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CARD: QUANTIDADE DE JOGOS */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-28 h-28 bg-emerald-500/10 rounded-full blur-3xl"></div>
              <div className="flex items-center justify-between mb-4">
                  <div className="w-11 h-11 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center">
                      <Trophy size={22} />
                  </div>
                  <span className="text-[10px] font-black text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg uppercase tracking-wider">{gamesStats.monthLabel}</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg uppercase tracking-wider">FUT5: {fmtCount(gamesStats.fut5Count)}</span>
                  <span className="text-[10px] font-black text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg uppercase tracking-wider">FUT7: {fmtCount(gamesStats.fut7Count)}</span>
                  <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg uppercase tracking-wider">Total: {fmtCount(gamesStats.totalGames)}</span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Jogos no Período</p>
              <h3 className="text-3xl font-black text-white tracking-tight">{fmtCount(gamesStats.totalGames)}</h3>
              <div className="w-full h-56 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={gamesStats.dailySeries} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                          <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: string) => String(Number(v.slice(-2)))} />
                          <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <RTooltip
                              formatter={(value: any, name: any) => [`${fmtCount(value)} jogo${Number(value) === 1 ? '' : 's'}`, name]}
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

          {/* CARD: VOLUME FINANCEIRO */}
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-28 h-28 bg-blue-500/10 rounded-full blur-3xl"></div>
              <div className="flex items-center justify-between mb-4">
                  <div className="w-11 h-11 bg-blue-50 text-mrts-blue rounded-xl flex items-center justify-center">
                      <DollarSign size={22} />
                  </div>
                  <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">{gamesStats.monthLabel}</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">FUT5: R$ {Number(gamesStats.fut5Amount || 0).toFixed(2).replace('.', ',')}</span>
                  <span className="text-[10px] font-black text-sky-600 bg-sky-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">FUT7: R$ {Number(gamesStats.fut7Amount || 0).toFixed(2).replace('.', ',')}</span>
                  <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">Total: R$ {Number(gamesStats.totalAmount || 0).toFixed(2).replace('.', ',')}</span>
              </div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Volume Financeiro</p>
              <h3 className="text-3xl font-black text-slate-800 tracking-tight">R$ {Number(gamesStats.totalAmount || 0).toFixed(2).replace('.', ',')}</h3>
              <div className="w-full h-56 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={gamesStats.dailySeries} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap compact-table">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase text-gray-500 tracking-wider">
                <th className="p-4 font-bold">Cliente</th>
                <th className="p-4 font-bold">Contato</th>
                <th className="p-4 font-bold">Plano Mensal</th>
                <th className="p-4 font-bold">Status Mensalidade</th>
                <th className="p-4 font-bold">Score</th>
                <th className="p-4 font-bold text-right">Perfil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredCustomers.map((customer: any) => {
                  const sub = customer.subscription;
                  const isOverdue = checkIsOverdue(sub);
                  const sc = scores[customer.id];

                  return (
                    <tr key={customer.id} className="hover:bg-blue-50/40 transition">
                        <td className="p-4">
                            <p className="font-bold text-slate-800 text-sm">{customer.name}</p>
                            {customer.rentals?.length > 0 && <span className="text-[10px] text-gray-400 font-medium">{customer.rentals.length} agendamentos</span>}
                        </td>
                        <td className="p-4 text-sm font-medium text-gray-500">
                            {customer.phone || "-"}
                        </td>
                        <td className="p-4">
                            {sub ? (
                                <span className="text-xs font-bold text-slate-700 bg-slate-50 border px-2 py-1.5 rounded-lg border-slate-200">
                                    {sub.planName} (R$ {sub.amount.toFixed(2).replace('.',',')})
                                </span>
                            ) : <span className="text-xs text-gray-400">Sem Plano</span>}
                        </td>
                        <td className="p-4">
                            {!sub ? <span className="text-gray-300">-</span> : isOverdue ? (
                                <span className="inline-flex items-center gap-1.5 text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-black uppercase"><AlertTriangle size={12}/> Vencida</span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold uppercase"><CheckCircle size={12}/>  Em Dia (Vence dia {sub.dueDate})</span>
                            )}
                        </td>
                        <td className="p-4">
                            {sc ? (
                                <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-2 py-1 rounded-lg border ${CLASS_META[sc.classificacao]?.bg || 'bg-gray-100 border-gray-200'} ${CLASS_META[sc.classificacao]?.color || 'text-gray-600'}`}>
                                    {sc.score} · {CLASS_META[sc.classificacao]?.label || sc.classificacao}
                                </span>
                            ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="p-4 text-right">
                            <button onClick={() => openCustomerModal(customer)} className="w-9 h-9 inline-flex items-center justify-center text-gray-400 bg-white border border-gray-200 hover:text-mrts-blue hover:border-mrts-blue rounded-xl shadow-sm transition hover:-translate-y-0.5 ml-auto">
                                <Edit3 size={16} />
                            </button>
                        </td>
                    </tr>
                  )
              })}
              {filteredCustomers.length === 0 && (
                  <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-500 font-medium">Nenhum cliente atende a este filtro.</td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: CUSTOMER DOSSIER */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 flex flex-col border border-gray-100 max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50 z-10 shrink-0">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                            <UserIcon size={22} className="text-mrts-blue" /> {selectedCustomer ? 'Dossiê do Cliente' : 'Novo Cliente'}
                        </h2>
                        {selectedCustomer && <p className="text-sm text-gray-500 mt-1 font-medium">{selectedCustomer.name}</p>}
                    </div>
                    <button onClick={() => setCustomerModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-100 rounded-full transition">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>
                
                <div className="flex flex-1 overflow-hidden">
                    {/* LEFT COLUMN: IDENTIFICATION & SUBSCRIPTION */}
                    <div className="w-1/2 border-r border-gray-100 p-6 overflow-y-auto flex flex-col gap-6">
                        {/* IDENTIFICATION FORM */}
                        <div className="flex flex-col gap-4">
                            <h3 className="font-bold text-slate-800 text-sm">Dados Cadastrais</h3>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Nome Completo</label>
                                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-bold text-slate-700"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Telefone/WhatsApp</label>
                                <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-medium text-slate-700"/>
                            </div>
                            
                            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl mt-2 flex flex-col gap-3">
                                <label className="flex items-center gap-2 font-bold text-sm text-mrts-blue cursor-pointer">
                                    <input type="checkbox" checked={formData.hasSubscription} onChange={e => setFormData({...formData, hasSubscription: e.target.checked})} className="w-4 h-4 rounded border-gray-300 text-mrts-blue focus:ring-mrts-blue"/>
                                    Vincular Plano / Assinatura
                                </label>
                                {formData.hasSubscription && (
                                    <div className="grid grid-cols-2 gap-3 mt-1">
                                        <div className="col-span-2">
                                            <input type="text" placeholder="Nome do plano" value={formData.planName} onChange={e => setFormData({...formData, planName: e.target.value})} className="w-full bg-white border border-blue-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 font-medium text-slate-700"/>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-gray-500 uppercase mb-1">Valor (R$)</label>
                                            <input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full bg-white border border-blue-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 font-bold text-slate-700"/>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-gray-500 uppercase mb-1">Dia Vencimento</label>
                                            <input type="number" min="1" max="31" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} className="w-full bg-white border border-blue-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 font-bold text-slate-700"/>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button disabled={isPending} onClick={handleSaveCustomer} className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl hover:bg-slate-800 transition shadow-md mt-2 disabled:opacity-50">
                                {isPending ? 'Salvando...' : 'Salvar Ficha'}
                            </button>

                            {selectedCustomer && (
                                <button disabled={isPending} onClick={handleDeleteCustomer} className="w-full bg-red-50 text-red-600 border border-red-100 font-bold py-2.5 rounded-xl hover:bg-red-100 transition mt-1 disabled:opacity-50 flex items-center justify-center gap-2">
                                    <Trash2 size={16} /> Excluir Cliente
                                </button>
                            )}
                        </div>
                        
                        {/* SUBSCRIPTION PAYMENTS SECTION */}
                        {selectedCustomer?.subscription && (
                            <div className="pt-6 border-t border-gray-100 mt-2">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><CreditCard size={14}/> Controle de Mensalidades </h3>
                                    {checkIsOverdue(selectedCustomer.subscription) ? (
                                         <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-black tracking-wide uppercase">Vencido</span>
                                    ) : <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold tracking-wide uppercase">Regular</span>}
                                </div>
                               
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-4 text-center">
                                    <p className="text-xs text-gray-500 font-medium">Próximo Vencimento</p>
                                    <p className={`text-xl font-black mt-1 ${checkIsOverdue(selectedCustomer.subscription) ? 'text-red-500' : 'text-slate-800'}`}>
                                        {new Date(selectedCustomer.subscription.nextDueDate).toLocaleDateString("pt-BR")}
                                    </p>
                                    <button disabled={isPending} onClick={() => handlePaySubscription(selectedCustomer.subscription.id, selectedCustomer.subscription.amount)} className="mt-3 w-full bg-green-500 hover:bg-green-600 text-white text-sm font-bold py-2 rounded-lg shadow-sm transition">
                                        Renovar / Pagar Agora
                                    </button>
                                </div>

                                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-2">
                                    {selectedCustomer.subscription.payments?.map((payment: any) => (
                                        editingPayment?.id === payment.id ? (
                                            <div key={payment.id} className="flex flex-col gap-2 p-2 bg-blue-50 border border-blue-100 rounded-xl">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-[10px] text-gray-500 uppercase mb-1">Valor (R$)</label>
                                                        <input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} className="w-full bg-white border border-blue-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none font-bold text-slate-700"/>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] text-gray-500 uppercase mb-1">Data</label>
                                                        <input type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm({...paymentForm, paymentDate: e.target.value})} className="w-full bg-white border border-blue-100 rounded-lg px-2 py-1.5 text-sm focus:outline-none font-medium text-slate-700"/>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingPayment(null)} className="flex-1 text-[10px] font-bold text-gray-500 bg-white border border-gray-200 rounded-lg py-1.5 hover:bg-gray-100 transition">Cancelar</button>
                                                    <button disabled={isPending} onClick={handleSavePaymentEdit} className="flex-1 text-[10px] font-bold text-white bg-mrts-blue rounded-lg py-1.5 hover:bg-mrts-hover transition disabled:opacity-50">Salvar</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div key={payment.id} className="text-xs flex justify-between p-2 pb-2 border-b border-gray-100 last:border-0 items-center">
                                                <span className="text-gray-500 font-medium">{new Date(payment.paymentDate).toLocaleDateString('pt-BR')}</span>
                                                <span className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-700">R$ {payment.amount.toFixed(2).replace('.',',')}</span>
                                                    <button onClick={() => openEditPayment(payment)} className="w-6 h-6 inline-flex items-center justify-center text-gray-400 hover:text-mrts-blue rounded-lg transition" title="Editar lançamento">
                                                        <Edit3 size={12} />
                                                    </button>
                                                    <button onClick={() => handleDeletePayment(payment)} className="w-6 h-6 inline-flex items-center justify-center text-gray-400 hover:text-red-500 rounded-lg transition" title="Excluir lançamento">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </span>
                                            </div>
                                        )
                                    ))}
                                    {selectedCustomer.subscription.payments?.length === 0 && <span className="text-xs text-gray-400 text-center block">Nenhum pagamento registrado</span>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: RENTALS / SCHEDULE */}
                    <div className="w-1/2 p-6 overflow-y-auto bg-slate-50/50">
                       {!selectedCustomer ? (
                           <div className="h-full flex items-center justify-center text-center px-8 flex-col text-gray-400">
                               <Calendar size={40} className="mb-4 opacity-50"/>
                               <p className="font-medium text-sm">Salve o cliente primeiro para liberar a ferramenta de Aluguéis e Agendamentos.</p>
                           </div>
                       ) : (
                           <div className="flex flex-col gap-6">
                               {/* SCORE & PERFIL */}
                               <div className="bg-slate-900 rounded-2xl p-5 shadow-xl border border-slate-800 flex flex-col gap-4">
                                   <div className="flex items-start justify-between">
                                       <div>
                                           <h3 className="font-bold text-slate-100 text-sm flex items-center gap-1.5"><Gauge size={16} className="text-sky-400"/> Score & Perfil</h3>
                                           {(() => { const sc = scores[selectedCustomer.id]; const meta = CLASS_META[sc?.classificacao]; return (
                                               <>
                                                   <div className="flex items-end gap-3 mt-3">
                                                       <span className="text-5xl font-black text-white tracking-tight">{sc ? sc.score : '—'}</span>
                                                       {meta && <span className={`mb-1.5 inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${meta.bg} ${meta.color}`}>{meta.label}</span>}
                                                   </div>
                                                   {sc?.recomendacao && <p className="text-xs text-slate-400 mt-2 leading-relaxed">{sc.recomendacao}</p>}
                                               </>
                                           ); })()}
                                       </div>
                                       <div className="flex flex-col gap-1.5 shrink-0">
                                           <button disabled={isPending} onClick={() => handleRecalcScore(selectedCustomer.id)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 bg-slate-800 border border-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-700 transition disabled:opacity-50" title="Recalcular score agora">
                                               <RefreshCw size={12}/> Recalcular
                                           </button>
                                           <button onClick={() => handleShowHistory(selectedCustomer.id)} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 bg-slate-800 border border-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-700 transition" title="Histórico de scores">
                                               <TrendingUp size={12}/> Histórico
                                           </button>
                                       </div>
                                   </div>

                                   {(() => { const sc = scores[selectedCustomer.id]; if (!sc) return (
                                       <div className="text-xs text-slate-500 font-medium py-2">Calculando score deste cliente…</div>
                                   ); return (
                                       <>
                                           <div className="grid grid-cols-3 gap-2">
                                               <div className="bg-slate-800/70 rounded-xl p-2.5 text-center">
                                                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Frequência</p>
                                                   <p className="text-sm font-black text-white mt-0.5">{sc.frequencia}</p>
                                               </div>
                                               <div className="bg-slate-800/70 rounded-xl p-2.5 text-center">
                                                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Ticket Bar</p>
                                                   <p className="text-sm font-black text-white mt-0.5">R$ {Number(sc.ticketBar || 0).toFixed(2).replace('.', ',')}</p>
                                               </div>
                                               <div className="bg-slate-800/70 rounded-xl p-2.5 text-center">
                                                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Gasto Total</p>
                                                   <p className="text-sm font-black text-white mt-0.5">R$ {Number(sc.gastoAcumulado || 0).toFixed(2).replace('.', ',')}</p>
                                               </div>
                                               <div className="bg-slate-800/70 rounded-xl p-2.5 text-center">
                                                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Última Reserva</p>
                                                   <p className="text-[10px] font-bold text-white mt-0.5">{sc.ultimaReserva ? new Date(sc.ultimaReserva).toLocaleDateString('pt-BR') : '—'}</p>
                                               </div>
                                               <div className="bg-slate-800/70 rounded-xl p-2.5 text-center">
                                                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Cancel. praz.</p>
                                                   <p className="text-sm font-black text-white mt-0.5">{sc.canceladosForaPrazo}</p>
                                               </div>
                                               <div className="bg-slate-800/70 rounded-xl p-2.5 text-center">
                                                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Faltas</p>
                                                   <p className="text-sm font-black text-white mt-0.5">{sc.faltas}</p>
                                               </div>
                                           </div>
                                           <div className="flex flex-col gap-2 mt-1">
                                               {sc.fatores?.map((f: any) => (
                                                   <div key={f.fator} className="flex items-center gap-2">
                                                       <span className="w-32 text-[9px] font-bold text-slate-400 uppercase tracking-wide shrink-0" title={f.motivo}>{f.rotulo}</span>
                                                       <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                           <div className="h-full rounded-full" style={{ width: `${f.normalizado}%`, background: f.normalizado >= 60 ? '#10b981' : f.normalizado >= 30 ? '#f59e0b' : '#ef4444' }} />
                                                       </div>
                                                       <span className="w-8 text-right text-[10px] font-black text-slate-300">{f.normalizado}</span>
                                                   </div>
                                               ))}
                                           </div>
                                       </>
                                   ); })()}
                               </div>

                               <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
                                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><Clock size={16}/> Agendar Espaço / Mesa</h3>
                                    
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">O que está alugando? (Ex: Mesa 5)</label>
                                        <input type="text" value={rentalResource} onChange={e => setRentalResource(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-mrts-blue text-sm font-medium text-slate-700"/>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                         <div className="col-span-3">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Data</label>
                                            <input type="date" value={rentalDate} onChange={e => setRentalDate(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-mrts-blue text-sm font-medium text-slate-700"/>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Hora Início</label>
                                            <input type="time" value={rentalStart} onChange={e => setRentalStart(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-mrts-blue text-sm font-bold text-slate-700"/>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Fim Estimado</label>
                                            <input type="time" value={rentalEnd} onChange={e => setRentalEnd(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-mrts-blue text-sm font-bold text-slate-700"/>
                                        </div>
                                         <div>
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Valor (R$)</label>
                                            <input type="number" step="0.01" value={rentalAmount} onChange={e => setRentalAmount(parseFloat(e.target.value) || 0)} className="w-full bg-blue-50/50 border border-mrts-blue/30 text-mrts-blue rounded-lg px-3 py-2 focus:outline-none focus:border-mrts-blue text-sm font-bold"/>
                                        </div>
                                    </div>
                                     <button disabled={isPending} onClick={() => editingRental ? handleSaveRentalEdit() : handleCreateRental()} className="w-full bg-mrts-blue text-white text-sm font-bold py-2.5 rounded-lg shadow-sm hover:bg-mrts-hover transition disabled:opacity-50 mt-1">
                                        {editingRental ? 'Salvar Alterações' : 'Confirmar Reserva'}
                                     </button>
                                     {editingRental && (
                                        <button disabled={isPending} onClick={() => { setEditingRental(null); setRentalResource(""); setRentalAmount(0); }} className="w-full text-[11px] font-bold text-gray-500 bg-white border border-gray-200 py-2 rounded-lg hover:bg-gray-100 transition">
                                            Cancelar Edição
                                        </button>
                                     )}
                               </div>

                               <div>
                                   <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 py-2"><Calendar size={14}/> Histórico de Locações</h3>
                                   <div className="flex flex-col gap-2">
                                        {selectedCustomer.rentals?.map((rent: any) => (
                                            <div key={rent.id} className="bg-white border text-left border-gray-200 rounded-xl p-3 flex flex-col gap-2 shadow-sm">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-800 text-xs">{rent.resource}</span>
                                                        <span className="text-[10px] text-gray-500 font-medium">
                                                            {new Date(rent.startTime).toLocaleDateString('pt-BR')} das {new Date(rent.startTime).getHours()}:{new Date(rent.startTime).getMinutes().toString().padStart(2, '0')} as {new Date(rent.endTime).getHours()}:{new Date(rent.endTime).getMinutes().toString().padStart(2, '0')}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-slate-600">R$ {rent.totalAmount.toFixed(2).replace('.',',')}</span>
                                                        <button onClick={() => openEditRental(rent)} className="w-6 h-6 inline-flex items-center justify-center text-gray-400 hover:text-mrts-blue rounded-lg transition" title="Editar locação">
                                                            <Edit3 size={13} />
                                                        </button>
                                                        <button onClick={() => handleDeleteRental(rent)} className="w-6 h-6 inline-flex items-center justify-center text-gray-400 hover:text-red-500 rounded-lg transition" title="Excluir locação">
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    {(() => {
                                                        const badge: Record<string, { label: string; cls: string }> = {
                                                            PENDING: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
                                                            CONFIRMED: { label: 'Confirmada', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
                                                            PAID: { label: 'Paga', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                                                            CANCELED: { label: 'Cancelada', cls: 'bg-red-100 text-red-700 border-red-200' },
                                                            NO_SHOW: { label: 'Falta', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
                                                        };
                                                        const b = badge[rent.status] || badge.PENDING;
                                                        return <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${b.cls}`}>{b.label}</span>;
                                                    })()}
                                                    <select
                                                        value={rent.status}
                                                        onChange={(e) => handleRentalStatus(rent, e.target.value)}
                                                        disabled={isPending}
                                                        className="text-[10px] font-bold text-slate-600 bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1 outline-none focus:border-mrts-blue disabled:opacity-50"
                                                        title="Alterar status da reserva"
                                                    >
                                                        <option value="PENDING">Pendente</option>
                                                        <option value="CONFIRMED">Confirmar</option>
                                                        <option value="PAID">Marcar paga</option>
                                                        <option value="CANCELED">Cancelar reserva</option>
                                                        <option value="NO_SHOW">No-show (falta)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        ))}
                                       {selectedCustomer.rentals?.length === 0 && <p className="text-xs text-center text-gray-400 py-4 font-medium">Nenhuma reserva localizada</p>}
                                   </div>
                               </div>
                           </div>
                       )}
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* MODAL: CONFIGURAÇÃO DE PESOS DO SCORE */}
      {showScoreConfig && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 flex flex-col border border-gray-100 max-h-[85vh] overflow-hidden">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50 shrink-0">
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                            <Settings size={18} className="text-mrts-blue" /> Configurar Score
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5 font-medium">Pesos de cada fator — a soma deve ser 100.</p>
                    </div>
                    <button onClick={() => setShowScoreConfig(false)} className="w-9 h-9 flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-100 rounded-full transition">
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>
                <div className="p-5 overflow-y-auto flex flex-col gap-2.5">
                    {pesosForm && Object.keys(FATOR_LABEL).map((key) => (
                        <div key={key} className="flex items-center justify-between gap-3">
                            <span className="text-sm font-bold text-slate-700 flex-1">{FATOR_LABEL[key]}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 font-medium">%</span>
                                <input
                                    type="number" min="0" max="100" step="1"
                                    value={pesosForm[key]}
                                    onChange={(e) => setPesosForm({ ...pesosForm, [key]: parseFloat(e.target.value) || 0 })}
                                    className="w-20 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-mrts-blue font-bold text-slate-700 text-right"
                                />
                            </div>
                        </div>
                    ))}
                    {pesosForm && (() => {
                        const soma: number = Object.values(pesosForm as Record<string, number>).reduce((a, b) => a + (b || 0), 0);
                        return (
                            <div className={`mt-2 px-4 py-2.5 rounded-xl border font-bold text-sm flex items-center justify-between ${Math.abs(soma - 100) <= 0.01 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                <span>Soma</span>
                                <span>{soma.toLocaleString('pt-BR')} / 100 {Math.abs(soma - 100) <= 0.01 ? '✓' : '✗'}</span>
                            </div>
                        );
                    })()}
                </div>
                <div className="p-5 pt-2 border-t border-gray-100 bg-gray-50 shrink-0">
                    <button disabled={pesosSaving} onClick={handleSaveScoreConfig} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition disabled:opacity-50">
                        {pesosSaving ? 'Salvando e recalculando…' : 'Salvar e recalcular todos'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL: HISTÓRICO DE SCORE */}
      {showHistory && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 flex flex-col border border-gray-100 max-h-[70vh] overflow-hidden">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50 shrink-0">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                        <TrendingUp size={18} className="text-mrts-blue" /> Histórico de Score
                    </h2>
                    <button onClick={() => setShowHistory(false)} className="w-9 h-9 flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-100 rounded-full transition">
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>
                <div className="p-5 overflow-y-auto flex flex-col gap-2">
                    {scoreHistory.length === 0 && <p className="text-sm text-gray-400 text-center font-medium py-4">Nenhum snapshot registrado ainda.</p>}
                    {scoreHistory.map((h, i) => {
                        const meta = CLASS_META[h.classificacao];
                        return (
                            <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-gray-200 rounded-xl">
                                <span className="text-xs text-gray-500 font-medium">{new Date(h.snapshotAt).toLocaleString('pt-BR')}</span>
                                <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-2 py-1 rounded-lg border ${meta?.bg || 'bg-gray-100 border-gray-200'} ${meta?.color || 'text-gray-600'}`}>
                                    {h.score} · {meta?.label || h.classificacao}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
      )}

    </div>
  );
}
