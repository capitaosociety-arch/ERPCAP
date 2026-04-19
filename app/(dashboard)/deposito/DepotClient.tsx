'use client'

import { useState } from 'react';
import { Search, Warehouse, ArrowRightLeft, PackagePlus, AlertTriangle, X, Check, Box } from 'lucide-react';
import { addDepotStock, transferToFrontStock, adjustDepotStockLoss } from '../../actions/depot';

export default function DepotClient({ initialInventory }: { initialInventory: any[] }) {
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isLossModalOpen, setIsLossModalOpen] = useState(false);
    
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [actionQty, setActionQty] = useState('');
    const [actionNotes, setActionNotes] = useState('');

    const filtered = initialInventory.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.code && p.code.toLowerCase().includes(search.toLowerCase())));

    const openAddModal = (p: any) => { setSelectedProduct(p); setActionQty(''); setActionNotes(''); setIsAddModalOpen(true); }
    const openTransferModal = (p: any) => { setSelectedProduct(p); setActionQty(''); setActionNotes(''); setIsTransferModalOpen(true); }
    const openLossModal = (p: any) => { setSelectedProduct(p); setActionQty(''); setActionNotes(''); setIsLossModalOpen(true); }

    const handleAddSubmit = async () => {
        if (!actionQty || Number(actionQty) <= 0) return alert('Quantidade inválida.');
        setLoading(true);
        try {
            await addDepotStock(selectedProduct.id, Number(actionQty), undefined, actionNotes);
            setIsAddModalOpen(false);
            window.location.reload();
        } catch (e: any) { alert(e.message); }
        setLoading(false);
    }

    const handleTransferSubmit = async () => {
        if (!actionQty || Number(actionQty) <= 0) return alert('Quantidade inválida.');
        setLoading(true);
        try {
            await transferToFrontStock(selectedProduct.id, Number(actionQty), actionNotes);
            setIsTransferModalOpen(false);
            window.location.reload();
        } catch (e: any) { alert(e.message); }
        setLoading(false);
    }

    const handleLossSubmit = async () => {
        if (!actionQty || Number(actionQty) <= 0) return alert('Quantidade inválida.');
        setLoading(true);
        try {
            await adjustDepotStockLoss(selectedProduct.id, Number(actionQty), actionNotes);
            setIsLossModalOpen(false);
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
                        Estoque de retaguarda. Gerencie o inventário bruto e envie mercadorias para o Estoque de Vendas (PDV).
                    </p>
                </div>
                
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar por nome ou código..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="bg-white border-2 border-gray-100 pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none w-full font-medium focus:border-mrts-blue"
                    />
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto min-h-[40vh]">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead>
                            <tr className="bg-slate-50 border-b border-gray-100 text-xs uppercase text-slate-500 font-bold tracking-wider">
                                <th className="p-4">Produto</th>
                                <th className="p-4 text-center">No Depósito (Matriz)</th>
                                <th className="p-4 text-center">Frente de Loja (PDV)</th>
                                <th className="p-4 text-center">Movimentações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(product => {
                                const depotQty = product.depotStock?.quantity || 0;
                                const frontQty = product.stock?.quantity || 0;
                                
                                return (
                                    <tr key={product.id} className="hover:bg-slate-50/50 transition">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-mrts-blue/10 flex items-center justify-center shrink-0">
                                                    {product.iconUrl ? <img src={product.iconUrl} className="w-6 h-6 object-contain" /> : <Box size={20} className="text-mrts-blue"/>}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm max-w-[200px] truncate">{product.name}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">Cód: {product.code || 'N/A'} • {product.category.name}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border 
                                                ${depotQty > 0 ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
                                                {depotQty > 0 ? <Warehouse size={14}/> : <AlertTriangle size={14}/>}
                                                {depotQty.toFixed(2).replace(/\.00$/, '')} {product.unit}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-emerald-50 border border-emerald-100 text-emerald-700">
                                                {frontQty.toFixed(2).replace(/\.00$/, '')} {product.unit} disponíveis
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button onClick={() => openAddModal(product)} className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition">
                                                    <PackagePlus size={14} /> Abastecer
                                                </button>
                                                
                                                <button 
                                                    onClick={() => openTransferModal(product)} 
                                                    disabled={depotQty <= 0}
                                                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${depotQty > 0 ? 'bg-mrts-blue hover:bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed border'}`}
                                                >
                                                    <ArrowRightLeft size={14} /> Transferir
                                                </button>

                                                <button onClick={() => openLossModal(product)} disabled={depotQty <= 0} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-30">
                                                    <AlertTriangle size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-400 font-medium">Nenhum produto cadastrado no sistema.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL: ABASTECER DEPÓSITO */}
            {isAddModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-6 border-b pb-4">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                    <PackagePlus className="text-indigo-500"/> Abastecer Depósito
                                </h2>
                                <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-wider">{selectedProduct.name}</p>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200">
                                <X size={16}/>
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Quantidade Comercial Entrando ({selectedProduct.unit})</label>
                                <input type="number" step="0.01" value={actionQty} onChange={e=>setActionQty(e.target.value)} placeholder="0.00" className="w-full font-mono font-bold text-lg border-2 border-indigo-100 p-3 bg-indigo-50/10 rounded-xl outline-none focus:border-indigo-500 transition"/>
                            </div>
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Observações / NF</label>
                                <input type="text" value={actionNotes} onChange={e=>setActionNotes(e.target.value)} placeholder="Opcional. Ex: Nota 1234..." className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none focus:border-gray-300 transition text-sm"/>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button disabled={loading} onClick={() => setIsAddModalOpen(false)} className="flex-[1] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 py-3.5 rounded-xl transition">
                                Voltar
                            </button>
                            <button disabled={loading} onClick={handleAddSubmit} className="flex-[2] bg-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-indigo-700 transition flex justify-center items-center gap-2">
                                <Check size={18} strokeWidth={3}/> Confirmar Entrada
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: TRANSFERIR (DEPÓSITO -> FRENTE) */}
            {isTransferModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                    <ArrowRightLeft className="text-mrts-blue"/> Transferir Mercadoria
                                </h2>
                                <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-wider">{selectedProduct.name}</p>
                            </div>
                            <button onClick={() => setIsTransferModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200">
                                <X size={16}/>
                            </button>
                        </div>
                        
                        <div className="bg-blue-50 border border-blue-100 p-3 flex justify-between items-center rounded-xl mb-4">
                             <div>
                                 <p className="text-xs text-slate-500 font-bold uppercase">Saldo no Depósito:</p>
                                 <p className="text-lg font-black text-slate-800 font-mono">{(selectedProduct.depotStock?.quantity || 0).toFixed(2).replace(/\.00$/, '')} <span className="text-sm font-medium">{selectedProduct.unit}</span></p>
                             </div>
                             <ArrowRightLeft className="text-blue-300"/>
                             <div className="text-right">
                                 <p className="text-xs text-slate-500 font-bold uppercase">Estoque de Loja Atual:</p>
                                 <p className="text-lg font-black text-slate-800 font-mono">{(selectedProduct.stock?.quantity || 0).toFixed(2).replace(/\.00$/, '')} <span className="text-sm font-medium">{selectedProduct.unit}</span></p>
                             </div>
                        </div>

                        <div className="space-y-4 text-sm font-medium">
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Quantidade para enviar à Frente de Vendas</label>
                                <input type="number" step="0.01" value={actionQty} onChange={e=>setActionQty(e.target.value)} placeholder="0.00" className="w-full font-mono font-bold text-lg border-2 border-blue-100 p-3 bg-blue-50/10 rounded-xl outline-none focus:border-mrts-blue transition focus:ring-4 ring-blue-50"/>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button disabled={loading} onClick={() => setIsTransferModalOpen(false)} className="flex-[1] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 py-3.5 rounded-xl transition">
                                Cancelar
                            </button>
                            <button disabled={loading} onClick={handleTransferSubmit} className="flex-[2] bg-mrts-blue text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-blue-600 transition flex justify-center items-center gap-2">
                                <ArrowRightLeft size={18} strokeWidth={3}/> Efetivar Translado
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: REGISTRAR QUEBRA/PERDA */}
            {isLossModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                    <AlertTriangle className="text-red-500"/> Notificar Perda/Quebra
                                </h2>
                                <p className="text-xs text-gray-400 font-bold mt-1 uppercase tracking-wider">{selectedProduct.name}</p>
                            </div>
                            <button onClick={() => setIsLossModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200">
                                <X size={16}/>
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Quantidade Perdida</label>
                                <input type="number" step="0.01" value={actionQty} onChange={e=>setActionQty(e.target.value)} placeholder="0.00" className="w-full font-mono font-bold text-lg border-2 border-red-100 p-3 bg-red-50/10 rounded-xl outline-none focus:border-red-500 transition"/>
                            </div>
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1 text-sm">Motivo (Obrigatório)</label>
                                <input type="text" value={actionNotes} onChange={e=>setActionNotes(e.target.value)} placeholder="Ex: Produto vencido, garrafa quebrada..." className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none focus:border-gray-300 transition text-sm"/>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button disabled={loading} onClick={() => setIsLossModalOpen(false)} className="flex-[1] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 py-3.5 rounded-xl transition">
                                Voltar
                            </button>
                            <button disabled={loading || !actionNotes} onClick={handleLossSubmit} className="flex-[2] bg-red-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-red-700 transition flex justify-center items-center gap-2 disabled:opacity-50">
                                <AlertTriangle size={18} strokeWidth={3}/> Subtrair
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}
