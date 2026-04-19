'use client';

import { useState, useTransition } from 'react';
import { processCheckoutAction, getOrderWithPayments, cancelOrderAction } from '../../actions/checkout';
import { processPayment, addItemToOrder } from '../../actions/comandas';
import { openGlobalCashRegister, closeGlobalCashRegister, getRegisterSummary } from '../../actions/caixa';
import { Check, Search, X, Receipt, QrCode, CreditCard, Banknote, ShoppingCart, Plus, ShoppingBag, Lock, Unlock } from 'lucide-react';

export default function PDVClient({ products, services = [], categories, user, openRegister }: any) {
  const [cart, setCart] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);

  // Shift Management State
  const [openVal, setOpenVal] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [closingVal, setClosingVal] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [registerSummary, setRegisterSummary] = useState<any>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  // UI State - Pagamentos
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [payLoading, setPayLoading] = useState(false);

  // UI State - Lançamento Posterior Avulso (Forgot Item)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);

  const virtualCategories = [...categories, { id: 'SERVICES', name: 'Serviços' }];
  const allItems = [
    ...products.map((p: any) => ({ ...p, isService: false })),
    ...services.map((s: any) => ({ ...s, isService: true, categoryId: 'SERVICES', iconUrl: '🛠️', stock: { quantity: '∞' } }))
  ];

  // Filtra em tempo real (Geral)
  const filteredProducts = allItems.filter((p: any) => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = activeCat ? p.categoryId === activeCat : true;
    if (p.isService) return matchSearch && matchCat;
    return matchSearch && matchCat && !!p.stock && p.stock.quantity > 0;
  });

  const addItem = (product: any) => {
    const existing = cart.find(c => c.product.id === product.id);
    if(existing) {
      setCart(cart.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const removeItem = (id: string) => {
    setCart(cart.filter((c) => c.product.id !== id));
  };

  const finalize = () => {
    if (cart.length === 0) return alert("Carrinho vazio!");
    
    startTransition(async () => {
      try {
        const res = await processCheckoutAction(cart);
        if(res.success) {
            setCart([]);
            setPaymentOrder(res.order);
            setPaymentAmount(res.order.total.toFixed(2));
            setDiscountValue("");
            setPaymentMethod("PIX");
            setIsPaymentModalOpen(true);
        }
      } catch (e) {
        alert("Erro ao tramitar pedido inicial de caixa.");
      }
    });
  };

  const handleConfirmPayment = async () => {
       if (!paymentOrder || !paymentAmount) return;
       setPayLoading(true);
       
       await processPayment(paymentOrder.id, Number(paymentAmount), paymentMethod, Number(discountValue) || 0);
       const updatedOrder = await getOrderWithPayments(paymentOrder.id);
       
       setPayLoading(false);

       if(updatedOrder?.status === "CLOSED") {
           setIsPaymentModalOpen(false);
           setSuccess(true);
           setTimeout(() => setSuccess(false), 3000);
       } else if (updatedOrder) {
           setPaymentOrder(updatedOrder);
           setDiscountValue("");
           
           const totalPaid = updatedOrder.payments?.reduce((acc: any, p: any) => acc + p.amount, 0) || 0;
           const balance = updatedOrder.total - updatedOrder.discount - totalPaid;
           setPaymentAmount(Math.max(0, balance).toFixed(2));
       }
  };

  const handleCancelPaymentOperation = async () => {
      if (!paymentOrder) return;
      if (!window.confirm("Deseja cancelar esta operação? Os itens serão devolvidos ao estoque e a venda de balcão será encerrada.")) return;
      
      setPayLoading(true);
      try {
          await cancelOrderAction(paymentOrder.id);
          setIsPaymentModalOpen(false);
          setPaymentOrder(null);
          // Opcional: recarregar ou avisar
      } catch (e: any) {
          alert("Erro ao cancelar: " + e.message);
      }
      setPayLoading(false);
  };

  // Botao Magico para retocar pedido caso esqueceram algo
  const handleConfirmAddProduct = async (product: any) => {
      if(!paymentOrder) return;
      setAddingItemId(product.id);
      
      // Adiciona o lancamento
      await addItemToOrder(paymentOrder.id, product.id, 1, product.price, product.isService);
      
      // Busca fresco e recalcula tudo
      const updatedOrder = await getOrderWithPayments(paymentOrder.id);
      if(updatedOrder) {
          setPaymentOrder(updatedOrder);
          const totalPaid = updatedOrder.payments?.reduce((acc: any, p: any) => acc + p.amount, 0) || 0;
          const balance = updatedOrder.total - updatedOrder.discount - totalPaid;
          setPaymentAmount(Math.max(0, balance).toFixed(2));
      }
      setAddingItemId(null);
  };

  const total = cart.reduce((acc, item) => acc + (item.product.price * item.quantity), 0);

  const handleOpenTurno = async () => {
    if(!openVal) return alert('Insira o fundo de troco!');
    setLoadingAction(true);
    try { await openGlobalCashRegister(Number(openVal)); }
    catch(e: any) { alert(e.message); }
    setLoadingAction(false);
  };

  const handleOpenCloseModal = async () => {
    setIsCloseModalOpen(true);
    setIsLoadingSummary(true);
    try {
        const summary = await getRegisterSummary(openRegister.id);
        setRegisterSummary(summary);
    } catch(e) {
        console.error(e);
    } finally {
        setIsLoadingSummary(false);
    }
  };

  const handleCloseTurno = async () => {
    if(!closingVal) return alert('Insira a verificação de sangria final em dinheiro!');
    setLoadingAction(true);
    try { 
        await closeGlobalCashRegister(openRegister.id, Number(closingVal), closingNotes); 
        setIsCloseModalOpen(false); 
        setClosingVal(''); 
        setClosingNotes('');
        setRegisterSummary(null);
    }
    catch(e: any) { alert(e.message); }
    setLoadingAction(false);
  };

  return (
    <div className="flex flex-col lg:flex-row h-[85vh] gap-6 animate-in fade-in duration-500 relative">
      
      {success && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-500 text-white px-8 py-4 rounded-full font-bold shadow-2xl flex items-center gap-3 z-50 animate-in slide-in-from-top-10 border-4 border-white/20">
          <Check size={24} /> PDV: Transação Fechada com Sucesso!
        </div>
      )}

      {/* BLOCK SCREEN: SHIFT CLOSED */}
      {!openRegister && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-4 rounded-3xl">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center border-4 border-red-100 flex flex-col items-center animate-in zoom-in">
              <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-6">
                <Lock size={40} strokeWidth={2.5}/>
              </div>
              <h2 className="text-2xl font-black text-slate-800 mb-2">Turno Fechado</h2>
              <p className="text-gray-500 font-medium text-sm mb-8">Nenhum fluxo de caixa aberto encontrado para iniciar vendas hoje. Insira o valor de fundo de troco para liberar o balcão.</p>
              
              <div className="w-full">
                 <div className="relative mb-4">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                    <input autoFocus type="number" value={openVal} onChange={e => setOpenVal(e.target.value)} placeholder="0.00" className="w-full border-2 border-gray-200 focus:border-red-400 rounded-xl py-4 pl-12 pr-4 outline-none font-bold text-slate-800 text-xl text-center"/>
                 </div>
                 <button disabled={loadingAction} onClick={handleOpenTurno} className="w-full bg-red-500 hover:bg-red-600 text-white font-black py-4 rounded-xl shadow-lg shadow-red-500/30 transition shadow-none disabled:opacity-50 flex items-center justify-center gap-2">
                    {loadingAction ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> : <><Unlock size={22} /> ABRIR CAIXA DO DIA</>}
                 </button>
              </div>
          </div>
        </div>
      )}

      {/* Esquerda: Menu do Catálogo PDV Rápido */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden border border-gray-100 bg-white p-4 rounded-3xl shadow-sm">
        
        <div className="flex gap-2 w-full p-2 bg-gray-50 rounded-2xl items-center mb-2">
           <Search size={20} className="text-gray-400 ml-2 shrink-0"/>
           <input 
            type="text" 
            placeholder="Caixa Livre: Buscar produto..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent p-2 focus:outline-none placeholder-gray-400 font-medium"
           />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 shrink-0 hide-scrollbar">
          <button 
            onClick={() => setActiveCat(null)}
            className={`px-5 py-2 rounded-xl transition font-bold text-sm whitespace-nowrap shadow-sm ${!activeCat ? 'bg-slate-900 text-white' : 'bg-gray-100 text-slate-700 hover:bg-gray-200'}`}
          >
            Todos
          </button>
          {virtualCategories.map((c: any) => (
            <button 
              key={c.id} onClick={() => setActiveCat(c.id)}
              className={`px-5 py-2 rounded-xl transition font-bold text-sm whitespace-nowrap shadow-sm ${activeCat === c.id ? 'bg-slate-900 text-white' : 'bg-gray-100 text-slate-700 hover:bg-gray-200'}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-10">
          {filteredProducts.length === 0 ? (
              <div className="col-span-full py-10 text-center text-gray-400 font-bold">Nenhum produto cadastrado com estoque &gt; 0.</div>
          ) : filteredProducts.map((product: any) => (
            <div key={product.id} onClick={() => addItem(product)} className="bg-slate-50 p-4 rounded-2xl cursor-pointer border-2 border-transparent hover:border-mrts-blue hover:shadow-lg transition transform hover:-translate-y-1 group relative">
               <span className="absolute top-2 right-2 bg-mrts-blue text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-sm">
                 {product.isService ? 'SERVIÇO' : `ESTOQUE ${product.stock?.quantity}`}
               </span>
              <div className="w-full h-20 bg-white rounded-xl mb-3 flex items-center justify-center text-4xl shadow-sm group-hover:bg-blue-50 transition">
                {product.iconUrl || '🛍️'}
              </div>
              <h3 className="font-bold text-slate-800 text-sm line-clamp-2 leading-tight">{product.name}</h3>
              <p className="text-mrts-blue font-black mt-2 text-lg tracking-tight">
                <span className="text-xs">R$</span> {product.price.toFixed(2).replace('.', ',')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Direita: Carrinho do Caixa Rápido */}
      <div className="w-full lg:w-[420px] bg-white border border-gray-100 rounded-3xl flex flex-col shadow-xl shrink-0">
        <div className="p-5 border-b border-gray-100 bg-mrts-blue rounded-t-3xl text-white flex justify-between items-center shadow-inner">
          <div>
              <h2 className="font-black text-xl flex items-center gap-2"><ShoppingCart size={22}/> Balcão Livre</h2>
              <p className="text-xs text-blue-100 mt-1 uppercase font-bold tracking-widest">{user?.name}</p>
          </div>
          <div className="flex items-center gap-2">
              {cart.length > 0 && (
                  <button onClick={() => setCart([])} className="bg-white/20 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm" title="Limpar carrinho e cancelar venda">
                     <X size={14} strokeWidth={3}/> Cancelar
                  </button>
              )}
              <button onClick={handleOpenCloseModal} className="bg-blue-900/40 hover:bg-slate-900 border border-white/10 hover:border-transparent text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm">
                 <Lock size={14}/> Fechar Turno
              </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-3 border-2 border-dashed border-gray-200 rounded-2xl">
              <ShoppingCart size={48} className="text-gray-200" />
              <p className="text-sm font-bold text-gray-400">Passe os produtos para iniciar</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.product.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100 shadow-sm transition hover:shadow-md">
                
                <div className="w-10 h-10 bg-slate-50 rounded-lg flex justify-center items-center mr-3 shrink-0 text-gray-500 font-bold border border-gray-100">
                  {item.quantity}x
                </div>

                <div className="flex-1 min-w-0 pr-2">
                  <p className="font-bold text-slate-800 text-sm truncate">{item.product.name}</p>
                  <p className="text-xs font-semibold text-mrts-blue mt-0.5">R$ {item.product.price.toFixed(2).replace('.',',')}</p>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="font-black text-slate-800 text-sm">R$ {(item.quantity * item.product.price).toFixed(2).replace('.',',')}</span>
                  <button onClick={() => removeItem(item.product.id)} className="text-red-400 hover:text-white bg-red-50 hover:bg-red-500 p-2 rounded-lg transition shadow-sm" title="Remover">
                    <X size={16} strokeWidth={3}/>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 bg-white rounded-b-3xl border-t-2 border-dashed border-gray-200 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-10 relative">
          <div className="flex justify-between text-gray-500 mb-2 font-medium text-sm">
            <span>Volume Lançado</span>
            <span>{cart.reduce((mem, it)=> mem + it.quantity,0)} un</span>
          </div>
          <div className="flex justify-between text-3xl font-black text-slate-800 mb-6 py-2">
            <span>R$</span>
            <span className="text-mrts-blue">{total.toFixed(2).replace('.', ',')}</span>
          </div>
          <button 
            onClick={finalize} 
            disabled={isPending || cart.length === 0}
            className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-lg shadow-xl shadow-slate-900/30 hover:bg-slate-800 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none flex items-center justify-center gap-2"
          >
            {isPending ? 'GERANDO ACERTO...' : <><Receipt size={22}/> IR PARA O PAGAMENTO</>}
          </button>
        </div>
      </div>

      {/* MODAL Lançar Produto Extra na Hora do Pagamento (Forgot Item) */}
      {isProductModalOpen && paymentOrder && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[85vh] overflow-hidden border border-gray-100">
                  <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white z-10 shadow-sm relative">
                      <div>
                          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                              <ShoppingBag size={22} className="text-mrts-blue" /> Correção de Pedido
                          </h2>
                          <p className="text-sm text-gray-500 mt-1 font-medium">Bipar item esquecido no balcão</p>
                      </div>
                      <button onClick={() => { setIsProductModalOpen(false); }} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition">
                          <X size={20} className="text-gray-500" />
                      </button>
                  </div>
                  
                  <div className="p-4 overflow-y-auto flex-1 bg-slate-50/50">
                      {filteredProducts.length === 0 ? (
                          <div className="text-center py-10 font-medium text-gray-400">Nenhum produto cadastrado com estoque em abundância.</div>
                      ) : (
                          <div className="flex flex-col gap-3">
                              {filteredProducts.map((prod: any) => (
                                  <div key={prod.id} className="bg-white p-4 rounded-2xl border border-gray-200 flex items-center justify-between shadow-sm hover:border-mrts-blue transition">
                                      <div className="flex items-center gap-4">
                                          <div className="w-12 h-12 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center">
                                              <ShoppingBag size={24} />
                                          </div>
                                          <div>
                                              <p className="font-bold text-slate-800 line-clamp-1">{prod.name}</p>
                                              <p className="text-xs text-mrts-blue font-bold mt-0.5" title="Disponibilidade Real">Estoque: {prod.stock?.quantity} un</p>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-4">
                                          <div className="text-right">
                                              <p className="font-bold text-lg text-slate-800">R$ {prod.price.toFixed(2).replace('.',',')}</p>
                                          </div>
                                          <button 
                                              disabled={addingItemId === prod.id}
                                              onClick={() => handleConfirmAddProduct(prod)}
                                              className="w-11 h-11 rounded-xl bg-mrts-blue text-white flex items-center justify-center hover:scale-105 transition shadow-sm disabled:opacity-50"
                                          >
                                              {addingItemId === prod.id ? (
                                                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                                              ) : (
                                                  <Plus size={22} strokeWidth={3} />
                                              )}
                                          </button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
                  
                  <div className="p-5 border-t border-gray-100 bg-white">
                       <button onClick={() => setIsProductModalOpen(false)} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 shadow-md transition text-sm">
                          Voltar para Janela de Pagamento
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL FINANCEIRO INTELIGENTE (CAIXA RÁPIDO E PARCIAIS) */}
      {isPaymentModalOpen && paymentOrder && (() => {
        const totalPaid = paymentOrder.payments?.reduce((acc: any, p: any) => acc + p.amount, 0) || 0;
        const balance = Math.max(0, paymentOrder.total - paymentOrder.discount - totalPaid);

        return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 flex flex-col p-6 border border-gray-100">
                <div className="flex justify-between items-start mb-6 border-b border-gray-100 pb-4">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                           <Banknote size={28} className="text-green-500"/> Acerto Financeiro
                        </h2>
                        <p className="text-sm text-gray-500 font-medium mt-1">Lançado via Balcão / Operador: {user?.name}</p>
                    </div>
                    <button onClick={handleCancelPaymentOperation} className="w-10 h-10 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-500 rounded-full transition" title="Cancelar Venda e Estornar Estoque">
                        <X size={20} />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Total Consumido</p>
                        <p className="text-2xl font-black text-slate-800">R$ {(paymentOrder.total).toFixed(2).replace('.', ',')}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-4 shadow-sm">
                        <p className="text-xs text-green-600 font-bold uppercase tracking-wider mb-1">Cobrar do Cliente</p>
                        <p className="text-2xl font-black text-green-700">R$ {balance.toFixed(2).replace('.', ',')}</p>
                    </div>
                </div>

                {paymentOrder.payments && paymentOrder.payments.length > 0 && (
                     <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-200">
                         <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Histórico Pago (Parcial)</p>
                         {paymentOrder.payments.map((p: any) => (
                             <div key={p.id} className="flex justify-between items-center text-sm font-bold text-gray-700 py-1">
                                 <span>{p.method}</span>
                                 <span>+ R$ {p.amount.toFixed(2).replace('.', ',')}</span>
                             </div>
                         ))}
                     </div>
                )}

                <div className="space-y-4 mb-8">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Desconto Opcional (Se Abatimento)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</span>
                            <input type="number" placeholder="0.00" value={discountValue} onChange={e => setDiscountValue(e.target.value)} className="w-full border-2 border-gray-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-mrts-blue font-bold text-red-500 bg-white" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Valor sendo quitado nesta passagem</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</span>
                            <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full border-2 border-green-500 rounded-xl py-4 pl-10 pr-4 outline-none ring-4 ring-green-500/10 font-bold text-2xl text-slate-800 bg-green-50/30" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-3">Método da Transação</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setPaymentMethod("PIX")} className={`py-4 px-4 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition ${paymentMethod === "PIX" ? "border-green-500 bg-green-50 text-green-700 shadow-md transform -translate-y-0.5" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                <QrCode size={20} /> PIX
                            </button>
                            <button onClick={() => setPaymentMethod("CREDIT")} className={`py-4 px-4 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition ${paymentMethod === "CREDIT" ? "border-mrts-blue bg-blue-50 text-mrts-blue shadow-md transform -translate-y-0.5" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                <CreditCard size={20} /> Crédito
                            </button>
                            <button onClick={() => setPaymentMethod("DEBIT")} className={`py-4 px-4 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition ${paymentMethod === "DEBIT" ? "border-purple-500 bg-purple-50 text-purple-700 shadow-md transform -translate-y-0.5" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                <CreditCard size={20} /> Débito
                            </button>
                            <button onClick={() => setPaymentMethod("CASH")} className={`py-4 px-4 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition ${paymentMethod === "CASH" ? "border-orange-500 bg-orange-50 text-orange-700 shadow-md transform -translate-y-0.5" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                <Banknote size={20} /> Dinheiro
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 mt-auto flex-col sm:flex-row">
                    <div className="flex gap-3 w-full">
                        <button disabled={payLoading} onClick={() => setIsProductModalOpen(true)} className="flex-[1.5] font-bold text-mrts-blue bg-blue-50 border border-blue-100 hover:bg-blue-100 py-4 rounded-xl transition flex justify-center items-center gap-2 shadow-sm text-sm">
                           <Plus size={18} strokeWidth={3} /> ADD ITEM
                        </button>
                        <button disabled={payLoading} onClick={handleCancelPaymentOperation} className="flex-1 font-bold text-red-500 hover:text-white hover:bg-red-500 py-4 border-2 border-red-200 rounded-xl transition text-sm">
                            Cancelar Venda
                        </button>
                    </div>
                    <button disabled={payLoading} onClick={handleConfirmPayment} className="w-full sm:flex-[2.5] bg-green-500 text-white font-black py-4 rounded-xl hover:bg-green-600 shadow-xl shadow-green-500/30 transition flex items-center justify-center gap-2">
                        {payLoading ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> : <><Receipt size={22} /> Confirmar</>}
                    </button>
                </div>
            </div>
        </div>
      )})()}

      {/* MODAL FECHAR TURNO RECOMPILADO */}
      {isCloseModalOpen && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl animate-in zoom-in flex flex-col overflow-hidden border border-gray-100 max-h-[90vh]">
                  <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-slate-900 text-white">
                      <h2 className="text-xl font-black flex items-center gap-2">
                          <Lock size={22} className="text-red-400" /> Fechamento de Caixa: Auditoria de Cego
                      </h2>
                      <button disabled={loadingAction} onClick={() => { setIsCloseModalOpen(false); setRegisterSummary(null); }} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition">
                          <X size={16} />
                      </button>
                  </div>
                  
                  <div className="p-6 flex-1 overflow-y-auto bg-slate-50">
                      {isLoadingSummary ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                           <div className="w-10 h-10 border-4 border-gray-200 border-t-mrts-blue rounded-full animate-spin mb-4"></div>
                           <p className="font-bold">Analisando atividades do turno...</p>
                        </div>
                      ) : registerSummary ? (
                        <div className="space-y-6">
                            {/* Validador de Comandas Abertas */}
                            {registerSummary.openOrdersCount > 0 ? (
                                <div className="bg-red-50 border-2 border-red-500 rounded-2xl p-6 text-center animate-in fade-in">
                                    <Lock size={48} className="text-red-500 mx-auto mb-4" />
                                    <h3 className="text-2xl font-black text-red-700 mb-2">Bloqueio Operacional Intransponível</h3>
                                    <p className="text-red-600 font-medium mb-4">Constam <b>{registerSummary.openOrdersCount} comanda(s) ou venda(s) avulsas</b> ativas no sistema de gerenciamento. É terminantemente proibido realizar o encerramento do caixa com saldo de operações pendentes.</p>
                                    <p className="text-sm text-red-500 bg-red-100 py-3 rounded-lg font-bold">FECHE A TELA, EFETUE AS COBRANÇAS EM ABERTO OU RETIRE AS VENDAS PENDENTES.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4">
                                    <div className="bg-white border text-center border-gray-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-blue-500 to-green-500 left-0"></div>
                                        <h3 className="text-lg font-bold text-slate-800 mb-1">Apuração Bruta de Receitas</h3>
                                        <p className="text-4xl font-black text-slate-900">R$ {registerSummary.sumAllPayments.toFixed(2).replace('.', ',')}</p>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Tabela Resumo Pagamentos */}
                                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                                            <h4 className="text-sm uppercase tracking-wider font-bold text-gray-500 mb-6 flex items-center gap-2"><CreditCard size={18}/> Receita por Métodos Faturados</h4>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-200">
                                                   <span className="font-bold text-slate-700">Fundo de Troco Operacional</span>
                                                   <span className="font-black text-gray-500">R$ {registerSummary.openingBal.toFixed(2).replace('.', ',')}</span>
                                                </div>
                                                {registerSummary.payments.map((p: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-center py-2 border-b border-dashed border-gray-200">
                                                        <span className="font-bold text-slate-700">{p.methodName}</span>
                                                        <span className="font-black text-green-600">+ R$ {p.amount.toFixed(2).replace('.', ',')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-8 bg-slate-900 text-white rounded-xl p-5 border border-slate-700 shadow-inner ring-4 ring-slate-900/5">
                                                <p className="text-[11px] font-bold text-green-400 mb-1 uppercase tracking-wider">Dinheiro Em Gaveta Esperado</p>
                                                <p className="text-3xl font-black flex items-center gap-2"><Banknote size={28}/> R$ {registerSummary.expectedCashInDrawer.toFixed(2).replace('.', ',')}</p>
                                                <p className="text-xs text-gray-400 mt-2 font-medium leading-relaxed">Este é o montante consolidado obrigatório de numerário orgânico. Diferenças não são toleradas no batimento.</p>
                                            </div>
                                        </div>

                                        {/* Tabela Resumo Produtos */}
                                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col">
                                            <h4 className="text-sm uppercase tracking-wider font-bold text-gray-500 mb-6 flex items-center gap-2"><ShoppingBag size={18}/> Inventário Transferido (Sintético)</h4>
                                            <div className="overflow-y-auto flex-1 pr-2 space-y-2 relative h-64 hide-scrollbar">
                                                <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-white to-transparent pointer-events-none z-10"></div>
                                                <div className="absolute bottom-0 left-0 w-full h-4 bg-gradient-to-t from-white to-transparent pointer-events-none z-10"></div>
                                                {registerSummary.productsSold.length === 0 && <p className="text-sm text-gray-400 italic text-center py-10 font-bold">Nenhum espelho de estoque consumido.</p>}
                                                {registerSummary.productsSold.map((prod: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-center bg-slate-50/80 p-3 rounded-xl border border-gray-100 hover:border-mrts-blue transition group">
                                                        <div className="flex-1 min-w-0 pr-3">
                                                            <p className="font-bold text-slate-800 text-sm truncate">{prod.name}</p>
                                                            <p className="text-[11px] uppercase tracking-wide text-mrts-blue font-black mt-0.5">{prod.quantity} volumes líquidos</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="font-black text-slate-900 text-sm group-hover:text-mrts-blue transition">R$ {prod.total.toFixed(2).replace('.', ',')}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Formulário Input Fechamento Cego */}
                                    <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-8 relative shadow-sm">
                                        <label className="block text-sm font-black text-slate-800 uppercase tracking-wider mb-2">Declaração de Sangria Física em Moeda/Notas</label>
                                        <p className="text-xs text-gray-500 font-medium mb-6">Insira abaixo o subtotal matemático das notas encontradas no cofre. A diferença estrita deverá bater 0 (zero).</p>
                                        <div className="relative mb-6">
                                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 font-black text-2xl">R$</span>
                                            <input autoFocus type="number" value={closingVal} onChange={e => setClosingVal(e.target.value)} placeholder="0.00" className="w-full border-2 border-gray-300 focus:border-slate-900 hover:border-gray-400 rounded-xl py-5 pl-16 pr-4 outline-none font-black text-slate-800 text-4xl shadow-sm transition"/>
                                        </div>
                                        
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Observações Adicionais (Opcional)</label>
                                        <textarea value={closingNotes} onChange={e => setClosingNotes(e.target.value)} placeholder="Justifique sobras, faltas ou deixe notas para a gestão..." className="w-full border-2 border-gray-200 focus:border-slate-900 rounded-xl p-4 outline-none font-medium text-slate-700 text-sm h-24 resize-none transition"/>
                                    </div>
                                </div>
                            )}
                        </div>
                      ) : null}
                  </div>
                  
                  <div className="p-6 border-t border-gray-200 bg-white shadow-[0_-5px_15px_rgba(0,0,0,0.02)] relative z-20">
                      {registerSummary?.openOrdersCount > 0 ? (
                          <button onClick={() => { setIsCloseModalOpen(false); setRegisterSummary(null); }} className="w-full bg-slate-100 text-slate-700 font-black py-4 rounded-xl hover:bg-slate-200 transition uppercase tracking-wider text-sm shadow-sm">
                              Retornar as Cobranças ao Balcão
                          </button>
                      ) : (
                          <div className="flex gap-4">
                              <button disabled={loadingAction} onClick={() => { setIsCloseModalOpen(false); setRegisterSummary(null); }} className="flex-1 font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100 py-4 rounded-xl transition text-sm uppercase tracking-wide">
                                  Interromper Fechamento
                              </button>
                              <button disabled={loadingAction || !registerSummary} onClick={handleCloseTurno} className="flex-[2] bg-slate-900 text-white font-black flex justify-center items-center gap-3 py-4 rounded-xl shadow-xl shadow-slate-900/30 hover:bg-slate-800 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:transform-none disabled:shadow-none uppercase tracking-wide text-sm">
                                  {loadingAction ? <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> : <><Lock strokeWidth={3} size={20} /> Autenticar Auditoria de Integridade</>}
                              </button>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
