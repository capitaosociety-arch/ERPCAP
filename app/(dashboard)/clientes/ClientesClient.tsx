'use client';

import { useState, useTransition } from 'react';
import { Plus, Edit3, X, User as UserIcon, Calendar, CheckCircle, AlertTriangle, Clock, CreditCard, Trash2 } from 'lucide-react';
import { upsertCustomer, paySubscription, createRental, deleteCustomer } from '../../actions/customers';

export default function ClientesClient({ initialCustomers }: any) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, OVERDUE

  // Modals
  const [isCustomerModalOpen, setCustomerModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  
  // Forms
  const [formData, setFormData] = useState<any>({});
  
  const [isPending, startTransition] = useTransition();

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

  // Reserving Rental fields
  const [rentalResource, setRentalResource] = useState("");
  const [rentalDate, setRentalDate] = useState(new Date().toISOString().split('T')[0]);
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

  const checkIsOverdue = (sub: any) => {
      if(!sub) return false;
      return new Date(sub.nextDueDate) < new Date();
  };

  const filteredCustomers = customers.filter((c: any) => {
      if (activeTab === 'OVERDUE') return checkIsOverdue(c.subscription);
      return true;
  });

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
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase text-gray-500 tracking-wider">
                <th className="p-4 font-bold">Cliente</th>
                <th className="p-4 font-bold">Contato</th>
                <th className="p-4 font-bold">Plano Mensal</th>
                <th className="p-4 font-bold">Status Mensalidade</th>
                <th className="p-4 font-bold text-right">Perfil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredCustomers.map((customer: any) => {
                  const sub = customer.subscription;
                  const isOverdue = checkIsOverdue(sub);

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
                      <td colSpan={5} className="p-8 text-center text-gray-500 font-medium">Nenhum cliente atende a este filtro.</td>
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
                                        <div key={payment.id} className="text-xs flex justify-between p-2 pb-2 border-b border-gray-100 last:border-0 items-center">
                                            <span className="text-gray-500 font-medium">{new Date(payment.paymentDate).toLocaleDateString('pt-BR')}</span>
                                            <span className="font-bold text-slate-700">R$ {payment.amount.toFixed(2).replace('.',',')}</span>
                                        </div>
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
                                    <button disabled={isPending} onClick={handleCreateRental} className="w-full bg-mrts-blue text-white text-sm font-bold py-2.5 rounded-lg shadow-sm hover:bg-mrts-hover transition disabled:opacity-50 mt-1">
                                        Confirmar Reserva
                                    </button>
                               </div>

                               <div>
                                   <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 py-2"><Calendar size={14}/> Histórico de Locações</h3>
                                   <div className="flex flex-col gap-2">
                                       {selectedCustomer.rentals?.map((rent: any) => (
                                           <div key={rent.id} className="bg-white border text-left border-gray-200 rounded-xl p-3 flex justify-between items-center shadow-sm">
                                               <div className="flex flex-col">
                                                   <span className="font-bold text-slate-800 text-xs">{rent.resource}</span>
                                                   <span className="text-[10px] text-gray-500 font-medium">
                                                       {new Date(rent.startTime).toLocaleDateString('pt-BR')} das {new Date(rent.startTime).getHours()}:{new Date(rent.startTime).getMinutes().toString().padStart(2, '0')} as {new Date(rent.endTime).getHours()}:{new Date(rent.endTime).getMinutes().toString().padStart(2, '0')}
                                                   </span>
                                               </div>
                                               <span className="text-xs font-black text-slate-600">R$ {rent.totalAmount.toFixed(2).replace('.',',')}</span>
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

    </div>
  );
}
