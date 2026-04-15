'use client';

import { useState, useTransition } from 'react';
import { PackagePlus, Edit3, X, AlertTriangle, AlertCircle, TrendingDown, TrendingUp, Filter, Camera, UploadCloud, CheckCircle, RefreshCw, ZoomIn, ZoomOut, Maximize, CheckSquare, ArrowRight, Check, Download } from 'lucide-react';
import { registerStockMovement, updateMinStock, registerBatchStockMovement } from '../../actions/stock';
import { parseInvoiceImage } from '../../actions/invoice-ai';
import { quickCreateProductFromInvoice } from '../../actions/products';

export default function EstoqueClient({ initialProducts }: any) {
  const [products, setProducts] = useState<any[]>(initialProducts || []);
  const [filter, setFilter] = useState('ALL'); // ALL, LOW, HISTORY
  
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

  // Form states - NF IA  // NFC IA State
  const [isNfModalOpen, setNfModalOpen] = useState(false);
  const [nfFile, setNfFile] = useState<File | null>(null);
  const [isParsingNf, setParsingNf] = useState(false);
  const [parsedNfData, setParsedNfData] = useState<any>(null);
  const [nfImageUrl, setNfImageUrl] = useState<string | null>(null);
  const [mappedItems, setMappedItems] = useState<Record<number, any>>({});
  const [nfDateStr, setNfDateStr] = useState(new Date().toISOString().split('T')[0]);

  // NEW: DE-PARA Verification & Zoom State
  const [verifiedRows, setVerifiedRows] = useState<Set<number>>(new Set());
  const [imgZoom, setImgZoom] = useState(1);
  const [imgPos, setImgPos] = useState({ x: 0, y: 0 });

  const [isPending, startTransition] = useTransition();

  const handleDownloadImage = async () => {
    if (!nfImageUrl) return;
    try {
        const response = await fetch(nfImageUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `nota-fiscal-${parsedNfData?.numero_nf || 'doc'}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Erro ao baixar imagem:", error);
        alert("Não foi possível baixar a imagem.");
    }
  };

  const updateItemName = (idx: number, newName: string) => {
    if (!parsedNfData) return;
    const newProducts = [...parsedNfData.produtos];
    newProducts[idx].nome = newName;
    setParsedNfData({ ...parsedNfData, produtos: newProducts });
  };

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
          const apiRes = await fetch('/api/ocr', {
              method: 'POST',
              body: formData
          });
          const res = await apiRes.json();
          
          if (res.success && res.data) {
              setParsedNfData(res.data);
              
              // Sincronizar data da nota se extraída pela IA
              if (res.data.data && /^\d{4}-\d{2}-\d{2}$/.test(res.data.data)) {
                  setNfDateStr(res.data.data);
              }
              setVerifiedRows(new Set()); // Reset verification for new NF
              setImgZoom(1); // Reset zoom
              setImgPos({ x: 0, y: 0 });
              // Agora usamos a URL persistente do Supabase Storage retornada pela API
              setNfImageUrl(res.imageUrl || URL.createObjectURL(file));
              
              const initialMap: Record<number, any> = {};
              res.data.produtos?.forEach((item: any, i: number) => { // User now asked for list of 'produtos'
                  // Tenta auto-mapear buscando se o nome do produto no sistema contem parte do nome da nota ou vice versa
                  let matchedId = '';
                  if (item.nome) { // and keys are nome, quantidade, preco_unitario
                      const lowerItem = String(item.nome).toLowerCase();
                      const match = products.find((p: any) => p.name.toLowerCase().includes(lowerItem) || lowerItem.includes(p.name.toLowerCase()));
                      if (match) matchedId = match.id;
                  }

                  initialMap[i] = {
                      productId: matchedId,
                      quantity: item.quantidade,
                      price: item.preco_unitario
                  };
              });
              setMappedItems(initialMap);
          } else {
              alert("Erro na IA: " + (res.error || "Tente novamente."));
              setNfFile(null);
          }
      } catch (err) {
          alert("Falha de conexão com a API OCR.");
          setNfFile(null);
      }
      setParsingNf(false);
  };

  const handleBatchSaveNf = () => {
      const movementsToSave: any[] = [];
      
      // Helper function to handle Brazilian number formats
      const parseLocalNumber = (val: any) => {
          if (!val) return 0;
          let str = String(val);
          // Remove potential thousand separators (.) and replace comma decimal (,) with point
          // Example: "1.250,50" -> "1250.50"
          str = str.replace(/\.(?=\d{3}(,|$))/g, '').replace(',', '.');
          return parseFloat(str) || 0;
      };

      for (const [idx, mOptions] of Object.entries(mappedItems)) {
          if (!mOptions.productId) {
              return alert(`Associe todos os itens à um produto no sistema para continuar.`);
          }
          movementsToSave.push({
              productId: mOptions.productId,
              quantity: parseLocalNumber(mOptions.quantity),
              price: parseLocalNumber(mOptions.price)
          });
      }

      if (movementsToSave.length === 0) return alert("Nenhum item válido.");

      startTransition(async () => {
          try {
              const res = await registerBatchStockMovement(
                  movementsToSave,
                  parsedNfData?.numero_nf || '',
                  nfImageUrl,
                  "Entrada NF-e IA",
                  nfDateStr
              );

              if (res.success) {
                  alert("Estoque atualizado com sucesso via IA!");
                  setNfModalOpen(false);
                  setParsedNfData(null);
                  setNfImageUrl(null);
                  setVerifiedRows(new Set());
                  window.location.reload();
              }
          } catch(e: any) {
              console.error("Erro ao registrar NF:", e);
              alert("Erro ao salvar itens: " + (e.message || "Erro desconhecido"));
          }
      });
  };

  const handleManualEntry = () => {
      setParsedNfData({
          numero_nf: '',
          isManual: true,
          produtos: []
      });
      setVerifiedRows(new Set());
      setMappedItems({});
      setNfImageUrl(null);
  };

  const handleAddManualRow = () => {
      const newItems = [...(parsedNfData.produtos || []), { nome: 'Item Manual', quantidade: 1, preco_unitario: 0 }];
      const newIdx = newItems.length - 1;
      setParsedNfData({ ...parsedNfData, produtos: newItems });
      setMappedItems({ ...mappedItems, [newIdx]: { productId: '', quantity: 1, price: 0 } });
  };

  const handleQuickCreate = (idx: number, name: string, cost: number) => {
      const finalName = prompt("Confirme o nome do novo produto a ser cadastrado:", name) || name;
      if (!finalName) return;

      startTransition(async () => {
          try {
              const parsedCost = parseFloat(String(cost).replace(',', '.')) || 0;
              const res = await quickCreateProductFromInvoice(finalName, parsedCost);
              if (res.success && res.product) {
                  // Adiciona o produto na lista local para aparecer no select
                  setProducts((prev: any[]) => [...prev, res.product]);
                  // Seleciona automaticamente o novo ID para este item
                  const newM = {...mappedItems};
                  newM[idx].productId = res.product.id;
                  setMappedItems(newM);
                  //alert(`Produto "${finalName}" cadastrado!`);
              }
          } catch(e) {
              alert("Erro ao criar produto.");
          }
      });
  };

  const toggleVerified = (idx: number) => {
      const newV = new Set(verifiedRows);
      if (newV.has(idx)) newV.delete(idx);
      else newV.add(idx);
      setVerifiedRows(newV);
  };

  const filteredProducts = products.filter((p: any) => {
      if (filter === 'LOW') {
          const qty = p.stock?.quantity || 0;
          const min = p.stock?.minQuantity || 5;
          return qty <= min;
      }
      return true;
  });

  // Filtra histórico de movimentos
  const allMovements = products.flatMap((p: any) => p.stockMovements?.map((m:any) => ({...m, product: p})) || []).sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Controle de Estoque</h1>
          <p className="text-gray-500 text-sm mt-1">Monitore o fluxo de insumos e gerencie notas fiscais.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => {
                setNfModalOpen(true);
                setParsedNfData(null);
                setNfFile(null);
            }} className="px-5 py-2 rounded-xl text-sm font-bold bg-mrts-blue text-white shadow-sm transition flex items-center gap-2 hover:bg-mrts-hover hover:scale-105 transform cursor-pointer relative">
                <Camera size={18}/> Ler Nota por Foto
            </button>

            <div className="flex overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-200 p-1 hide-scrollbar">
                <button onClick={() => setFilter('ALL')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 whitespace-nowrap ${filter === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                    <Filter size={16}/> Produtos
                </button>
                <button onClick={() => setFilter('LOW')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 whitespace-nowrap ${filter === 'LOW' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                    <AlertCircle size={16}/> Baixo
                </button>
                <button onClick={() => setFilter('HISTORY')} className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 whitespace-nowrap ${filter === 'HISTORY' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                    <PackagePlus size={16}/> Lançamentos (NF)
                </button>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {filter !== 'HISTORY' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase text-gray-500 tracking-wider">
                  <th className="p-4 font-bold">Produto</th>
                  <th className="p-4 font-bold text-center">Status</th>
                  <th className="p-4 font-bold text-right">Mínimo (Alerta)</th>
                  <th className="p-4 font-bold text-right">Quantidade Atual</th>
                  <th className="p-4 font-bold text-right">Ação</th>
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase text-gray-500 tracking-wider">
                  <th className="p-4 font-bold">Data</th>
                  <th className="p-4 font-bold">Produto</th>
                  <th className="p-4 font-bold">Tipo</th>
                  <th className="p-4 font-bold text-center">Documento / Nota</th>
                  <th className="p-4 font-bold text-right">Qtd</th>
                  <th className="p-4 font-bold">Anexo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allMovements.map((mov: any) => (
                  <tr key={mov.id} className="hover:bg-slate-50 transition">
                      <td className="p-4 text-sm font-medium text-gray-500">{new Date(mov.date).toLocaleDateString('pt-BR')}</td>
                      <td className="p-4 font-bold text-sm text-slate-800">{mov.product?.name}</td>
                      <td className="p-4">
                          {mov.type === 'IN' ? (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-black uppercase">Entrada</span>
                          ) : mov.type === 'OUT_SALE' ? (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-black uppercase">Venda</span>
                          ) : (
                              <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-black uppercase">Saída/Perda</span>
                          )}
                      </td>
                      <td className="p-4 text-center">
                          <span className="text-sm font-medium text-gray-600">{mov.document || '-'}</span>
                      </td>
                      <td className="p-4 text-right">
                          <span className={`text-sm font-black ${mov.type === 'IN' ? 'text-emerald-500' : 'text-orange-500'}`}>
                              {mov.type === 'IN' ? '+' : '-'}{mov.quantity}
                          </span>
                      </td>
                      <td className="p-4">
                          {mov.imageUrl ? (
                              <a href={mov.imageUrl} target="_blank" rel="noreferrer" className="text-mrts-blue hover:underline font-bold text-xs flex items-center gap-1">
                                  <Camera size={14}/> Ver NF
                              </a>
                          ) : '-'}
                      </td>
                  </tr>
                ))}
                {allMovements.length === 0 && (
                    <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500 font-medium">Nenhum lançamento no histórico.</td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: MOVIMENTAÇÃO MANUAL */}
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

      {/* MODAL: NF IA (FOTO) COM SPLIT VIEW PARA VER A FOTO */}
      {isNfModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex flex-col items-center justify-start sm:justify-center p-0 sm:p-4 overflow-hidden">
            <div className="bg-white/95 backdrop-blur-3xl sm:rounded-3xl w-full max-w-6xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 flex flex-col border border-gray-100 h-[100dvh] sm:h-[90dvh] relative">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 text-slate-800 shrink-0 bg-white z-20 sm:rounded-t-3xl shadow-sm">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Camera size={22} className="text-mrts-blue" />
                            Entrada Inteligente
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">A IA colete dados como Nº NF, Qtd., Preço e Produto.</p>
                    </div>
                    
                    <button onClick={() => {
                        setNfModalOpen(false);
                        setParsedNfData(null);
                        setNfImageUrl(null);
                    }} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition shrink-0">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                    {/* ESQUERDA: Visão da Foto da Nota (se existir) */}
                    {nfImageUrl && (
                        <div className="lg:w-5/12 bg-slate-900 border-r border-gray-200 flex flex-col relative overflow-hidden group/img">
                            <div className="bg-gray-800/80 backdrop-blur-md p-2 text-center text-[10px] text-gray-300 uppercase font-black tracking-widest absolute top-0 w-full z-20 shadow-sm flex items-center justify-center gap-4">
                                <span>Documento Original</span>
                                <div className="flex items-center gap-1.5 bg-slate-700 rounded-full px-2 py-0.5 border border-slate-600">
                                    <button onClick={() => setImgZoom(z => Math.max(0.5, z - 0.25))} className="hover:text-white transition p-0.5"><ZoomOut size={14}/></button>
                                    <span className="min-w-[30px] text-white tabular-nums">{(imgZoom * 100).toFixed(0)}%</span>
                                    <button onClick={() => setImgZoom(z => Math.min(3, z + 0.25))} className="hover:text-white transition p-0.5"><ZoomIn size={14}/></button>
                                    <button onClick={() => { setImgZoom(1); setImgPos({x:0, y:0}); }} className="hover:text-white border-x border-slate-600 px-1.5 mx-0.5 transition p-0.5" title="Reset Zoom"><Maximize size={12}/></button>
                                    <button onClick={handleDownloadImage} className="hover:text-emerald-400 transition p-0.5 ml-1" title="Baixar Foto Original"><Download size={14}/></button>
                                </div>
                            </div>

                            <div 
                                className="flex-1 overflow-auto cursor-move p-4 pt-10 flex justify-center bg-slate-950 relative overflow-hidden"
                                onWheel={(e) => {
                                    if (e.ctrlKey) {
                                        setImgZoom(z => Math.min(3, Math.max(0.5, z + (e.deltaY < 0 ? 0.1 : -0.1))));
                                    }
                                }}
                            >
                                <img 
                                    src={nfImageUrl} 
                                    alt="Nota Fiscal Analisada" 
                                    style={{ 
                                        transform: `scale(${imgZoom}) translate(${imgPos.x}px, ${imgPos.y}px)`,
                                        transition: 'transform 0.1s ease-out'
                                    }}
                                    className="object-contain max-w-full h-auto origin-top shadow-2xl" 
                                />
                                
                                <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md text-[10px] text-white px-3 py-1.5 rounded-full z-20 font-medium">
                                    Dica: Ctrl + Scroll para Zoom
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DIREITA: Tabela de Dados e Acertos */}
                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50 relative custom-scrollbar">
                        {!parsedNfData ? (
                            <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-200 rounded-3xl relative p-8 text-center transition hover:border-mrts-blue group shadow-sm">
                                {isParsingNf ? (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-16 h-16 border-4 border-gray-200 border-t-mrts-blue rounded-full animate-spin"></div>
                                        <h3 className="font-bold text-slate-800 text-lg">A IA está lendo sua nota fiscal...</h3>
                                        <p className="text-sm text-gray-500 max-w-xs leading-relaxed">Cruzando informações, extraindo número da NF, preços base e armazenando a foto associada à entrada.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-mrts-blue mb-5 group-hover:scale-110 transition shadow-inner">
                                            <Camera size={32} />
                                        </div>
                                        <h3 className="font-bold text-slate-800 text-xl mb-2">Tirar Foto ou Upload</h3>
                                        <p className="text-sm text-gray-500 mb-8 max-w-sm">Tire uma foto clara do romaneio ou nota fiscal de entrega para lançar o estoque automatizado.</p>
                                        
                                        <input 
                                            type="file" 
                                            accept="image/*,.pdf" 
                                            onChange={handleNfUpload}
                                            capture="environment" 
                                            id="file-upload" 
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer object-cover z-10"
                                        />
                                        
                                        <label htmlFor="file-upload" className="bg-slate-900 text-white font-bold py-3.5 px-8 rounded-xl pointer-events-none flex items-center gap-2 group-hover:shadow-lg transition mb-4">
                                            <span>✨</span> Ler Nota com IA
                                        </label>

                                        <button onClick={(e) => { e.stopPropagation(); handleManualEntry(); }} className="relative z-20 bg-white border-2 border-gray-200 text-slate-700 font-bold py-2.5 px-6 rounded-xl hover:border-slate-300 hover:bg-gray-50 transition shadow-sm pointer-events-auto">
                                            Ou Digitar Manualmente
                                        </button>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex flex-wrap items-center justify-between gap-4 bg-white shadow-sm p-5 rounded-2xl border border-gray-200">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center shadow-inner text-emerald-500 shrink-0">
                                            <CheckCircle size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800">{parsedNfData.isManual ? 'Lançamento Manual' : 'Leitura Concluída!'}</h3>
                                            <p className="text-xs text-gray-500 font-medium">{parsedNfData.isManual ? 'Selecione os produtos abaixo.' : 'Confira os mapeamentos inteligentes da IA antes do lançamento.'}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center w-full lg:w-auto flex-wrap justify-end">
                                        {!parsedNfData.isManual && parsedNfData.fornecedor && (
                                            <div className="text-right flex-1 sm:flex-none">
                                                <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1 block">Fornecedor / CNPJ</label>
                                                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 w-full sm:w-48 truncate">
                                                    {parsedNfData.fornecedor} {parsedNfData.cnpj ? ` - ${parsedNfData.cnpj}` : ''}
                                                </div>
                                            </div>
                                        )}
                                        <div className="text-right">
                                            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1 block">Nº Nota Fiscal / Documento</label>
                                            <input 
                                                type="text" 
                                                value={parsedNfData.numero_nf || ""}
                                                onChange={e => setParsedNfData({...parsedNfData, numero_nf: e.target.value})}
                                                className="px-3 py-2 border-2 border-mrts-blue/30 rounded-xl text-lg font-black text-mrts-blue bg-white w-full sm:w-48 focus:ring-2 focus:ring-mrts-blue outline-none text-center"
                                                placeholder="N/A"
                                            />
                                        </div>
                                        <div className="text-right">
                                            <label className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1 block">Data de Ref.</label>
                                            <input 
                                                type="date"
                                                value={nfDateStr}
                                                onChange={e => setNfDateStr(e.target.value)}
                                                className="px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold text-slate-800 bg-white w-full sm:w-40 focus:border-mrts-blue outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-4 bg-white shadow-sm p-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/50 to-transparent">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-inner transition-colors ${verifiedRows.size === (parsedNfData.produtos?.length || 0) ? 'bg-emerald-500 text-white' : 'bg-blue-100 text-blue-600'}`}>
                                            {verifiedRows.size === (parsedNfData.produtos?.length || 0) ? <Check size={20} strokeWidth={3}/> : <RefreshCw size={18} className="animate-spin-slow"/>}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-sm">Conferência DE-PARA</h3>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                                {verifiedRows.size} de {parsedNfData.produtos?.length || 0} ITENS VALIDADOS
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <div className="bg-white border-2 border-slate-200 rounded-xl px-4 py-2 text-center min-w-[100px]">
                                            <label className="text-[9px] text-gray-400 font-black uppercase block tracking-tighter">Total Extraído</label>
                                            <span className="text-sm font-black text-slate-700">R$ {parsedNfData.total || parsedNfData.valor_total || '0,00'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white border text-sm border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse min-w-[700px]">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-gray-200 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                    <th className="p-4 w-12 text-center">Status</th>
                                                    {!parsedNfData.isManual && <th className="p-4 w-[30%]">A) Lido na Nota (IA)</th>}
                                                    <th className="p-4 w-[5%] text-center px-0 opacity-40">DE &rarr; PARA</th>
                                                    <th className={`p-4 ${parsedNfData.isManual ? 'w-[60%]' : 'w-[45%]'}`}>B) Produto no Sistema</th>
                                                    <th className="p-4 text-center">Qtd.</th>
                                                    <th className="p-4 text-right">R$ Un.</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {parsedNfData.produtos?.map((item: any, idx: number) => {
                                                    const isVerified = verifiedRows.has(idx);
                                                    return (
                                                        <tr key={idx} className={`transition-colors h-20 ${isVerified ? 'bg-emerald-50/30' : 'hover:bg-slate-50/50'}`}>
                                                            <td className="p-4 text-center">
                                                                <button 
                                                                    onClick={() => toggleVerified(idx)}
                                                                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isVerified ? 'bg-emerald-500 text-white shadow-lg' : 'bg-white border-2 border-slate-200 text-slate-300 hover:border-mrts-blue hover:text-mrts-blue'}`}
                                                                >
                                                                    <Check size={20} strokeWidth={3} />
                                                                </button>
                                                            </td>
                                                            {!parsedNfData.isManual && (
                                                                <td className="p-4">
                                                                    <input 
                                                                        type="text"
                                                                        value={item.nome || ''}
                                                                        onChange={(e) => updateItemName(idx, e.target.value)}
                                                                        className="font-bold text-slate-700 block w-full bg-transparent border-b border-dashed border-gray-300 focus:border-mrts-blue focus:bg-white outline-none text-xs py-1 transition-all"
                                                                        title="Clique para corrigir o que a IA leu"
                                                                    />
                                                                    <div className="flex gap-2 mt-1">
                                                                        <span className="text-[10px] bg-slate-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">Q: {item.quantidade}</span>
                                                                        <span className="text-[10px] bg-slate-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">R$ {item.preco_unitario}</span>
                                                                    </div>
                                                                </td>
                                                            )}
                                                            <td className="p-4 text-center px-0 opacity-20">
                                                                <ArrowRight size={16} />
                                                            </td>
                                                            <td className="p-4">
                                                                <select 
                                                                    value={mappedItems[idx]?.productId === 'NEW' ? 'NEW' : (mappedItems[idx]?.productId || '')} 
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        if (val === 'NEW') {
                                                                            handleQuickCreate(idx, item.nome, item.preco_unitario || mappedItems[idx]?.price);
                                                                        } else {
                                                                            const newM = {...mappedItems};
                                                                            newM[idx].productId = val;
                                                                            setMappedItems(newM);
                                                                        }
                                                                    }}
                                                                    className={`w-full max-w-[280px] truncate text-xs px-3 py-2.5 rounded-xl focus:ring-2 focus:ring-mrts-blue outline-none border transition-all ${mappedItems[idx]?.productId && mappedItems[idx]?.productId !== 'NEW' ? 'border-mrts-blue bg-blue-50/50 text-mrts-blue font-bold shadow-sm' : 'border-gray-200 font-bold text-slate-400 hover:border-gray-300 bg-white'}`}
                                                                >
                                                                    <option value="" disabled className="text-gray-400">--- Seleção no Sistema ---</option>
                                                                    <option value="NEW" className="font-bold text-emerald-600 bg-emerald-50">✨ Criar Novo Produto</option>
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
                                                                    className="w-16 px-2 py-2 border-2 border-slate-100 rounded-lg text-xs font-black text-center mx-auto block focus:border-mrts-blue outline-none bg-white"
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
                                                                    className="w-20 px-2 py-2 border-2 border-slate-100 rounded-lg text-xs font-black text-right ml-auto block focus:border-mrts-blue outline-none bg-white font-mono"
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {(!parsedNfData.produtos || parsedNfData.produtos.length === 0) && (
                                                    <tr>
                                                        <td colSpan={4} className="p-8 text-center text-gray-500 font-medium bg-white">
                                                            {parsedNfData.isManual ? "Tabela vazia. Comece adicionando o primeiro produto logo abaixo." : "A IA não encontrou itens claros. Cancele e tire uma foto mais focada!"}
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="p-4 bg-slate-50 border-t border-gray-100 flex justify-center">
                                        <button onClick={handleAddManualRow} className="text-sm font-bold text-slate-600 bg-white border border-gray-200 px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-gray-50 transition shadow-sm">
                                            <PackagePlus size={18} /> Adicionar Linha Manualmente
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {parsedNfData && (
                    <div className="p-4 sm:p-6 border-t border-gray-100 bg-white shrink-0 sticky bottom-0 sm:rounded-b-3xl mt-auto z-20 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
                        <button 
                            type="button" 
                            disabled={isPending}
                            onClick={() => { setParsedNfData(null); setNfImageUrl(null); }}
                            className="w-full sm:w-auto text-sm font-bold text-red-500 bg-red-50 hover:bg-red-100 rounded-xl px-5 py-3 transition"
                        >
                            Refazer Foto
                        </button>
                        
                        {!parsedNfData.isManual && verifiedRows.size < (parsedNfData.produtos?.length || 0) && (
                            <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-blue-100 animate-pulse">
                                <AlertCircle size={14}/>
                                Verifique todos os itens (Clique no Check) para liberar
                            </div>
                        )}

                        <button 
                            disabled={isPending || Object.values(mappedItems).some(m => !m.productId) || (!parsedNfData.isManual && verifiedRows.size < (parsedNfData.produtos?.length || 0))} 
                            onClick={handleBatchSaveNf} 
                            className="w-full sm:w-auto bg-emerald-500 text-white font-black text-lg py-3.5 px-8 rounded-xl hover:bg-emerald-600 transition shadow-xl shadow-emerald-500/30 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-3 transform active:scale-95"
                        >
                            {isPending ? <RefreshCw size={22} className="animate-spin" /> : <CheckCircle size={22} strokeWidth={3} />}
                            {isPending ? 'LANÇANDO NO ESTOQUE...' : 'LANÇAR ENTRADAS'}
                        </button>
                    </div>
                )}
            </div>
        </div>
      )}

    </div>
  );
}

