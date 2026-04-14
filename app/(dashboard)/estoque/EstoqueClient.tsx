'use client';

import { useState, useTransition } from 'react';
import { PackagePlus, Edit3, X, AlertTriangle, AlertCircle, TrendingDown, TrendingUp, Filter, Camera, UploadCloud, CheckCircle, RefreshCw } from 'lucide-react';
import { registerStockMovement, updateMinStock, registerBatchStockMovement } from '../../actions/stock';
import { parseInvoiceImage } from '../../actions/invoice-ai';

export default function EstoqueClient({ initialProducts }: any) {
  const [products, setProducts] = useState(initialProducts);
  const [filter, setFilter] = useState('ALL'); // ALL, LOW
  
  // Modals
  const [isMovementModalOpen, setMovementModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
  const [isMinModalOpen, setMinModalOpen] = useState(false);

  // Form states - Movement
  const [type, setType] = useState('IN'); // IN, OUT_MANUAL, LOSS
  const [quantity, setQuantity] = useState('');
  const [document, setDocument] = useState('');
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Form states - Min Stock
  const [minQty, setMinQty] = useState('');

  // Form states - NF IA
  const [isNfModalOpen, setNfModalOpen] = useState(false);
  const [nfFile, setNfFile] = useState<File | null>(null);
  const [isParsingNf, setParsingNf] = useState(false);
  const [parsedNfData, setParsedNfData] = useState<any>(null);
  const [nfImageUrl, setNfImageUrl] = useState<string | null>(null);
  const [mappedItems, setMappedItems] = useState<Record<number, any>>({});
  const [nfDateStr, setNfDateStr] = useState(new Date().toISOString().split('T')[0]);

  const [isPending, startTransition] = useTransition();

  const openMovementModal = (product: any) => {
      setSelectedProduct(product);
      setType('IN');
      setQuantity('');
      setDocument('');
      setNotes('');
      setDateStr(new Date().toISOString().split('T')[0]);
      setMovementModalOpen(true);
  };

  const handleSaveMovement = () => {
      if (!selectedProduct || !quantity || parseFloat(quantity.replace(',','.')) <= 0) {
          return alert("Informe uma quantidade válida.");
      }
      
      startTransition(async () => {
          try {
              await registerStockMovement(
                  selectedProduct.id,
                  type,
                  parseFloat(quantity.replace(',','.')),
                  notes,
                  document,
                  dateStr
              );
              alert("Movimentação registrada com sucesso!");
              setMovementModalOpen(false);
              window.location.reload();
          } catch(e) {
              alert("Erro ao registrar estoque.");
          }
      });
  };

  const openMinModal = (product: any) => {
      setSelectedProduct(product);
      setMinQty((product.stock?.minQuantity || 5).toString());
      setMinModalOpen(true);
  };

  const handleSaveMin = () => {
      if (!selectedProduct || !minQty) return;
      startTransition(async () => {
          try {
              await updateMinStock(selectedProduct.id, parseFloat(minQty.replace(',','.')));
              setMinModalOpen(false);
              window.location.reload();
          } catch(e) {
              alert("Erro ao atualizar!");
          }
      });
  }

  const handleNfUpload = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setNfFile(file);
      setParsingNf(true);
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
          const res = await parseInvoiceImage(formData);
          if (res.success && res.data) {
              setParsedNfData(res.data);
              setNfImageUrl(res.imageUrl || null);
              
              const initialMap: Record<number, any> = {};
              res.data.items?.forEach((item: any, i: number) => {
                  initialMap[i] = {
                      productId: '', // starts empty
                      quantity: item.quantity,
                      price: item.unitPrice
                  };
              });
              setMappedItems(initialMap);
          } else {
              alert("Erro na IA: " + (res.error || "Tente novamente."));
              setNfFile(null);
          }
      } catch (err) {
          alert("Falha de conexão com a IA.");
          setNfFile(null);
      }
      setParsingNf(false);
  };

  const handleBatchSaveNf = () => {
      const movementsToSave: any[] = [];
      
      for (const [idx, mOptions] of Object.entries(mappedItems)) {
          if (!mOptions.productId) {
              return alert(`Associe todos os itens à um produto no sistema para continuar.`);
          }
          movementsToSave.push({
              productId: mOptions.productId,
              quantity: parseFloat(String(mOptions.quantity).replace(',','.')) || 0,
              price: parseFloat(String(mOptions.price).replace(',','.')) || 0
          });
      }

      if (movementsToSave.length === 0) return alert("Nenhum item válido.");

      startTransition(async () => {
          try {
              await registerBatchStockMovement(
                  movementsToSave,
                  parsedNfData?.documentNumber || '',
                  nfImageUrl,
                  "Entrada NF-e IA",
                  nfDateStr
              );
              alert("Estoque atualizado com sucesso via IA!");
              setNfModalOpen(false);
              setParsedNfData(null);
              window.location.reload();
          } catch(e) {
              alert("Erro ao salvar itens.");
          }
      });
  };

  const handleManualEntry = () => {
      setParsedNfData({
          documentNumber: '',
          isManual: true,
          items: []
      });
      setMappedItems({});
      setNfImageUrl(null);
  };

  const handleAddManualRow = () => {
      const newItems = [...(parsedNfData.items || []), { name: 'Item Manual', quantity: 1, unitPrice: 0 }];
      const newIdx = newItems.length - 1;
      setParsedNfData({ ...parsedNfData, items: newItems });
      setMappedItems({ ...mappedItems, [newIdx]: { productId: '', quantity: 1, price: 0 } });
  };

  const filteredProducts = products.filter((p: any) => {
      if (filter === 'LOW') {
          const qty = p.stock?.quantity || 0;
          const min = p.stock?.minQuantity || 5;
          return qty <= min;
      }
      return true;
  });

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Controle de Estoque</h1>
          <p className="text-gray-500 text-sm mt-1">Monitore o fluxo de insumos e gerencie faltas com alertas.</p>
        </div>
        <div className="flex items-center gap-3">
            <button onClick={() => {
                setNfModalOpen(true);
                setParsedNfData(null);
                setNfFile(null);
            }} className="px-5 py-2 rounded-xl text-sm font-bold bg-mrts-blue text-white shadow-sm transition flex items-center gap-2 hover:bg-mrts-hover hover:scale-105 transform cursor-pointer relative">
                <Camera size={18}/> Ler Nota por Foto
            </button>

            <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1">
                <button onClick={() => setFilter('ALL')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${filter === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                    <Filter size={16}/> Todos
                </button>
                <button onClick={() => setFilter('LOW')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${filter === 'LOW' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                    <AlertCircle size={16}/> Baixo
                </button>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase text-gray-500 tracking-wider">
                <th className="p-4 font-bold">Produto</th>
                <th className="p-4 font-bold text-center">Status</th>
                <th className="p-4 font-bold text-right">Mínimo (Alerta)</th>
                <th className="p-4 font-bold text-right">Quantidade Atual</th>
                <th className="p-4 font-bold text-right">Lançar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredProducts.map((product: any) => {
                  const qty = product.stock?.quantity || 0;
                  const min = product.stock?.minQuantity || 5;
                  const unit = product.stock?.unit || product.unit || "UN";
                  const isLow = qty <= min;
                  const isCritical = qty <= 0;

                  return (
                    <tr key={product.id} className="hover:bg-blue-50/40 transition">
                        <td className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white shadow-sm border border-gray-100 rounded-lg flex items-center justify-center text-xl shrink-0">{product.iconUrl}</div>
                                <div>
                                    <p className="font-bold text-gray-800 text-sm line-clamp-1">{product.name}</p>
                                    <p className="text-xs text-gray-400 font-medium">{product.category?.name || "Geral"}</p>
                                </div>
                            </div>
                        </td>
                        <td className="p-4 text-center">
                            {isCritical ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-black tracking-wide uppercase"><AlertTriangle size={12}/> Esgotado</span>
                            ) : isLow ? (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-bold tracking-wide uppercase"><AlertCircle size={12}/> Baixo</span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold tracking-wide uppercase">Normal</span>
                            )}
                        </td>
                        <td className="p-4 text-right">
                           <button onClick={() => openMinModal(product)} className="text-gray-500 hover:text-mrts-blue transition flex items-center justify-end gap-1.5 ml-auto group">
                               <span className="text-xs font-bold bg-gray-50 group-hover:bg-blue-50 px-2 py-1 rounded">{min}</span>
                               <Edit3 size={14} className="opacity-50 group-hover:opacity-100"/>
                           </button>
                        </td>
                        <td className="p-4 text-right">
                            <span className={`text-base font-black ${isCritical ? 'text-red-500' : isLow ? 'text-orange-500' : 'text-slate-700'}`}>
                                {qty} <span className="text-xs font-medium uppercase ml-0.5 opacity-70">{unit}</span>
                            </span>
                        </td>
                        <td className="p-4 text-right">
                            <button onClick={() => openMovementModal(product)} className="w-9 h-9 inline-flex items-center justify-center text-white bg-mrts-blue hover:bg-mrts-hover rounded-xl shadow-md shadow-blue-500/20 transition hover:-translate-y-0.5 ml-auto" title="Novo Lançamento">
                                <PackagePlus size={18} />
                            </button>
                        </td>
                    </tr>
                  )
              })}
              {filteredProducts.length === 0 && (
                  <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 font-medium">Nenhum produto atende a este filtro.</td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: MOVIMENTAÇÃO */}
      {isMovementModalOpen && selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 flex flex-col border border-gray-100">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white z-10 rounded-t-3xl text-slate-800">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <PackagePlus size={22} className="text-mrts-blue" /> Novo Lançamento
                    </h2>
                    <button onClick={() => setMovementModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>
                
                <div className="p-6 flex flex-col gap-5">
                    <div className="bg-slate-50 p-4 rounded-xl border border-gray-100 mb-2">
                        <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Produto Selecionado</p>
                        <p className="font-bold text-slate-800">{selectedProduct.iconUrl} {selectedProduct.name}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setType('IN')} className={`py-3 px-4 rounded-xl font-bold border transition flex items-center justify-center gap-2 ${type==='IN' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}>
                            <TrendingUp size={18}/> Entrada (NF)
                        </button>
                        <button onClick={() => setType('OUT_MANUAL')} className={`py-3 px-4 rounded-xl font-bold border transition flex items-center justify-center gap-2 ${type==='OUT_MANUAL' ? 'bg-orange-50 text-orange-500 border-orange-200' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}>
                            <TrendingDown size={18}/> Saída/Perda
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Quantidade ({selectedProduct.unit})</label>
                            <input type="number" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full bg-white border border-mrts-blue/30 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-bold text-mrts-blue text-lg"/>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Data</label>
                            <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-medium text-slate-800"/>
                        </div>
                    </div>

                    {type === 'IN' && (
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Nº do Documento / Nota Fiscal</label>
                            <input type="text" placeholder="Adicione para rastreio" value={document} onChange={e => setDocument(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-medium text-slate-800"/>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Observações <span className="text-[10px] text-gray-400 normal-case font-normal">(Motivos p/ Baixa, por ex)</span></label>
                        <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-medium text-slate-800"></textarea>
                    </div>

                    <button disabled={isPending} onClick={handleSaveMovement} className={`w-full mt-4 text-white font-bold py-4 rounded-xl transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 ${type==='IN' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-orange-500 hover:bg-orange-600'}`}>
                        {isPending ? 'Lançando...' : 'Confirmar Lançamento'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL: ESTOQUE MINIMO */}
      {isMinModalOpen && selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 flex flex-col border border-gray-100">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white z-10 rounded-t-3xl text-slate-800">
                    <h2 className="text-xl font-bold flex items-center gap-2">Limiar de Alerta</h2>
                    <button onClick={() => setMinModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-sm text-gray-500 mb-4 whitespace-normal">Defina a quantidade mínima aceitável para <b>{selectedProduct.name}</b>. Avisaremos quando baixar disso.</p>
                    <input type="number" step="0.01" value={minQty} onChange={e => setMinQty(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue font-bold text-center text-xl mb-4"/>
                    <button disabled={isPending} onClick={handleSaveMin} className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl hover:bg-slate-800 transition shadow-md">
                        Salvar Limite
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL: NF IA (FOTO) */}
      {isNfModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[100] flex flex-col items-center justify-start sm:justify-center p-0 sm:p-4 overflow-y-auto">
            <div className="bg-white/95 backdrop-blur-3xl sm:rounded-3xl w-full max-w-4xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 flex flex-col border border-gray-100 min-h-[100dvh] sm:min-h-0 relative my-auto">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 text-slate-800 shrink-0 sticky top-0 bg-white z-20 sm:rounded-t-3xl shadow-sm">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Camera size={22} className="text-mrts-blue" />
                            Entrada Inteligente
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">Carregue a foto da NF e a IA lerá os dados.</p>
                    </div>
                    
                    <button onClick={() => {
                        setNfModalOpen(false);
                        setParsedNfData(null);
                    }} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition shrink-0">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto">
                    {!parsedNfData ? (
                        <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-50 border-2 border-dashed border-gray-200 rounded-3xl relative p-8 text-center transition hover:border-mrts-blue group">
                            {isParsingNf ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 border-4 border-gray-200 border-t-mrts-blue rounded-full animate-spin"></div>
                                    <h3 className="font-bold text-slate-800 text-lg">A IA está lendo sua nota fiscal...</h3>
                                    <p className="text-sm text-gray-500 max-w-xs leading-relaxed">Extraindo nomes dos produtos, quantidades, preços vitais e até o número da nota de forma autônoma.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-mrts-blue mb-5 group-hover:scale-110 transition shadow-inner">
                                        <Camera size={32} />
                                    </div>
                                    <h3 className="font-bold text-slate-800 text-xl mb-2">Tirar Foto ou Upload</h3>
                                    <p className="text-sm text-gray-500 mb-8 max-w-sm">Tire uma foto clara do romaneio ou nota fiscal de entrega. PDFs ou imagens são suportados.</p>
                                    
                                    <input 
                                        type="file" 
                                        accept="image/*,.pdf" 
                                        onChange={handleNfUpload}
                                        capture="environment" 
                                        id="file-upload" 
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer object-cover z-10"
                                    />
                                    
                                    <label htmlFor="file-upload" className="bg-slate-900 text-white font-bold py-3.5 px-8 rounded-xl pointer-events-none group-hover:shadow-lg transition mb-4">
                                        Selecionar Câmera / Arquivo
                                    </label>

                                    <button onClick={(e) => { e.stopPropagation(); handleManualEntry(); }} className="relative z-20 bg-white border-2 border-gray-200 text-slate-700 font-bold py-2.5 px-6 rounded-xl hover:border-slate-300 hover:bg-gray-50 transition shadow-sm pointer-events-auto">
                                        Ou Digitar Manualmente
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex flex-wrap items-center justify-between gap-4 bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-emerald-500 shrink-0">
                                        <CheckCircle size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">{parsedNfData.isManual ? 'Lançamento Manual' : 'Leitura Concluída!'}</h3>
                                        <p className="text-xs text-gray-500 font-medium">{parsedNfData.isManual ? 'Selecione os produtos do sistema, quantidade e preço diretamente abaixo.' : 'Você pode revisar e mapear os produtos antes do lançamento.'}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                                    <div className="text-right">
                                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1 block">Nº Documento / CF-e</label>
                                        <input 
                                            type="text" 
                                            value={parsedNfData.documentNumber || ""}
                                            onChange={e => setParsedNfData({...parsedNfData, documentNumber: e.target.value})}
                                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-bold text-slate-800 bg-white w-32 focus:ring-1 focus:ring-mrts-blue focus:border-mrts-blue"
                                        />
                                    </div>
                                    <div className="text-right">
                                        <label className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1 block">Data de Ref.</label>
                                        <input 
                                            type="date"
                                            value={nfDateStr}
                                            onChange={e => setNfDateStr(e.target.value)}
                                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-slate-800 bg-white w-36 focus:ring-1 focus:ring-mrts-blue focus:border-mrts-blue"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white border text-sm border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse whitespace-nowrap">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-gray-200 text-xs font-bold text-slate-600 uppercase tracking-wide">
                                                {!parsedNfData.isManual && <th className="p-4 w-[40%]">Lido da Nota (Original)</th>}
                                                <th className={`p-4 ${parsedNfData.isManual ? 'w-[60%]' : 'w-[40%]'}`}>Produto no Sistema</th>
                                                <th className="p-4 text-center">Qtd.</th>
                                                <th className="p-4 text-right">R$ Custo Un.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {parsedNfData.items?.map((item: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-slate-50">
                                                    {!parsedNfData.isManual && (
                                                        <td className="p-4">
                                                            <span className="font-bold text-slate-800 block truncate" title={item.name}>{item.name}</span>
                                                        </td>
                                                    )}
                                                    <td className="p-4">
                                                        <select 
                                                            value={mappedItems[idx]?.productId || ''} 
                                                            onChange={(e) => {
                                                                const newM = {...mappedItems};
                                                                newM[idx].productId = e.target.value;
                                                                setMappedItems(newM);
                                                            }}
                                                            className={`w-full max-w-[250px] truncate text-sm px-3 py-2 rounded-xl focus:ring-1 focus:ring-mrts-blue outline-none border transition-colors ${mappedItems[idx]?.productId ? 'border-mrts-blue/50 bg-blue-50/20 text-mrts-blue font-bold shadow-sm' : 'border-gray-200 font-medium text-slate-700 hover:border-gray-300'}`}
                                                        >
                                                            <option value="" disabled className="text-gray-400">--- Associar ---</option>
                                                            {products.map((p: any) => (
                                                                <option key={p.id} value={p.id}>{p.iconUrl} {p.name}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="p-4">
                                                        <input 
                                                            type="text" 
                                                            value={mappedItems[idx]?.quantity || ''}
                                                            onChange={(e) => {
                                                                const newM = {...mappedItems};
                                                                newM[idx].quantity = e.target.value;
                                                                setMappedItems(newM);
                                                            }}
                                                            className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-bold text-center mx-auto block focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue"
                                                        />
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <input 
                                                            type="text" 
                                                            value={mappedItems[idx]?.price || ''}
                                                            onChange={(e) => {
                                                                const newM = {...mappedItems};
                                                                newM[idx].price = e.target.value;
                                                                setMappedItems(newM);
                                                            }}
                                                            className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right ml-auto block focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue"
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!parsedNfData.items || parsedNfData.items.length === 0) && (
                                                <tr>
                                                    <td colSpan={4} className="p-8 text-center text-gray-500 font-medium bg-slate-50">
                                                        {parsedNfData.isManual ? "Tabela vazia. Comece adicionando o primeiro produto logo abaixo." : "A IA não encontrou itens claros. Cancele e tire uma foto mais focada!"}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="p-4 bg-slate-50/50 border-t border-gray-100 flex justify-center">
                                    <button onClick={handleAddManualRow} className="text-sm font-bold text-mrts-blue bg-blue-50 border border-blue-100 px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-blue-100 transition shadow-sm">
                                        <PackagePlus size={18} /> Adicionar Linha à Tabela
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {parsedNfData && (
                    <div className="p-4 sm:p-6 border-t border-gray-100 bg-slate-50 shrink-0 sticky bottom-0 sm:rounded-b-3xl mt-auto z-20 flex justify-between items-center">
                        <button 
                            type="button" 
                            disabled={isPending}
                            onClick={() => setParsedNfData(null)}
                            className="text-sm font-bold text-gray-500 hover:text-gray-700 px-4 py-2"
                        >
                            Refazer Foto
                        </button>
                        <button 
                            disabled={isPending || Object.values(mappedItems).some(m => !m.productId)} 
                            onClick={handleBatchSaveNf} 
                            className="bg-slate-900 text-white font-bold py-3.5 px-8 rounded-xl hover:bg-slate-800 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isPending ? <RefreshCw size={18} className="animate-spin" /> : <PackagePlus size={18} />}
                            {isPending ? 'Lançando...' : 'Finalizar e Lançar'}
                        </button>
                    </div>
                )}
            </div>
        </div>
      )}

    </div>
  );
}
