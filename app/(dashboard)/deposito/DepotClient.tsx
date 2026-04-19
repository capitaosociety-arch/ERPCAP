'use client'

import { useState } from 'react';
import { Search, Warehouse, ArrowRightLeft, PackagePlus, AlertTriangle, X, Check, Box, Clock, ShieldCheck, ThumbsDown } from 'lucide-react';
import { addDepotStock, requestTransfer, authorizeTransfer, rejectTransfer, adjustDepotStockLoss, directTransfer } from '../../actions/depot';

export default function DepotClient({ 
    initialInventory, 
    initialRequests, 
    userRole 
}: { 
    initialInventory: any[], 
    initialRequests: any[], 
    userRole: string 
}) {
    const [activeTab, setActiveTab] = useState<'inventory' | 'requests'>('inventory');
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);

    // Modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [isLossModalOpen, setIsLossModalOpen] = useState(false);
    const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
    
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [actionQty, setActionQty] = useState('');
    const [actionNotes, setActionNotes] = useState('');

    const isAdmin = userRole === 'ADMIN';
    const isManager = userRole === 'MANAGER';
    const canAuthorize = isAdmin || isManager;

    const filtered = initialInventory.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        (p.code && p.code.toLowerCase().includes(search.toLowerCase()))
    );

    const pendingRequests = initialRequests.filter(r => r.status === 'PENDING');
    const processedRequests = initialRequests.filter(r => r.status !== 'PENDING');

    const openAddModal = (p: any) => { setSelectedProduct(p); setActionQty(''); setActionNotes(''); setIsAddModalOpen(true); }
    const openRequestModal = (p: any) => { setSelectedProduct(p); setActionQty(''); setActionNotes(''); setIsRequestModalOpen(true); }
    const openLossModal = (p: any) => { setSelectedProduct(p); setActionQty(''); setActionNotes(''); setIsLossModalOpen(true); }
    const openDirectModal = (p: any) => { setSelectedProduct(p); setActionQty(''); setActionNotes(''); setIsDirectModalOpen(true); }

    const handleAddSubmit = async () => {
        if (!actionQty || Number(actionQty) <= 0) return alert('Quantidade inválida.');
        setLoading(true);
        try {
            await addDepotStock(selectedProduct.id, Number(actionQty), undefined, actionNotes);
            window.location.reload();
        } catch (e: any) { alert(e.message); }
        setLoading(false);
    }

    const handleRequestSubmit = async () => {
        if (!actionQty || Number(actionQty) <= 0) return alert('Quantidade inválida.');
        setLoading(true);
        try {
            await requestTransfer(selectedProduct.id, Number(actionQty), actionNotes);
            window.location.reload();
        } catch (e: any) { alert(e.message); }
        setLoading(false);
    }

    const handleDirectSubmit = async () => {
        if (!actionQty || Number(actionQty) <= 0) return alert('Quantidade inválida.');
        setLoading(true);
        try {
            await directTransfer(selectedProduct.id, Number(actionQty), actionNotes);
            window.location.reload();
        } catch (e: any) { alert(e.message); }
        setLoading(false);
    }

    const handleAuthorize = async (id: string) => {
        if (!confirm('Deseja autorizar esta transferência e atualizar o estoque de vendas agora?')) return;
        setLoading(true);
        try {
            await authorizeTransfer(id);
            window.location.reload();
        } catch (e: any) { alert(e.message); }
        setLoading(false);
    }

    const handleReject = async (id: string) => {
        const reason = prompt('Motivo da rejeição:');
        if (reason === null) return;
        setLoading(true);
        try {
            await rejectTransfer(id, reason);
            window.location.reload();
        } catch (e: any) { alert(e.message); }
        setLoading(false);
    }

    const handleLossSubmit = async () => {
        if (!actionQty || Number(actionQty) <= 0) return alert('Quantidade inválida.');
        setLoading(true);
        try {
            await adjustDepotStockLoss(selectedProduct.id, Number(actionQty), actionNotes);
            window.location.reload();
        } catch (e: any) { alert(e.message); }
        setLoading(false);
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                        <Warehouse className="text-mrts-blue" size={32}/> Depósito (Matriz)
                    </h1>
                    <p className="text-slate-500 font-medium text-sm mt-1">
                        Controle independente. Abasteça a matriz e solicite envios para o balcão.
                    </p>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => setActiveTab('inventory')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition ${activeTab === 'inventory' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-100 hover:bg-slate-50'}`}
                    >
                        Inventário Geral
                    </button>
                    <button 
                        onClick={() => setActiveTab('requests')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 ${activeTab === 'requests' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-100 hover:bg-slate-50'}`}
                    >
                        Transferências 
                        {pendingRequests.length > 0 && <span className="bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center animate-pulse">{pendingRequests.length}</span>}
                    </button>
                </div>
            </div>

            {activeTab === 'inventory' ? (
                <>
                    <div className="mb-4 relative w-full md:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Buscar produto..." 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="bg-white border-2 border-gray-100 pl-10 pr-4 py-2 rounded-xl text-sm outline-none w-full font-medium focus:border-mrts-blue"
                        />
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto min-h-[40vh]">
                            <table className="w-full text-left border-collapse whitespace-nowrap">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-gray-100 text-xs uppercase text-slate-500 font-bold tracking-wider">
                                        <th className="p-4">Produto</th>
                                        <th className="p-4 text-center">Fundo Depósito</th>
                                        <th className="p-4 text-center">Estoque Balcão</th>
                                        <th className="p-4 text-center">Operações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 text-sm font-medium">
                                    {filtered.map(product => {
                                        const depotQty = product.depotStock?.quantity || 0;
                                        const frontQty = product.stock?.quantity || 0;
                                        
                                        return (
                                            <tr key={product.id} className="hover:bg-slate-50/50 transition">
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-mrts-blue/10 flex items-center justify-center shrink-0 text-mrts-blue">
                                                            {product.iconUrl ? <img src={product.iconUrl} className="w-6 h-6" /> : <Box size={20}/>}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-800">{product.name}</p>
                                                            <p className="text-[10px] text-gray-400 uppercase tracking-tighter">{product.category.name}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-black border 
                                                        ${depotQty > 0 ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
                                                        {depotQty.toFixed(2).replace(/\.00$/, '')} {product.unit}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="text-slate-400 font-bold">
                                                        {frontQty.toFixed(2).replace(/\.00$/, '')} {product.unit}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex justify-center gap-2">
                                                        <button onClick={() => openAddModal(product)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-lg transition" title="Abastecer Fundo">
                                                            <PackagePlus size={16} />
                                                        </button>
                                                        
                                                        {isAdmin && (
                                                            <button onClick={() => openDirectModal(product)} disabled={depotQty <= 0} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 p-2 rounded-lg transition disabled:opacity-30" title="Transferência Direta (Admin)">
                                                                <Check size={16} />
                                                            </button>
                                                        )}

                                                        <button 
                                                            onClick={() => openRequestModal(product)} 
                                                            disabled={depotQty <= 0}
                                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black transition ${depotQty > 0 ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed border'}`}
                                                        >
                                                            <Clock size={14} /> Solicitar Envio
                                                        </button>

                                                        <button onClick={() => openLossModal(product)} disabled={depotQty <= 0} className="p-2 text-slate-300 hover:text-red-500 transition disabled:opacity-20" title="Informar Perda">
                                                            <AlertTriangle size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : (
                <div className="space-y-6">
                    {/* LISTA DE PENDENTES */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-slate-50 flex items-center gap-2">
                            <Clock className="text-amber-500" size={18}/>
                            <h3 className="font-bold text-slate-800 text-sm uppercase">Aguardando Autorização</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-xs uppercase text-slate-400 font-bold border-b">
                                        <th className="p-4">Data/Solicitante</th>
                                        <th className="p-4">Produto</th>
                                        <th className="p-4 text-center">Qtd Solicitada</th>
                                        <th className="p-4 text-center">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 font-medium whitespace-nowrap">
                                    {pendingRequests.map(req => (
                                        <tr key={req.id} className="hover:bg-amber-50/30 transition">
                                            <td className="p-4">
                                                <p className="text-sm text-slate-700 font-bold">{req.user?.name}</p>
                                                <p className="text-[10px] text-slate-400 tracking-tight">{new Date(req.createdAt).toLocaleString('pt-BR')}</p>
                                            </td>
                                            <td className="p-4">
                                                <p className="text-sm font-bold text-slate-800">{req.product?.name}</p>
                                                {req.notes && <p className="text-[10px] text-indigo-500 italic">"{req.notes}"</p>}
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="text-lg font-black text-slate-800">{req.quantity}</span> <span className="text-xs text-slate-500 uppercase">{req.product?.unit}</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                {canAuthorize ? (
                                                    <div className="flex justify-center gap-2">
                                                        <button onClick={() => handleAuthorize(req.id)} className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 flex items-center gap-1.5 transition">
                                                            <ShieldCheck size={16}/> Autorizar
                                                        </button>
                                                        <button onClick={() => handleReject(req.id)} className="bg-red-50 text-red-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-red-100 flex items-center gap-1.5 transition">
                                                            <ThumbsDown size={16}/> Recusar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full font-bold">Aguardando Gerente...</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {pendingRequests.length === 0 && (
                                        <tr><td colSpan={4} className="p-8 text-center text-slate-400 text-sm font-bold">Nenhuma solicitação pendente no momento.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* HISTÓRICO DE PROCESSADOS */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden opacity-80 hover:opacity-100 transition">
                        <div className="p-4 border-b border-gray-100 bg-slate-50 flex items-center gap-2">
                            <Check className="text-slate-400" size={18}/>
                            <h3 className="font-bold text-slate-400 text-sm uppercase">Processados Recentemente</h3>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                                <tbody className="divide-y divide-gray-50 text-xs font-medium">
                                    {processedRequests.map(req => (
                                        <tr key={req.id}>
                                            <td className="p-3 text-slate-500">
                                                {new Date(req.updatedAt).toLocaleString('pt-BR')}
                                            </td>
                                            <td className="p-3 font-bold text-slate-700">
                                                {req.product?.name}
                                            </td>
                                            <td className="p-3 text-center font-black">
                                                {req.quantity} {req.product?.unit}
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2 py-1 rounded-md uppercase tracking-widest text-[9px] font-black 
                                                    ${req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                    {req.status === 'APPROVED' ? 'Autorizado' : 'Rejeitado'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-slate-400 text-[10px]">
                                                Por: {req.authorizedBy?.name}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* MODALS (ABASTECER, SOLICITAR, DIRETO, PERDA) */}
            {isAddModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-6 border-b pb-4">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                    <PackagePlus className="text-indigo-500"/> Abastecer Matriz
                                </h2>
                                <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-wider">{selectedProduct.name}</p>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200"><X size={16}/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Quantidade Chegando ({selectedProduct.unit})</label>
                                <input type="number" step="0.01" value={actionQty} onChange={e=>setActionQty(e.target.value)} placeholder="0.00" className="w-full font-mono font-bold text-lg border-2 border-indigo-100 p-3 bg-indigo-50/10 rounded-xl outline-none focus:border-indigo-500 transition"/>
                            </div>
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Observações / NF</label>
                                <input type="text" value={actionNotes} onChange={e=>setActionNotes(e.target.value)} placeholder="Ex: NF 1002..." className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none focus:border-gray-300 transition text-sm"/>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button disabled={loading} onClick={() => setIsAddModalOpen(false)} className="flex-[1] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 py-3 rounded-xl transition">Cancelar</button>
                            <button disabled={loading} onClick={handleAddSubmit} className="flex-[2] bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-indigo-700 transition flex justify-center items-center gap-2">Confirmar Entrada</button>
                        </div>
                    </div>
                </div>
            )}

            {isRequestModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 font-medium">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800"><Clock className="text-indigo-600"/> Solicitar Transbordo</h2>
                                <p className="text-xs text-indigo-500 font-bold mt-1 uppercase tracking-wider">{selectedProduct.name}</p>
                            </div>
                            <button onClick={() => setIsRequestModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200"><X size={16}/></button>
                        </div>
                        <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl mb-4 flex justify-between items-center">
                             <div>
                                 <p className="text-[10px] text-slate-400 font-black uppercase">Saldo Matriz:</p>
                                 <p className="text-lg font-black text-indigo-700">{(selectedProduct.depotStock?.quantity || 0).toFixed(2).replace(/\.00$/, '')} {selectedProduct.unit}</p>
                             </div>
                             <ArrowRightLeft size={20} className="text-indigo-200"/>
                             <div className="text-right">
                                 <p className="text-[10px] text-slate-400 font-black uppercase">Estoque Balcão:</p>
                                 <p className="text-lg font-black text-slate-600">{(selectedProduct.stock?.quantity || 0).toFixed(2).replace(/\.00$/, '')} {selectedProduct.unit}</p>
                             </div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Quantidade necessária no balcão</label>
                                <input type="number" step="0.01" value={actionQty} onChange={e=>setActionQty(e.target.value)} placeholder="0.00" className="w-full font-mono font-bold text-lg border-2 border-indigo-100 p-3 rounded-xl outline-none focus:border-indigo-600 transition"/>
                            </div>
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Justificativa (Opcional)</label>
                                <input type="text" value={actionNotes} onChange={e=>setActionNotes(e.target.value)} placeholder="Ex: Abastecer geladeiras..." className="w-full border-2 border-gray-100 p-3 rounded-xl text-sm outline-none"/>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button disabled={loading} onClick={() => setIsRequestModalOpen(false)} className="flex-[1] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 py-3 rounded-xl transition">Voltar</button>
                            <button disabled={loading} onClick={handleRequestSubmit} className="flex-[2] bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-indigo-700 transition">Solicitar Agora</button>
                        </div>
                    </div>
                </div>
            )}

            {isDirectModalOpen && isAdmin && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 border-4 border-emerald-500/20">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2 text-emerald-700"><Check className="text-emerald-500"/> Transferência Direta (Admin)</h2>
                                <p className="text-xs text-emerald-600 font-bold mt-1 uppercase tracking-wider">{selectedProduct.name}</p>
                            </div>
                            <button onClick={() => setIsDirectModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200"><X size={16}/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Quantidade para atualização imediata</label>
                                <input type="number" step="0.01" value={actionQty} onChange={e=>setActionQty(e.target.value)} placeholder="0.00" className="w-full font-mono font-bold text-lg border-2 border-emerald-100 p-3 bg-emerald-50/10 rounded-xl outline-none focus:border-emerald-500 transition"/>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button disabled={loading} onClick={() => setIsDirectModalOpen(false)} className="flex-[1] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 py-3 rounded-xl transition">Cancelar</button>
                            <button disabled={loading} onClick={handleDirectSubmit} className="flex-[2] bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-emerald-700 transition">Efetivar Imediatamente</button>
                        </div>
                    </div>
                </div>
            )}

            {isLossModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b text-red-600">
                            <h2 className="text-xl font-bold flex items-center gap-2 underline decoration-red-200">Baixa em Matriz</h2>
                            <button onClick={() => setIsLossModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200"><X size={16}/></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Quantidade Perdida</label>
                                <input type="number" step="0.01" value={actionQty} onChange={e=>setActionQty(e.target.value)} placeholder="0.00" className="w-full font-mono font-bold text-lg border-2 border-red-100 p-3 bg-red-50/10 rounded-xl outline-none focus:border-red-500 transition"/>
                            </div>
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Motivo da Baixa</label>
                                <input type="text" value={actionNotes} onChange={e=>setActionNotes(e.target.value)} placeholder="Ex: Quebrado, vencido..." className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none text-sm"/>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button disabled={loading} onClick={() => setIsLossModalOpen(false)} className="flex-[1] font-bold text-slate-500 bg-slate-100 py-3 rounded-xl transition">Voltar</button>
                            <button disabled={loading || !actionNotes} onClick={handleLossSubmit} className="flex-[2] bg-red-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-red-700 transition">Confirmar Perda</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
