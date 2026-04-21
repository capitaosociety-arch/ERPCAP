'use client'

import { useState, useTransition } from 'react';
import { Search, Warehouse, ArrowRightLeft, PackagePlus, AlertTriangle, X, Check, Box, Clock, ShieldCheck, ThumbsDown, Camera, Edit, RefreshCw, ZoomIn, ZoomOut, Maximize, Download, ArrowRight, AlertCircle } from 'lucide-react';
import { addDepotStock, requestTransfer, authorizeTransfer, rejectTransfer, adjustDepotStockLoss, directTransfer, updateDepotMinStock, registerBatchDepotStockMovement } from '../../actions/depot';
import { quickCreateProductFromInvoice } from '../../actions/products';

export default function DepotClient({ 
    initialInventory, 
    initialRequests, 
    initialMovements = [],
    userRole 
}: { 
    initialInventory: any[], 
    initialRequests: any[], 
    initialMovements: any[],
    userRole: string 
}) {
    const [activeTab, setActiveTab] = useState<'inventory' | 'requests'>('inventory');
    const [filter, setFilter] = useState<'ALL' | 'LOW' | 'HISTORY'>('ALL');
    const [search, setSearch] = useState("");
    const [isPending, startTransition] = useTransition();

    // Modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [isLossModalOpen, setIsLossModalOpen] = useState(false);
    const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
    const [isMinModalOpen, setIsMinModalOpen] = useState(false);
    
    // OCR State
    const [isNfModalOpen, setNfModalOpen] = useState(false);
    const [isParsingNf, setParsingNf] = useState(false);
    const [parsedNfData, setParsedNfData] = useState<any>(null);
    const [nfImageUrl, setNfImageUrl] = useState<string | null>(null);
    const [mappedItems, setMappedItems] = useState<Record<number, any>>({});
    const [nfDateStr, setNfDateStr] = useState(new Date().toISOString().split('T')[0]);
    const [verifiedRows, setVerifiedRows] = useState<Set<number>>(new Set());
    const [imgZoom, setImgZoom] = useState(1);
    const [imgPos, setImgPos] = useState({ x: 0, y: 0 });
    const [mobileTab, setMobileTab] = useState<'data' | 'photo'>('data');

    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [actionQty, setActionQty] = useState('');
    const [actionNotes, setActionNotes] = useState('');
    const [minQty, setMinQty] = useState('');

    const isAdmin = userRole === 'ADMIN';
    const isManager = userRole === 'MANAGER';
    const canAuthorize = isAdmin || isManager;

    const filtered = initialInventory.filter(p => {
        const matchSearch = (p.name || '').toLowerCase().includes((search || '').toLowerCase()) || 
                           (p.code && p.code.toLowerCase().includes((search || '').toLowerCase()));
        
        if (filter === 'LOW') {
            const depotQty = p.depotStock?.quantity || 0;
            const minQty = p.depotStock?.minQuantity || 5;
            return matchSearch && depotQty <= minQty;
        }
        
        return matchSearch;
    });

    const pendingRequests = initialRequests.filter(r => r.status === 'PENDING');
    const processedRequests = initialRequests.filter(r => r.status !== 'PENDING');
    
    const safeSearch = (search || '').toLowerCase();
    const allMovements = initialMovements.filter(m => 
        (m.product?.name || '').toLowerCase().includes(safeSearch) ||
        (m.document && m.document.toLowerCase().includes(safeSearch))
    );

    // Handlers
    const openAddModal = (p: any) => { setSelectedProduct(p); setActionQty(''); setActionNotes(''); setIsAddModalOpen(true); }
    const openRequestModal = (p: any) => { setSelectedProduct(p); setActionQty(''); setActionNotes(''); setIsRequestModalOpen(true); }
    const openLossModal = (p: any) => { setSelectedProduct(p); setActionQty(''); setActionNotes(''); setIsLossModalOpen(true); }
    const openDirectModal = (p: any) => { setSelectedProduct(p); setActionQty(''); setActionNotes(''); setIsDirectModalOpen(true); }
    const openMinModal = (p: any) => { setSelectedProduct(p); setMinQty((p.depotStock?.minQuantity || 5).toString()); setIsMinModalOpen(true); }

    const handleAddSubmit = async () => {
        if (!actionQty || Number(actionQty) <= 0) return alert('Quantidade inválida.');
        startTransition(async () => {
            try {
                await addDepotStock(selectedProduct.id, Number(actionQty), undefined, actionNotes);
                window.location.reload();
            } catch (e: any) { alert(e.message); }
        });
    }

    const handleSaveMin = () => {
        if (!selectedProduct || !minQty) return;
        startTransition(async () => {
            try {
                await updateDepotMinStock(selectedProduct.id, parseFloat(minQty.replace(',','.')));
                setIsMinModalOpen(false);
                window.location.reload();
            } catch(e) { alert("Erro ao atualizar!"); }
        });
    }

    const handleNfUpload = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setParsingNf(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const apiRes = await fetch('/api/ocr', { method: 'POST', body: formData });
            const res = await apiRes.json();
            if (res.success && res.data) {
                setParsedNfData(res.data);
                if (res.data.data && /^\d{4}-\d{2}-\d{2}$/.test(res.data.data)) setNfDateStr(res.data.data);
                setVerifiedRows(new Set());
                setImgZoom(1);
                setImgPos({ x: 0, y: 0 });
                setMobileTab('data');
                setNfImageUrl(res.imageUrl || (typeof window !== 'undefined' ? window.URL.createObjectURL(file) : null));
                const initialMap: Record<number, any> = {};
                res.data.produtos?.forEach((item: any, i: number) => {
                    let matchedId = '';
                    if (item.nome) {
                        const lowerItem = String(item.nome).toLowerCase();
                        const match = initialInventory.find((p: any) => (p.name || '').toLowerCase().includes(lowerItem) || lowerItem.includes((p.name || '').toLowerCase()));
                        if (match) matchedId = match.id;
                    }
                    initialMap[i] = { productId: matchedId, quantity: item.quantidade, price: item.preco_unitario };
                });
                setMappedItems(initialMap);
            } else { alert("Erro na IA: " + (res.error || "Tente novamente.")); }
        } catch (err: any) { alert("Erro ao processar a imagem: " + (err.message || "Erro de conexão")); }
        setParsingNf(false);
    };

    const handleBatchSaveNf = () => {
        const movementsToSave: any[] = [];
        const parseLocalNumber = (val: any) => {
            if (!val) return 0;
            let str = String(val);
            str = str.replace(/\.(?=\d{3}(,|$))/g, '').replace(',', '.');
            return parseFloat(str) || 0;
        };

        for (const [idx, mOptions] of Object.entries(mappedItems)) {
            if (!mOptions.productId) return alert(`Associe todos os itens à um produto no sistema para continuar.`);
            movementsToSave.push({
                productId: mOptions.productId,
                quantity: parseLocalNumber(mOptions.quantity),
                price: parseLocalNumber(mOptions.price)
            });
        }

        startTransition(async () => {
            try {
                await registerBatchDepotStockMovement(movementsToSave, parsedNfData?.numero_nf || '', nfImageUrl, "Entrada NF Matriz (IA)", nfDateStr);
                window.location.reload();
            } catch(e: any) { alert("Erro ao salvar itens: " + e.message); }
        });
    };

    const handleRequestSubmit = async () => {
        if (!actionQty || Number(actionQty) <= 0) return alert('Quantidade inválida.');
        startTransition(async () => {
            try {
                await requestTransfer(selectedProduct.id, Number(actionQty), actionNotes);
                window.location.reload();
            } catch (e: any) { alert(e.message); }
        });
    }

    const handleAuthorize = async (id: string) => {
        if (!confirm('Deseja autorizar esta transferência?')) return;
        startTransition(async () => {
            try {
                await authorizeTransfer(id);
                window.location.reload();
            } catch (e: any) { alert(e.message); }
        });
    }

    const handleReject = async (id: string) => {
        const reason = prompt('Motivo da rejeição:');
        if (reason === null) return;
        startTransition(async () => {
            try {
                await rejectTransfer(id, reason);
                window.location.reload();
            } catch (e: any) { alert(e.message); }
        });
    }

    const handleLossSubmit = async () => {
        if (!actionQty || Number(actionQty) <= 0) return alert('Quantidade inválida.');
        startTransition(async () => {
            try {
                await adjustDepotStockLoss(selectedProduct.id, Number(actionQty), actionNotes);
                window.location.reload();
            } catch (e: any) { alert(e.message); }
        });
    }

    const handleDirectSubmit = async () => {
        if (!actionQty || Number(actionQty) <= 0) return alert('Quantidade inválida.');
        startTransition(async () => {
            try {
                await directTransfer(selectedProduct.id, Number(actionQty), actionNotes);
                window.location.reload();
            } catch (e: any) { alert(e.message); }
        });
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                        <Warehouse className="text-mrts-blue" size={32}/> Depósito (Matriz)
                    </h1>
                    <p className="text-slate-500 font-medium text-sm mt-1">
                        Estoque central de retaguarda. Gerencie o abastecimento bruto via fotos ou manual.
                    </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => setNfModalOpen(true)} className="px-4 py-2 rounded-xl text-sm font-bold bg-mrts-blue text-white shadow-lg transition flex items-center gap-2 hover:bg-blue-600 transform hover:-translate-y-0.5">
                        <Camera size={18}/> Ler Nota por Foto
                    </button>
                    <button onClick={() => { setActiveTab('inventory'); setFilter('ALL'); }} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${activeTab === 'inventory' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-100'}`}>
                        Inventário
                    </button>
                    <button onClick={() => setActiveTab('requests')} className={`px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-2 ${activeTab === 'requests' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-100'}`}>
                        Solicitações {pendingRequests.length > 0 && <span className="bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center animate-pulse">{pendingRequests.length}</span>}
                    </button>
                </div>
            </div>

            {activeTab === 'inventory' && (
                <>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input type="text" placeholder="Buscar produto ou NF..." value={search} onChange={e => setSearch(e.target.value)} className="bg-white border-2 border-gray-100 pl-10 pr-4 py-2 rounded-xl text-sm outline-none w-full font-medium focus:border-mrts-blue"/>
                        </div>

                        <div className="flex bg-white rounded-xl shadow-sm border border-gray-100 p-1">
                            <button onClick={() => setFilter('ALL')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${filter === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                                <Box size={16}/> Produtos
                            </button>
                            <button onClick={() => setFilter('LOW')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${filter === 'LOW' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                                <AlertCircle size={16}/> Baixo
                            </button>
                            <button onClick={() => setFilter('HISTORY')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${filter === 'HISTORY' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                                <RefreshCw size={16}/> Lançamentos (NF)
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {filter !== 'HISTORY' ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse whitespace-nowrap">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-gray-100 text-xs uppercase text-slate-500 font-bold tracking-wider">
                                            <th className="p-4">Produto</th>
                                            <th className="p-4 text-center">Status Matriz</th>
                                            <th className="p-4 text-right">Mínimo Matriz</th>
                                            <th className="p-4 text-right">Volume Matriz</th>
                                            <th className="p-4 text-center">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 text-sm font-medium">
                                        {filtered.map(product => {
                                            const depotQty = product.depotStock?.quantity || 0;
                                            const minQty = product.depotStock?.minQuantity || 5;
                                            const isLow = depotQty <= minQty;
                                            const isCritical = depotQty <= 0;
                                            
                                            return (
                                                <tr key={product.id} className="hover:bg-slate-50/50 transition">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                                                                {product.iconUrl ? <img src={product.iconUrl} className="w-6 h-6" /> : <Box size={20} className="text-slate-300"/>}
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-slate-800">{product.name || 'Sem nome'}</p>
                                                                <p className="text-[10px] text-gray-400 uppercase">{product.category?.name || 'Vários'}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        {isCritical ? (
                                                            <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-black uppercase">Esgotado</span>
                                                        ) : isLow ? (
                                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-black uppercase">Crítico</span>
                                                        ) : (
                                                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-black uppercase">OK</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <button onClick={() => openMinModal(product)} className="text-slate-400 hover:text-mrts-blue transition flex items-center justify-end gap-1.5 ml-auto group">
                                                            <span className="text-xs font-bold bg-slate-50 px-2 py-0.5 rounded border border-transparent group-hover:border-mrts-blue transition">{minQty}</span>
                                                            <Edit size={14}/>
                                                        </button>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <span className={`text-lg font-black transition-colors ${isCritical ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-slate-800'}`}>
                                                            {depotQty.toFixed(2).replace(/\.00$/, '')} <span className="text-xs font-medium opacity-60">{product.unit}</span>
                                                        </span>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex justify-center gap-2">
                                                            <button onClick={() => openAddModal(product)} className="bg-white border border-slate-200 text-slate-600 p-2 rounded-lg hover:border-mrts-blue hover:text-mrts-blue transition" title="Entrada Manual">
                                                                <PackagePlus size={16} />
                                                            </button>
                                                            {isAdmin && (
                                                                <button onClick={() => openDirectModal(product)} disabled={isCritical} className="bg-emerald-50 text-emerald-600 p-2 rounded-lg hover:bg-emerald-500 hover:text-white transition disabled:opacity-20" title="Transferência Direta">
                                                                    <Check size={16} />
                                                                </button>
                                                            )}
                                                            <button onClick={() => openRequestModal(product)} disabled={isCritical} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black transition ${!isCritical ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
                                                                <ArrowRightLeft size={14} /> Enviar
                                                            </button>
                                                            <button onClick={() => openLossModal(product)} disabled={isCritical} className="p-2 text-slate-300 hover:text-red-500 transition disabled:opacity-20" title="Informar Perda">
                                                                <AlertTriangle size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filtered.length === 0 && (
                                            <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold">Nenhum produto localizado.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse whitespace-nowrap">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-gray-100 text-xs uppercase text-slate-500 font-bold tracking-wider">
                                            <th className="p-4">Data</th>
                                            <th className="p-4">Produto</th>
                                            <th className="p-4">Tipo</th>
                                            <th className="p-4 text-center">Documento / NF</th>
                                            <th className="p-4 text-right">Qtd</th>
                                            <th className="p-4">Anexo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 text-sm font-medium">
                                        {allMovements.map((mov: any) => (
                                            <tr key={mov.id} className="hover:bg-slate-50 transition">
                                                <td className="p-4 text-xs text-slate-400">{new Date(mov.date).toLocaleDateString('pt-BR')}</td>
                                                <td className="p-4 font-bold text-slate-800">{mov.product?.name}</td>
                                                <td className="p-4">
                                                    {mov.type === 'IN' ? (
                                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-black uppercase">Entrada</span>
                                                    ) : mov.type === 'OUT_TRANSFER' ? (
                                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black uppercase">Transferência</span>
                                                    ) : (
                                                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-black uppercase">Ajuste/Perda</span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className="text-xs font-medium text-slate-500">{mov.document || '-'}</span>
                                                </td>
                                                <td className="p-4 text-right text-base font-black">
                                                    <span className={mov.type === 'IN' ? 'text-emerald-500' : 'text-amber-500'}>
                                                        {mov.type === 'IN' ? '+' : '-'}{mov.quantity}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    {mov.imageUrl ? (
                                                        <a href={mov.imageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg font-bold text-xs hover:bg-blue-100 transition border border-blue-100">
                                                            <Camera size={14}/> Ver NF
                                                        </a>
                                                    ) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                        {allMovements.length === 0 && (
                                            <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold">Nenhum lançamento no histórico.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'requests' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-slate-50 flex items-center gap-2">
                            <Clock className="text-amber-500" size={18}/>
                            <h3 className="font-bold text-slate-800 text-sm uppercase">Pendentes de Liberação</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <tbody className="divide-y divide-gray-50 font-medium whitespace-nowrap text-sm">
                                    {pendingRequests.map(req => (
                                        <tr key={req.id} className="hover:bg-amber-50/20">
                                            <td className="p-4">
                                                <p className="font-bold text-slate-800">{req.user?.name}</p>
                                                <p className="text-[10px] text-slate-400">{new Date(req.createdAt).toLocaleString('pt-BR')}</p>
                                            </td>
                                            <td className="p-4">
                                                <p className="font-bold text-slate-700">{req.product?.name}</p>
                                                {req.notes && <p className="text-[10px] text-indigo-500 font-bold italic">&quot;{req.notes}&quot;</p>}
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="text-xl font-black text-slate-900">{req.quantity}</span> <span className="text-[10px] uppercase text-slate-500">{req.product?.unit}</span>
                                            </td>
                                            <td className="p-4 text-center">
                                                {canAuthorize ? (
                                                    <div className="flex justify-center gap-2">
                                                        <button disabled={isPending} onClick={() => handleAuthorize(req.id)} className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-emerald-600 transition flex items-center gap-2">
                                                            <Check size={16} strokeWidth={3}/> Autorizar
                                                        </button>
                                                        <button disabled={isPending} onClick={() => handleReject(req.id)} className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-100 transition flex items-center gap-2">
                                                            <ThumbsDown size={14} /> Recusar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-600 font-bold text-[10px] uppercase">Aguardando Supervisão</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {pendingRequests.length === 0 && (
                                        <tr><td colSpan={4} className="p-10 text-center text-slate-400 font-bold">Tudo em dia! Nenhuma solicitação pendente.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: ESTOQUE MINIMO MATRIZ */}
            {isMinModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">Alerta de Reposição</h2>
                            <button onClick={() => setIsMinModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200"><X size={16}/></button>
                        </div>
                        <p className="text-xs text-slate-500 mb-4">Qual a quantidade mínima de <b>{selectedProduct.name}</b> que deve haver na Matriz antes de um alerta?</p>
                        <input type="number" step="0.01" value={minQty} onChange={e => setMinQty(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-3 text-center text-2xl font-black text-slate-800 focus:border-mrts-blue outline-none transition"/>
                        <button disabled={isPending} onClick={handleSaveMin} className="w-full mt-6 bg-slate-900 text-white font-black py-4 rounded-xl hover:bg-slate-800 transition shadow-lg">Salvar Limite Matriz</button>
                    </div>
                </div>
            )}

            {/* MODAL NF IA (FOTO) */}
            {isNfModalOpen && (
                <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[200] flex flex-col items-center justify-center p-0 md:p-6 overflow-hidden">
                    <div className="bg-white md:rounded-3xl w-full max-w-6xl h-full md:h-[90dvh] shadow-2xl animate-in slide-in-from-bottom-5 flex flex-col border border-white/10 overflow-hidden">
                        {/* Header OCR */}
                        <div className="flex justify-between items-center p-4 md:p-6 border-b bg-white z-10 shrink-0">
                            <div>
                                <h2 className="text-lg md:text-xl font-black flex items-center gap-2 text-slate-800"><Camera size={24} className="text-mrts-blue" /> Entrada Matriz Inteligente</h2>
                                <p className="text-[10px] md:text-xs text-gray-500 font-medium">Capture a nota fiscal para abastecer o fundo de estoque da matriz (depósito).</p>
                            </div>
                            <button onClick={() => { setNfModalOpen(false); setParsedNfData(null); setNfImageUrl(null); }} className="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full transition"><X size={20}/></button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                            {/* Panel Foto */}
                            {nfImageUrl && (
                                <div className={`lg:w-1/2 bg-slate-900 flex flex-col relative ${mobileTab === 'data' ? 'hidden lg:flex' : 'flex'}`}>
                                    <div className="flex-1 overflow-auto p-4 flex justify-center bg-slate-950">
                                        <img src={nfImageUrl} className="object-contain max-w-full h-auto origin-top transition-transform duration-200" style={{ transform: `scale(${imgZoom}) translate(${imgPos.x}px, ${imgPos.y}px)` }} />
                                    </div>
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/50 p-2 rounded-full backdrop-blur-md z-30">
                                        <button onClick={() => setImgZoom(z => Math.max(0.5, z - 0.25))} className="p-2 text-white hover:bg-white/20 rounded-full"><ZoomOut size={16}/></button>
                                        <button onClick={() => setImgZoom(z => Math.min(3, z + 0.25))} className="p-2 text-white hover:bg-white/20 rounded-full"><ZoomIn size={16}/></button>
                                        <button onClick={() => { setImgZoom(1); setImgPos({x:0, y:0}); }} className="p-2 text-white hover:bg-white/20 rounded-full"><Maximize size={16}/></button>
                                        <button onClick={() => setMobileTab('data')} className="lg:hidden p-2 text-white bg-mrts-blue rounded-full px-4 text-xs font-bold">Ver Dados</button>
                                    </div>
                                </div>
                            )}

                            {/* Panel Dados */}
                            <div className={`flex-1 p-4 md:p-6 bg-slate-50 overflow-y-auto ${nfImageUrl && mobileTab === 'photo' ? 'hidden lg:block' : 'block'}`}>
                                {!parsedNfData ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-white border-4 border-dashed border-slate-100 rounded-3xl group hover:border-mrts-blue transition">
                                        {isParsingNf ? (
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-16 h-16 border-4 border-slate-200 border-t-mrts-blue rounded-full animate-spin"></div>
                                                <h3 className="font-black text-slate-800">IA ANALISANDO NOTA...</h3>
                                                <p className="text-sm text-gray-400">Identificando produtos e volumes para abastecer a matriz.</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="w-20 h-20 bg-blue-50 text-mrts-blue rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition"><Camera size={40}/></div>
                                                <h3 className="text-xl font-black text-slate-800 mb-2">Bipar Romaneio ou Nota</h3>
                                                <p className="text-sm text-gray-500 mb-8 max-w-xs">Use a câmera do celular para extrair os itens da entrega automaticamente.</p>
                                                <input type="file" accept="image/*" capture="environment" onChange={handleNfUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"/>
                                                <button className="bg-slate-900 text-white font-black py-4 px-10 rounded-2xl shadow-xl">CLIQUE PARA FOTOGRAFAR</button>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center"><Check size={20} strokeWidth={3}/></div>
                                                <div><p className="font-black text-slate-800 text-sm">Dados Extraídos</p><p className="text-[10px] text-gray-400 font-bold uppercase">{parsedNfData.fornecedor || 'Fornecedor não identificado'}</p></div>
                                            </div>
                                            <div className="flex gap-4">
                                                <div><label className="text-[9px] text-gray-400 font-black uppercase">Nº do Documento</label><input type="text" value={parsedNfData.numero_nf || ''} onChange={e => setParsedNfData({...parsedNfData, numero_nf: e.target.value})} className="block font-black text-mrts-blue border-b-2 border-slate-100 outline-none focus:border-mrts-blue"/></div>
                                                <div><label className="text-[9px] text-gray-400 font-black uppercase">Data de Entrada</label><input type="date" value={nfDateStr} onChange={e => setNfDateStr(e.target.value)} className="block font-bold text-slate-700 text-xs border-b-2 border-slate-100 outline-none"/></div>
                                            </div>
                                        </div>

                                        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-md">
                                            <table className="w-full text-left text-sm whitespace-nowrap">
                                                <thead className="bg-slate-50 border-b border-gray-100 text-[10px] text-slate-400 font-black uppercase tracking-widest">
                                                    <tr><th className="p-4 w-12 text-center">OK</th><th className="p-4">Item na Nota</th><th className="p-4">Produto Correspondente</th><th className="p-4 text-center">Qtd.</th><th className="p-4 text-right">Custo</th></tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {parsedNfData.produtos?.map((item: any, idx: number) => (
                                                        <tr key={idx} className={verifiedRows.has(idx) ? 'bg-emerald-50/30' : ''}>
                                                            <td className="p-4 text-center"><button onClick={() => { const n = new Set(verifiedRows); if (n.has(idx)) n.delete(idx); else n.add(idx); setVerifiedRows(n); }} className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${verifiedRows.has(idx) ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-100 text-slate-300'}`}><Check size={16} strokeWidth={3}/></button></td>
                                                            <td className="p-4"><p className="font-bold text-slate-800 text-xs line-clamp-1">{item.nome}</p></td>
                                                            <td className="p-4">
                                                                <select value={mappedItems[idx]?.productId || ''} onChange={e => { const val = e.target.value; if (val === 'NEW') { const finalName = prompt("Nome do novo produto:", item.nome) || item.nome; startTransition(async () => { const res = await quickCreateProductFromInvoice(finalName, item.preco_unitario || 0); if (res.success) { const nm = {...mappedItems}; nm[idx].productId = res.product.id; setMappedItems(nm); } }); } else { const nm = {...mappedItems}; nm[idx].productId = val; setMappedItems(nm); } }} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs outline-none focus:border-mrts-blue">
                                                                    <option value="">-- Selecionar --</option>
                                                                    <option value="NEW" className="bg-blue-50 font-bold text-mrts-blue">+ CADASTRAR NOVO</option>
                                                                    {initialInventory.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                                </select>
                                                            </td>
                                                            <td className="p-4 text-center"><input type="number" step="0.01" value={mappedItems[idx]?.quantity || 0} onChange={e => { const nm = {...mappedItems}; nm[idx].quantity = e.target.value; setMappedItems(nm); }} className="w-16 text-center font-black bg-slate-50 rounded p-1"/></td>
                                                            <td className="p-4 text-right"><span className="text-xs text-gray-400 mr-1">R$</span><input type="number" step="0.01" value={mappedItems[idx]?.price || 0} onChange={e => { const nm = {...mappedItems}; nm[idx].price = e.target.value; setMappedItems(nm); }} className="w-20 text-right font-black bg-slate-50 rounded p-1"/></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="flex gap-3 mt-4">
                                            <button onClick={() => setMobileTab('photo')} className="lg:hidden flex-1 bg-white border-2 border-slate-200 text-slate-500 font-bold py-4 rounded-xl">Rever Foto</button>
                                            <button disabled={isPending || verifiedRows.size < (parsedNfData.produtos?.length || 0)} onClick={handleBatchSaveNf} className="flex-[2] bg-mrts-blue text-white font-black py-4 rounded-xl shadow-xl shadow-blue-500/20 hover:bg-blue-600 transition disabled:opacity-50">EFETIVAR LOTE NA MATRIZ</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAIS DE MOVIMENTAÇÃO MANUAL */}
            {isAddModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800"><PackagePlus className="text-emerald-500"/> Entrada Matriz</h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center"><X size={16}/></button>
                        </div>
                        <div className="mb-4 bg-slate-50 p-3 rounded-xl">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Produto</p>
                            <p className="font-bold text-slate-800">{selectedProduct.name}</p>
                        </div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Quantidade ({selectedProduct.unit})</label>
                        <input type="number" step="0.01" value={actionQty} onChange={e => setActionQty(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl py-3 px-4 text-xl font-black text-slate-800 focus:border-mrts-blue outline-none transition"/>
                        
                        <label className="block text-sm font-bold text-slate-700 mt-4 mb-2">Observações</label>
                        <textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl py-2 px-4 text-sm font-medium text-slate-800 focus:border-mrts-blue outline-none transition h-20 resize-none" placeholder="Ex: Carga extra..."></textarea>
                        
                        <button disabled={isPending} onClick={handleAddSubmit} className="w-full mt-6 bg-emerald-500 text-white font-black py-4 rounded-xl hover:bg-emerald-600 transition shadow-lg disabled:opacity-50">Efetivar Entrada</button>
                    </div>
                </div>
            )}

            {isDirectModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800"><Check size={22} className="text-emerald-500"/> Transferência Direta</h2>
                            <button onClick={() => setIsDirectModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center"><X size={16}/></button>
                        </div>
                        <p className="text-xs text-slate-500 mb-4">Esta ação remove da Matriz e envia direto para o Balcão, sem necessidade de aceite.</p>
                        <div className="mb-4 bg-slate-50 p-3 rounded-xl">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Produto</p>
                            <p className="font-bold text-slate-800">{selectedProduct.name}</p>
                            <p className="text-[10px] text-mrts-blue font-bold">Disponível Matriz: {selectedProduct.depotStock?.quantity} {selectedProduct.unit}</p>
                        </div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Quantidade a Transferir</label>
                        <input type="number" step="0.01" value={actionQty} onChange={e => setActionQty(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl py-3 px-4 text-xl font-black text-slate-800 focus:border-mrts-blue outline-none transition"/>
                        
                        <button disabled={isPending} onClick={handleDirectSubmit} className="w-full mt-6 bg-slate-900 text-white font-black py-4 rounded-xl hover:bg-slate-800 transition shadow-lg disabled:opacity-50">Transferir Agora</button>
                    </div>
                </div>
            )}

            {isRequestModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800"><ArrowRightLeft size={22} className="text-indigo-500"/> Solicitar Envio</h2>
                            <button onClick={() => setIsRequestModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center"><X size={16}/></button>
                        </div>
                        <p className="text-xs text-slate-500 mb-4">Solicite o envio de produtos do depósito para o balcão. Requer autorização do gestor.</p>
                        <div className="mb-4 bg-slate-50 p-3 rounded-xl">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Produto</p>
                            <p className="font-bold text-slate-800">{selectedProduct.name}</p>
                        </div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Quantidade Desejada</label>
                        <input type="number" step="0.01" value={actionQty} onChange={e => setActionQty(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl py-3 px-4 text-xl font-black text-slate-800 focus:border-mrts-blue outline-none transition"/>
                        
                        <button disabled={isPending} onClick={handleRequestSubmit} className="w-full mt-6 bg-indigo-600 text-white font-black py-4 rounded-xl hover:bg-indigo-700 transition shadow-lg disabled:opacity-50">Enviar Solicitação</button>
                    </div>
                </div>
            )}

            {isLossModalOpen && selectedProduct && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800"><AlertTriangle size={22} className="text-amber-500"/> Baixa por Perda</h2>
                            <button onClick={() => setIsLossModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center"><X size={16}/></button>
                        </div>
                        <div className="mb-4 bg-amber-50 p-3 rounded-xl border border-amber-100">
                            <p className="text-[10px] text-amber-700 font-bold uppercase">Produto com Avaria</p>
                            <p className="font-bold text-amber-900">{selectedProduct.name}</p>
                        </div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Quantidade Perdida</label>
                        <input type="number" step="0.01" value={actionQty} onChange={e => setActionQty(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl py-3 px-4 text-xl font-black text-slate-800 focus:border-amber-500 outline-none transition"/>
                        
                        <label className="block text-sm font-bold text-slate-700 mt-4 mb-2">Motivo da Perda</label>
                        <textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl py-2 px-4 text-sm font-medium text-slate-800 focus:border-amber-500 outline-none transition h-20 resize-none" placeholder="Ex: Quebra, Validade..."></textarea>

                        <button disabled={isPending} onClick={handleLossSubmit} className="w-full mt-6 bg-amber-500 text-white font-black py-4 rounded-xl hover:bg-amber-600 transition shadow-lg disabled:opacity-50">Registrar Perda</button>
                    </div>
                </div>
            )}
        </div>
    )
}
