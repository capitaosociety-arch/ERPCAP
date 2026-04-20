'use client'

import { useState } from 'react';
import { Plus, Search, Coffee, X, ShoppingBag, Eye, Banknote, QrCode, CreditCard, Receipt, Trash2 } from 'lucide-react';
import { createComanda, closeComanda, addItemToOrder, processPayment, removeItemFromOrder, deleteComandaAction } from '../../actions/comandas';

export default function ComandaBoard({ openOrders, products, openRegister }: { openOrders: any[], products: any[], openRegister?: any }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [comandaName, setComandaName] = useState("");
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [addingItemId, setAddingItemId] = useState<string | null>(null);
    const [productSearch, setProductSearch] = useState("");

    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [viewOrder, setViewOrder] = useState<any>(null);

    // Payment Modal State
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentOrder, setPaymentOrder] = useState<any>(null);
    const [paymentMethod, setPaymentMethod] = useState("PIX");
    const [paymentAmount, setPaymentAmount] = useState("");
    const [discountValue, setDiscountValue] = useState("");

    const handleCreate = async () => {
        if(!openRegister) return alert("Não é possível abrir comandas com o caixa fechado! Acesse o PDV para abrir o turno.");
        if(!comandaName.trim()) return;
        setLoading(true);
        await createComanda(comandaName.trim());
        setComandaName("");
        setIsModalOpen(false);
        setLoading(false);
    };

    const handleAddProductClick = (e: any, order: any) => {
        e.stopPropagation();
        if(!openRegister) return alert("Caixa fechado! Para lançar produtos, inicie o turno no balcão do PDV.");
        setSelectedOrder(order);
        setIsProductModalOpen(true);
    };

    const handleConfirmAddProduct = async (product: any) => {
        if(!selectedOrder) return;
        setAddingItemId(product.id);
        await addItemToOrder(selectedOrder.id, product.id, 1, product.price);
        setAddingItemId(null);
    };

    const handleViewComanda = (e: any, order: any) => {
        e.stopPropagation();
        setViewOrder(order);
        setIsViewModalOpen(true);
    };

    const handleGoToPayment = (order: any) => {
        if(!openRegister) return alert("Caixa fechado! Para receber pagamentos, inicie o turno no balcão do PDV.");
        setPaymentOrder(order);
        setIsViewModalOpen(false);
        
        // Calcula a dívida restante
        const totalPaid = order.payments?.reduce((acc: any, p: any) => acc + p.amount, 0) || 0;
        const balance = order.total - order.discount - totalPaid;
        
        setPaymentAmount(Math.max(0, balance).toFixed(2));
        setDiscountValue("");
        setPaymentMethod("PIX");
        setIsPaymentModalOpen(true);
    };

    const handleConfirmPayment = async () => {
        if (!paymentOrder || !paymentAmount) return;
        setLoading(true);
        await processPayment(paymentOrder.id, Number(paymentAmount), paymentMethod, Number(discountValue) || 0);
        setLoading(false);
        setIsPaymentModalOpen(false);
    };

    const handleRemoveItem = async (itemId: string) => {
        if (!confirm("Deseja realmente remover este item da comanda? Isso retornará o produto ao estoque.")) return;
        setLoading(true);
        try {
            await removeItemFromOrder(itemId);
        } catch (e: any) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteComanda = async (orderId: string) => {
        if (!confirm("ATENÇÃO: Deseja realmente CANCELAR toda esta comanda? Todos os itens lançados voltarão ao estoque e pagamentos parciais serão removidos. Esta ação não pode ser desfeita.")) return;
        setLoading(true);
        try {
            await deleteComandaAction(orderId);
            setIsViewModalOpen(false);
        } catch (e: any) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    };

    const filtered = openOrders.filter(o => (o.notes || "").toLowerCase().includes(search.toLowerCase()));
    const availableProducts = products.filter(p => p.stock && p.stock.quantity > 0);
    const filteredModalProducts = availableProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));
    const activeViewOrder = viewOrder ? openOrders.find(o => o.id === viewOrder.id) : null;
    const activePaymentOrder = paymentOrder ? openOrders.find(o => o.id === paymentOrder.id) : null; // Se ele ainda estiver em aberto, se fechou sumiu

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">Controle de Comandas</h1>
                  <p className="text-gray-500 text-sm mt-1">Abra comandas dinâmicas pelo nome do cliente ou da mesa.</p>
                </div>
                
                <div className="flex gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Buscar comanda..." 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="bg-white border-2 border-gray-100 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:border-mrts-blue focus:ring-0 outline-none w-full font-medium"
                        />
                    </div>
                    <button 
                    onClick={() => {
                        if(!openRegister) return alert("Caixa fechado! Para abrir turmas/comandas, inicie seu turno no caixa do PDV.");
                        setIsModalOpen(true);
                    }}
                    className={`flex shrink-0 w-11 h-11 md:w-auto items-center justify-center gap-2 text-white md:px-5 py-2.5 rounded-xl font-bold transition shadow-sm ${!openRegister ? 'bg-gray-400 cursor-not-allowed' : 'bg-mrts-blue hover:bg-mrts-hover'}`}
                    >
                        <Plus size={20} /> <span className="hidden md:inline">Nova Comanda</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {openOrders.length === 0 ? (
                    <div className="col-span-full border-2 border-dashed border-gray-200 bg-white text-center py-16 rounded-2xl text-gray-400 font-medium">
                        Nenhuma comanda aberta. <br/><br/>
                        <button onClick={() => setIsModalOpen(true)} className="text-mrts-blue font-bold hover:underline">Abrir Primeira</button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="col-span-full text-center py-10 text-gray-400 font-medium">
                        Nenhuma comanda localizada com este nome.
                    </div>
                ) : filtered.map(order => {
                    const orderPaid = order.payments?.reduce((acc: any, p: any) => acc + p.amount, 0) || 0;
                    const isPartial = orderPaid > 0;

                    return (
                    <div key={order.id} className="p-4 rounded-2xl border-2 bg-white border-gray-100 hover:border-mrts-blue shadow-soft transition cursor-pointer flex flex-col items-center justify-center gap-3 relative overflow-hidden group hover:-translate-y-1">
                        <div className="w-14 h-14 flex items-center justify-center rounded-2xl transition bg-blue-50 text-mrts-blue shadow-inner group-hover:scale-110">
                            <Coffee size={24} />
                        </div>
                        <div className="text-center pb-2">
                            <h3 className="font-bold text-lg text-gray-800 line-clamp-1">{order.notes || "Sem Nome"}</h3>
                            <p className={`text-xs font-bold px-2 py-0.5 rounded mt-1 inline-block ${isPartial ? 'bg-orange-500' : 'bg-green-500'} text-white`}>
                                {isPartial ? "PARCIALMENTE PAGO" : "EM ABERTO"}
                            </p>
                            <p className="text-sm text-gray-500 mt-2 font-bold">R$ {(order.total - order.discount).toFixed(2).replace('.', ',')}</p>
                        </div>
                        
                        <div className="absolute inset-0 bg-slate-900/95 text-white opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 backdrop-blur-sm z-10 p-3">
                            <button onClick={(e) => handleAddProductClick(e, order)} className="w-full bg-white text-slate-900 py-2.5 rounded-lg text-xs font-bold hover:bg-gray-100 transition line-clamp-1 truncate px-2">
                                + Add Produto
                            </button>
                            <button onClick={(e) => handleViewComanda(e, order)} className="w-full bg-blue-500 text-white py-2.5 rounded-lg text-xs font-bold hover:bg-blue-600 transition flex items-center justify-center gap-1.5 truncate px-2">
                                <Eye size={16} /> Ver Comanda
                            </button>
                        </div>
                    </div>
                )})}
            </div>

            {/* Modal de Abertura de Comanda... Omitindo o básico de cadastro */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <h2 className="text-xl font-bold mb-1 text-slate-800">Abrir Comanda</h2>
                        <input 
                            autoFocus
                            type="text" 
                            placeholder="Identificador (Ex: Mesa Externa 04)" 
                            value={comandaName}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            onChange={(e) => setComandaName(e.target.value)}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 outline-none focus:border-mrts-blue mt-4 mb-6 font-medium text-slate-700"
                        />
                        <div className="flex gap-3">
                            <button disabled={loading} onClick={() => setIsModalOpen(false)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl">Cancelar</button>
                            <button disabled={loading} onClick={handleCreate} className="flex-1 bg-mrts-blue text-white font-bold py-3 rounded-xl">{loading ? '...' : 'Criar'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Ver Detalhes da Comanda */}
            {isViewModalOpen && activeViewOrder && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[55] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[85vh] overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white z-10 shadow-sm relative">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <Coffee size={22} className="text-mrts-blue" /> Comanda: {activeViewOrder.notes}
                                </h2>
                            </div>
                            <button onClick={() => setIsViewModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full">
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>
                        
                        <div className="p-4 overflow-y-auto flex-1 bg-slate-50/50">
                            {activeViewOrder.items && activeViewOrder.items.length === 0 ? (
                                <div className="text-center py-10 text-gray-400 font-medium">Comanda vazia, adicione lançamentos.</div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {activeViewOrder.items?.map((item: any, idx: number) => (
                                        <div key={item.id || idx} className="bg-white p-4 rounded-2xl border border-gray-200 flex items-center justify-between shadow-sm group">
                                            <div className="flex-1">
                                                <p className="font-bold text-slate-800">{item.product?.name || "Produto Genérico"}</p>
                                                <p className="text-xs text-slate-400 mt-0.5">{item.quantity}x de R$ {item.unitPrice.toFixed(2).replace('.', ',')}</p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <p className="font-bold text-slate-800">R$ {item.subtotal.toFixed(2).replace('.', ',')}</p>
                                                <button 
                                                    disabled={loading}
                                                    onClick={() => handleRemoveItem(item.id)}
                                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                    title="Remover Item"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {activeViewOrder.payments && activeViewOrder.payments.length > 0 && (
                                <div className="mt-8 border-t-2 border-dashed border-gray-200 pt-6">
                                    <h3 className="font-bold text-sm text-gray-400 mb-4 px-2 uppercase tracking-wider">Histórico de Pagamentos (Parciais)</h3>
                                    <div className="flex flex-col gap-2">
                                        {activeViewOrder.payments.map((p: any) => (
                                            <div key={p.id} className="flex justify-between items-center px-4 py-3 bg-green-50 text-green-700 rounded-xl border border-green-200">
                                                <p className="font-bold text-sm">{p.method}</p>
                                                <p className="font-bold">R$ {p.amount.toFixed(2).replace('.',',')}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-5 border-t border-gray-100 bg-white shadow-[0_-10px_20px_rgba(0,0,0,0.02)] relative z-10 space-y-4">
                             <div className="flex justify-between items-center px-2">
                                 <span className="text-slate-500 font-bold text-sm">Total da Mesa:</span>
                                 <span className="text-3xl font-black text-mrts-blue">R$ {(activeViewOrder.total - activeViewOrder.discount).toFixed(2).replace('.', ',')}</span>
                             </div>
                             <div className="flex flex-wrap gap-3">
                                 <button onClick={() => { setIsViewModalOpen(false); handleAddProductClick({stopPropagation:()=>{} }, activeViewOrder); }} className="flex-1 bg-gray-100 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-gray-200 flex justify-center items-center gap-2">
                                    <Plus size={18}/> Item
                                 </button>
                                 <button onClick={() => handleDeleteComanda(activeViewOrder.id)} className="flex-1 border-2 border-red-100 text-red-500 font-bold py-3.5 rounded-xl hover:bg-red-50 transition flex justify-center items-center gap-2">
                                    <Trash2 size={18}/> Excluir
                                 </button>
                                 <button onClick={() => handleGoToPayment(activeViewOrder)} className="flex-[2] bg-slate-900 text-white font-black py-3.5 rounded-xl hover:bg-slate-800 transition">
                                    Pagar e Fechar
                                </button>
                             </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Lançar Produto Avulso (Mesmo de Antes...) */}
            {isProductModalOpen && selectedOrder && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[85vh] overflow-hidden">
                        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-white z-10 shadow-sm relative">
                            <h2 className="text-xl font-bold flex items-center gap-2"><ShoppingBag size={22} className="text-mrts-blue" /> Lançar Produto</h2>
                            <button onClick={() => { setIsProductModalOpen(false); setIsViewModalOpen(true); setViewOrder(selectedOrder); setProductSearch(""); }} className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full">
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="px-5 py-3 border-b border-gray-50 bg-white">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input 
                                    autoFocus
                                    type="text" 
                                    placeholder="Pesquisar produto..." 
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl py-2.5 pl-10 pr-4 focus:border-mrts-blue focus:bg-white outline-none transition font-medium text-sm"
                                />
                            </div>
                        </div>
                        
                        <div className="p-4 overflow-y-auto flex-1 bg-slate-50/50">
                            {filteredModalProducts.length === 0 ? (
                                <div className="text-center py-10 font-medium text-gray-400">Nenhum produto encontrado.</div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {filteredModalProducts.map(prod => (
                                        <div key={prod.id} className="bg-white p-4 rounded-2xl border flex items-center justify-between hover:border-mrts-blue">
                                            <div className="flex gap-4 items-center">
                                                <ShoppingBag className="text-gray-400" />
                                                <div>
                                                    <p className="font-bold text-slate-800">{prod.name}</p>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">Disponível em Estoque: {prod.stock?.quantity} un</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <p className="font-bold text-lg text-slate-800">R$ {prod.price.toFixed(2).replace('.',',')}</p>
                                                <button disabled={addingItemId === prod.id} onClick={() => handleConfirmAddProduct(prod)} className="w-11 h-11 rounded-xl bg-mrts-blue text-white flex items-center justify-center hover:scale-105">
                                                    {addingItemId === prod.id ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> : <Plus size={22} strokeWidth={3} />}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL FINANCEIRO E OPÇÕES GERAIS DE CAIXA */}
            {isPaymentModalOpen && activePaymentOrder && (() => {
                const totalPaid = activePaymentOrder.payments?.reduce((acc: any, p: any) => acc + p.amount, 0) || 0;
                const balance = Math.max(0, activePaymentOrder.total - activePaymentOrder.discount - totalPaid);

                return (
                <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[70] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 flex flex-col p-6">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-2xl font-black text-slate-800">Pagamento</h2>
                                <p className="text-sm text-gray-500 font-medium">Acerto financeiro - ({activePaymentOrder.notes})</p>
                            </div>
                            <button disabled={loading} onClick={() => { setIsPaymentModalOpen(false); setIsViewModalOpen(true); setViewOrder(activePaymentOrder); }} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200">
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Mesa Total</p>
                                <p className="text-xl font-black text-slate-800">R$ {activePaymentOrder.total.toFixed(2)}</p>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                                <p className="text-xs text-blue-500 font-bold uppercase tracking-wider mb-1">Falta Pagar</p>
                                <p className="text-xl font-black text-mrts-blue">R$ {balance.toFixed(2)}</p>
                            </div>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Desconto a aplicar (Opcional)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</span>
                                    <input type="number" placeholder="0.00" value={discountValue} onChange={e => setDiscountValue(e.target.value)} className="w-full border-2 border-gray-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-mrts-blue font-bold text-red-500" />
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Isso abaterá no valor da mesa para todos os próximos pagamentos.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Qual valor será recebido agora?</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</span>
                                    {/* Subtrai o desconto em tempo real se o usuario alterar ele, ou seja, mantem dinamico, senao deixa paymentAmount cru */}
                                    <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full border-2 border-mrts-blue rounded-xl py-4 pl-10 pr-4 outline-none ring-4 ring-mrts-blue/10 font-bold text-xl text-slate-800 bg-blue-50/50" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Forma de Pagamento</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setPaymentMethod("PIX")} className={`py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition ${paymentMethod === "PIX" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                        <QrCode size={18} /> PIX
                                    </button>
                                    <button onClick={() => setPaymentMethod("CREDIT")} className={`py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition ${paymentMethod === "CREDIT" ? "border-mrts-blue bg-blue-50 text-mrts-blue" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                        <CreditCard size={18} /> Crédito
                                    </button>
                                    <button onClick={() => setPaymentMethod("DEBIT")} className={`py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition ${paymentMethod === "DEBIT" ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                        <CreditCard size={18} /> Débito
                                    </button>
                                    <button onClick={() => setPaymentMethod("CASH")} className={`py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold border-2 transition ${paymentMethod === "CASH" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                                        <Banknote size={18} /> Dinheiro
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button disabled={loading} onClick={handleConfirmPayment} className="w-full bg-mrts-blue text-white font-black py-4 rounded-xl hover:bg-mrts-hover shadow-xl shadow-mrts-blue/30 transition text-lg flex items-center justify-center gap-2">
                            {loading ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div> : <><Receipt size={22} /> Confirmar Lançamento</>}
                        </button>
                    </div>
                </div>
            )})()}
        </div>
    )
}
