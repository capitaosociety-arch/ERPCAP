'use client';

import { useState, useTransition } from 'react';
import { Plus, Edit3, X, DollarSign, ToggleLeft, ToggleRight, Sheet, Upload, CheckCircle2, RefreshCw, Trash2 } from 'lucide-react';
import { updateProductPrice, upsertProduct, toggleProductStatus, deleteProduct } from '../../actions/products';
import { processProductsWithAI, saveBatchProducts } from '../../actions/import-actions';
import { downloadExcel } from '../../../lib/excel-export';
import * as XLSX from 'xlsx';

export default function ProductsClient({ initialProducts, categories = [] }: any) {
  const [products, setProducts] = useState(initialProducts);
  
  // Price Modal
  const [isPriceModalOpen, setPriceModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [invoice, setInvoice] = useState("");
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);

  // Product Form Modal (Create / Edit)
  const [isFormModalOpen, setFormModalOpen] = useState(false);
  const [formData, setFormData] = useState<any>({});

  // Import Modal
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  
  const [isPending, startTransition] = useTransition();

  // ----- Price Actions -----
  const openPriceModal = (product: any) => {
    setEditingProduct(product);
    setPrice(product.price.toString());
    setCost((product.cost || 0).toString());
    setInvoice("");
    setDateStr(new Date().toISOString().split('T')[0]);
    setPriceModalOpen(true);
  };

  const handleSavePrice = () => {
     if (!editingProduct) return;
     startTransition(async () => {
         try {
             await updateProductPrice(
                 editingProduct.id, 
                 parseFloat(price.replace(',','.')), 
                 parseFloat(cost.replace(',','.')), 
                 invoice, 
                 dateStr
             );
             // Update local state
             setProducts(products.map((p: any) => p.id === editingProduct.id ? {
                 ...p, price: parseFloat(price.replace(',','.')), cost: parseFloat(cost.replace(',','.')),
                 priceHistories: [{
                     id: Math.random().toString(), price: parseFloat(price.replace(',','.')), cost: parseFloat(cost.replace(',','.')), invoice, date: new Date(dateStr)
                 }, ...(p.priceHistories || [])]
             } : p));
             setPriceModalOpen(false);
             alert("Preço salvo com sucesso!");
         } catch(e) {
             alert("Erro ao tentar atualizar o preço do produto.");
         }
     });
  };

  // ----- Product CRUD Actions -----
  const openFormModal = (product?: any) => {
      if (product) {
          setFormData({
              id: product.id,
              name: product.name,
              categoryId: product.categoryId,
              price: product.price.toString(),
              cost: (product.cost || 0).toString(),
              iconUrl: product.iconUrl || "",
              unit: product.unit || "UN"
          });
      } else {
          setFormData({
              id: undefined, name: "", categoryId: categories[0]?.id || "", price: "0", cost: "0", iconUrl: "🍔", unit: "UN"
          });
      }
      setFormModalOpen(true);
  };

  const handleSaveProduct = () => {
      if (!formData.name || !formData.categoryId) return alert("Preencha o nome e categoria");
      
      startTransition(async () => {
          try {
              await upsertProduct({
                  id: formData.id,
                  name: formData.name,
                  categoryId: formData.categoryId,
                  price: parseFloat(formData.price.replace(',', '.')),
                  cost: parseFloat(formData.cost.replace(',', '.')),
                  iconUrl: formData.iconUrl,
                  unit: String(formData.unit).substring(0, 2).toUpperCase()
              });
              alert("Produto salvo com sucesso! (A página vai recarregar)");
              setFormModalOpen(false);
              window.location.reload();
          } catch (e) {
              alert("Erro ao salvar produto");
          }
      });
  };

  const handleExcelUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingAI(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);

            // Chamar IA para mapear
            const res = await processProductsWithAI(data);
            if (res.success) {
                setImportPreview(res.data);
                setImportModalOpen(true);
            }
        } catch (error) {
            alert("Erro ao ler planilha ou processar com IA.");
        } finally {
            setIsProcessingAI(false);
        }
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirmBatchZip = () => {
    startTransition(async () => {
        try {
            await saveBatchProducts(importPreview);
            alert("Produtos importados com sucesso!");
            setImportModalOpen(false);
            window.location.reload();
        } catch (error) {
            alert("Erro ao salvar lote de produtos.");
        }
    });
  };

  const handleToggleStatus = (prod: any) => {
      startTransition(async () => {
          await toggleProductStatus(prod.id, !prod.isActive);
          setProducts(products.map((p: any) => p.id === prod.id ? { ...p, isActive: !prod.isActive } : p));
      });
  };

  const handleDeleteProduct = (productId: string) => {
    if (!window.confirm("CUIDADO: Tem certeza que deseja excluir permanentemente este produto? Esta ação não pode ser desfeita.")) return;

    startTransition(async () => {
        const res = await deleteProduct(productId);
        if (res.success) {
            setProducts(products.filter((p: any) => p.id !== productId));
            alert("Produto excluído com sucesso.");
        } else {
            alert(res.error || "Erro ao excluir produto.");
        }
    });
  };

  const handleExportExcel = () => {
    const exportData = products.map((p: any) => ({
      "ID": p.id,
      "Produto": p.name,
      "Categoria": p.category?.name || "Sem categoria",
      "Preço Custo (R$)": p.cost || 0,
      "Preço Venda (R$)": p.price || 0,
      "Estoque Atual": p.stock?.quantity || 0,
      "Unidade": p.unit || "UN",
      "Status": p.isActive ? "Ativo" : "Inativo"
    }));
    downloadExcel(exportData, "Relatorio_Produtos");
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Produtos</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie seu cardápio, estoque e preços.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className={`cursor-pointer bg-white border border-gray-200 text-slate-600 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 hover:bg-gray-50 transition-all ${isProcessingAI ? 'opacity-50 pointer-events-none' : ''}`}>
            {isProcessingAI ? <RefreshCw size={18} className="animate-spin" /> : <Upload size={18} />}
            {isProcessingAI ? 'Processando...' : 'Importar Planilha (IA)'}
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleExcelUpload} />
          </label>

          <button onClick={() => openFormModal()} className="bg-mrts-blue text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 flex items-center gap-2 hover:bg-mrts-hover hover:-translate-y-0.5 transition-all">
            <Plus size={18} /> Novo Produto
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 text-xs uppercase text-gray-500 tracking-wider">
                <th className="p-4 font-bold">Produto</th>
                <th className="p-4 font-bold">Categoria</th>
                <th className="p-4 font-bold">Custo (Base)</th>
                <th className="p-4 font-bold">Preço de Venda</th>
                <th className="p-4 font-bold">Estoque</th>
                <th className="p-4 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.map((product: any) => (
                <tr key={product.id} className={`hover:bg-blue-50/40 transition ${!product.isActive ? 'opacity-50 grayscale' : ''}`}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white shadow-sm border border-gray-100 rounded-lg flex items-center justify-center text-xl shrink-0">{product.iconUrl}</div>
                      <div>
                        <p className="font-bold text-gray-800 text-sm line-clamp-1">{product.name}</p>
                        <div className="mt-1">
                        {product.isActive ? (
                          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold uppercase tracking-wide">Ativo</span>
                        ) : (
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold uppercase tracking-wide">Inativo</span>
                        )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-gray-500 font-semibold bg-gray-50/10">
                    {product.category?.name || "Sem categoria"}
                  </td>
                  <td className="p-4 text-sm font-bold text-gray-400">
                    <span className="text-[10px] mr-1">R$</span>{(product.cost || 0).toFixed(2).replace('.', ',')}
                  </td>
                  <td className="p-4 text-sm font-black text-slate-800">
                    <span className="text-gray-400 font-medium text-xs mr-1">R$</span>{product.price.toFixed(2).replace('.', ',')}
                  </td>
                  <td className="p-4">
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-lg ${product.stock && product.stock.quantity > product.stock.minQuantity ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                      {product.stock?.quantity || 0} <span className="font-medium text-[10px] uppercase ml-0.5">{product.unit}</span>
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openPriceModal(product)} className="p-2 text-green-600 bg-green-50 hover:bg-green-100 border border-transparent shadow-sm rounded-lg transition" title="Gerenciar Preço e Histórico">
                        <DollarSign size={16} />
                      </button>
                      <button onClick={() => openFormModal(product)} className="p-2 text-gray-400 hover:text-mrts-blue bg-white border border-gray-200 shadow-sm rounded-lg hover:border-mrts-blue transition" title="Editar Produto">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => handleToggleStatus(product)} className={`p-2 shadow-sm rounded-lg border transition ${product.isActive ? 'text-orange-500 bg-orange-50 hover:bg-orange-100 border-none' : 'text-gray-400 bg-white border-gray-200 hover:border-orange-300 hover:text-orange-400'}`} title={product.isActive ? 'Desativar Produto' : 'Ativar Produto'}>
                        {product.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => handleDeleteProduct(product.id)} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 border border-transparent shadow-sm rounded-lg transition" title="Excluir Permanentemente">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button onClick={handleExportExcel} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 hover:bg-emerald-100 transition-all">
          <Sheet size={18} /> Exportar Excel
        </button>
      </div>

      {/* PRICE MODAL */}
      {isPriceModalOpen && editingProduct && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 flex flex-col border border-gray-100 max-h-[90vh]">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white z-10 shrink-0 rounded-t-3xl text-slate-800">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <DollarSign size={22} className="text-green-500" /> Histórico e Ajuste de Preço
                        </h2>
                        <p className="text-sm text-gray-500 mt-1 font-medium">{editingProduct.name}</p>
                    </div>
                    <button onClick={() => setPriceModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 flex flex-col gap-6">
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
                        <h3 className="font-bold text-slate-800 text-sm">Registrar Nova Atualização</h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Preço Custo (R$)</label>
                                <input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-bold text-slate-700"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Preço Venda (R$)</label>
                                <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-blue-50 border border-mrts-blue/30 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-black text-mrts-blue"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Nota Fiscal <span className="text-[10px] text-gray-400 normal-case font-normal">(Opcional)</span></label>
                                <input type="text" placeholder="Ex: NF-e 1234..." value={invoice} onChange={e => setInvoice(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-medium text-slate-700"/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Data</label>
                                <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-medium text-slate-700"/>
                            </div>
                        </div>
                        
                        <button disabled={isPending} onClick={handleSavePrice} className="w-full mt-2 bg-green-500 text-white font-bold py-3.5 rounded-xl hover:bg-green-600 transition shadow-md disabled:opacity-50">
                            {isPending ? 'Salvando...' : 'Salvar Novo Preço'}
                        </button>
                    </div>

                    <div>
                        <h3 className="font-bold text-slate-800 text-sm mb-3 px-1">Histórico de Alterações</h3>
                        
                        {(editingProduct.priceHistories?.length === 0) ? (
                            <div className="text-center py-6 text-sm text-gray-400 font-medium">Nenhum histórico registrado ainda.</div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {editingProduct.priceHistories?.map((hist: any) => (
                                    <div key={hist.id} className="bg-white border border-gray-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-800 text-sm">Venda: R$ {(hist.price||0).toFixed(2).replace('.',',')}</span>
                                            <span className="text-xs text-gray-500 font-medium">Custo: R$ {(hist.cost||0).toFixed(2).replace('.',',')}</span>
                                        </div>
                                        <div className="flex flex-col text-right">
                                            <span className="text-xs text-gray-400 font-bold">{new Date(hist.date).toLocaleDateString('pt-BR')}</span>
                                            {hist.invoice && <span className="text-[10px] bg-gray-100 text-gray-500 px-2 mt-1 rounded font-medium inline-block w-fit ml-auto">NF: {hist.invoice}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* FORM MODAL (CREATE / EDIT) */}
      {isFormModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 flex flex-col border border-gray-100">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white z-10 rounded-t-3xl text-slate-800">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        {formData.id ? 'Editar Produto' : 'Novo Produto'}
                    </h2>
                    <button onClick={() => setFormModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>
                
                <div className="p-6 flex flex-col gap-5">
                    
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Nome do Produto</label>
                        <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-medium text-slate-800"/>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Ícone/Foto (Emoji)</label>
                            <input type="text" value={formData.iconUrl} onChange={e => setFormData({...formData, iconUrl: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-medium text-slate-800"/>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Unidade</label>
                            <input type="text" value={formData.unit} placeholder="UN, KG, L" onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-medium text-slate-800 uppercase"/>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">Categoria</label>
                        <select value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-medium text-slate-800">
                            {categories.map((cat: any) => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Preço Custo Base (R$)</label>
                            <input type="number" step="0.01" value={formData.cost} onChange={e => setFormData({...formData, cost: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-medium text-slate-800"/>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Preço Venda Final (R$)</label>
                            <input type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full bg-white border border-mrts-blue/30 rounded-xl px-4 py-3 focus:outline-none focus:border-mrts-blue focus:ring-1 focus:ring-mrts-blue font-bold text-mrts-blue"/>
                        </div>
                    </div>

                    <button disabled={isPending} onClick={handleSaveProduct} className="w-full mt-4 bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 transition shadow-lg disabled:opacity-50">
                        {isPending ? 'Salvando...' : 'Salvar Informações'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* IMPORT REVIEW MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 flex flex-col border border-gray-100 max-h-[90vh]">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white z-10 rounded-t-3xl text-slate-800">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <CheckCircle2 size={22} className="text-emerald-500" /> Conferir Importação
                        </h2>
                        <p className="text-sm text-gray-500 mt-1 font-medium">A IA interpretou os seguintes itens na sua planilha.</p>
                    </div>
                    <button onClick={() => setImportModalOpen(false)} className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>
                
                <div className="p-0 overflow-y-auto flex-1 bg-white flex flex-col">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                        <thead className="sticky top-0 bg-gray-50 z-20">
                            <tr className="border-b border-gray-100 text-[10px] uppercase text-gray-400 font-bold tracking-widest">
                                <th className="p-4 bg-gray-50">Produto</th>
                                <th className="p-4 bg-gray-50">Categoria</th>
                                <th className="p-4 bg-gray-50">Custo (R$)</th>
                                <th className="p-4 bg-gray-50">Venda (R$)</th>
                                <th className="p-4 bg-gray-50">Unid.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {importPreview.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition">
                                    <td className="p-4 text-sm font-bold text-slate-800">{item.name}</td>
                                    <td className="p-4 text-xs">
                                        <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded font-medium">{item.categoryName}</span>
                                    </td>
                                    <td className="p-4 text-sm text-gray-500 font-medium">R$ {item.cost}</td>
                                    <td className="p-4 text-sm text-mrts-blue font-black">R$ {item.price}</td>
                                    <td className="p-4 text-xs font-bold text-gray-400">{item.unit}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-6 bg-slate-50 border-t border-gray-100 rounded-b-3xl">
                    <button 
                        disabled={isPending} 
                        onClick={handleConfirmBatchZip} 
                        className="w-full bg-emerald-500 text-white font-bold py-4 rounded-2xl hover:bg-emerald-600 transition shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {isPending ? <RefreshCw size={22} className="animate-spin" /> : <CheckCircle2 size={22} />}
                        {isPending ? 'SALVANDO PRODUTOS...' : 'CONFIRMAR E IMPORTAR TUDO'}
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}
