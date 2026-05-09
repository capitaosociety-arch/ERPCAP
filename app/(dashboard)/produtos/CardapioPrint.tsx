'use client';

import React, { useRef } from 'react';
import { X, Printer, Phone, Globe, Info } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  category?: {
    name: string;
  };
}

interface CardapioPrintProps {
  products: Product[];
  onClose: () => void;
}

export default function CardapioPrint({ products, onClose }: CardapioPrintProps) {
  const printRef = useRef<HTMLDivElement>(null);

  // Filtrar apenas produtos ativos
  const activeProducts = products.filter(p => p.isActive);

  // Agrupamento lógico baseado no modelo da foto
  const categories = Array.from(new Set(activeProducts.map(p => p.category?.name || 'Geral'))).sort();

  const handlePrint = () => {
    window.print();
  };

  const getSubGroup = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('600') || n.includes('garrafa')) return 'GARRAFAS';
    if (n.includes('long') || n.includes('neck')) return 'LONGNECKS';
    if (n.includes('lata') || n.includes('269') || n.includes('350')) return 'LATAS';
    if (n.includes('água') || n.includes('agua')) return 'ÁGUAS';
    if (n.includes('refrigerante') || n.includes('coca') || n.includes('guaraná')) return 'REFRIGERANTES';
    if (n.includes('suco')) return 'SUCOS';
    if (n.includes('energético') || n.includes('monster') || n.includes('red bull')) return 'ISOT. / ENER.';
    return 'DIVERSOS';
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md overflow-y-auto print-area">
      
      {/* Toolbar Fixa no Topo - Oculta na impressão */}
      <div className="fixed top-0 left-0 right-0 z-[110] flex justify-between items-center p-4 bg-slate-950 border-b border-white/10 text-white print-hidden">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400 font-bold">
            <Printer size={18} />
          </div>
          <div>
            <h2 className="font-bold text-xs uppercase tracking-widest">Prévia do Cardápio A4</h2>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2 text-blue-400 bg-blue-400/10 px-3 py-1.5 rounded-full border border-blue-400/20">
            <Info size={14} />
            <span className="text-[10px] font-bold uppercase tracking-tight">Otimizado para folha única (Frente)</span>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={handlePrint}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 text-xs"
            >
              <Printer size={16} /> Imprimir A4
            </button>
            <button 
              onClick={onClose}
              className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center pt-24 pb-20 px-4 print:p-0 print:pt-0">
        {/* ÁREA DE IMPRESSÃO (Folha A4 exata) */}
        <div 
          ref={printRef} 
          className="bg-white w-[210mm] min-h-[297mm] shadow-[0_0_50px_rgba(0,0,0,0.3)] p-10 print:p-0 font-sans text-slate-800 flex flex-col relative overflow-hidden print:shadow-none print:w-full print:min-h-0"
        >
          
          {/* Header Compacto */}
          <div className="flex flex-col items-center mb-6">
            <div className="bg-[#0ea5e9] w-full max-w-[420px] py-3 flex flex-col items-center border-2 border-[#0ea5e9]">
               <div className="border-t border-b border-white/30 py-0.5 px-6 w-full flex justify-center">
                  <h1 className="text-3xl font-black text-white tracking-[0.15em] italic outline-none" contentEditable suppressContentEditableWarning>CAPITÃO SOCIETY</h1>
               </div>
            </div>
            <span className="text-[9px] font-bold text-[#0ea5e9] mt-1.5 tracking-[0.3em] uppercase outline-none" contentEditable suppressContentEditableWarning>Desde 2019</span>
          </div>

          {/* Categorias e Produtos em Layout Compacto */}
          <div className="flex-1 space-y-6">
            {categories.map(catName => {
              const catProducts = activeProducts.filter(p => p.category?.name === catName);
              
              // Agrupar por subgrupo
              const groups: Record<string, Product[]> = {};
              catProducts.forEach(p => {
                const group = getSubGroup(p.name);
                if (!groups[group]) groups[group] = [];
                groups[group].push(p);
              });

              return (
                <div key={catName} className="flex flex-col">
                  <h2 className="text-[#0ea5e9] font-black text-base border-b border-[#0ea5e9] mb-3 pb-0.5 uppercase italic tracking-widest outline-none" contentEditable suppressContentEditableWarning>
                    {catName}
                  </h2>
                  
                  <div className="space-y-4">
                    {Object.entries(groups).map(([groupName, items]) => (
                      <div key={groupName} className="flex gap-4">
                        {/* Sidebar do grupo */}
                        <div className="w-8 flex items-center justify-center border-r border-slate-100">
                           <span className="[writing-mode:vertical-lr] rotate-180 text-[10px] font-black text-slate-300 uppercase tracking-widest whitespace-nowrap py-1 outline-none" contentEditable suppressContentEditableWarning>
                             {groupName}
                           </span>
                        </div>
                        
                        {/* Lista de itens - Grid de 2 colunas se houver muitos itens */}
                        <div className={`flex-1 grid gap-x-8 gap-y-1 ${items.length > 4 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {items.map(item => (
                            <div key={item.id} className="flex items-end gap-2 group">
                              <span 
                                className="font-bold text-[13px] text-slate-700 whitespace-nowrap outline-none focus:bg-blue-50 px-0.5 rounded" 
                                contentEditable 
                                suppressContentEditableWarning
                              >
                                {item.name}
                              </span>
                              <div className="flex-1 border-b border-dotted border-slate-200 mb-1 opacity-50"></div>
                              <span 
                                className="font-black text-sm text-slate-900 whitespace-nowrap outline-none focus:bg-blue-50 px-0.5 rounded"
                                contentEditable 
                                suppressContentEditableWarning
                              >
                                R${item.price.toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Compacto */}
          <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-end">
            <div className="space-y-4">
               <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Contato (Agenda):</p>
                  <div className="flex items-center gap-2 text-slate-700">
                    <div className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center text-white">
                      <Phone size={14} fill="white" />
                    </div>
                    <span className="font-black text-sm outline-none" contentEditable suppressContentEditableWarning>(65) 9 9984 9146</span>
                  </div>
               </div>
               
               <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 bg-slate-100 rounded-md flex items-center justify-center text-slate-500">
                      <Globe size={11} />
                    </div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter outline-none" contentEditable suppressContentEditableWarning>Insta: @capitaosociety</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 bg-slate-100 rounded-md flex items-center justify-center text-slate-500">
                      <Globe size={11} />
                    </div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter outline-none" contentEditable suppressContentEditableWarning>Face: @capitaosociety</span>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-100">
               <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">PIX CNPJ:</p>
                  <p className="font-black text-slate-800 text-xs italic outline-none" contentEditable suppressContentEditableWarning>42.261.691/0001-27</p>
               </div>
               <div className="w-16 h-16 bg-white p-1 border border-slate-200 rounded-xl flex items-center justify-center relative">
                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=42261691000127" alt="PIX QR" className="w-full h-full" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-3 h-3 bg-[#0ea5e9] rounded-sm flex items-center justify-center text-[5px] text-white font-bold">C</div>
                  </div>
               </div>
               <div className="w-10 h-10 bg-gradient-to-br from-[#0ea5e9] to-[#22c55e] rounded-xl flex items-center justify-center text-white font-black text-xl italic">C</div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          body {
            background: white !important;
          }
          body * {
            visibility: hidden !important;
          }
          .print-area, .print-area * {
            visibility: visible !important;
          }
          .print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            background: white !important;
            height: auto !important;
            overflow: visible !important;
          }
          .print-hidden {
            display: none !important;
          }
        }
        /* Personalização da barra de rolagem */
        .print-area::-webkit-scrollbar {
          width: 10px;
        }
        .print-area::-webkit-scrollbar-track {
          background: #0f172a;
        }
        .print-area::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
          border: 3px solid #0f172a;
        }
      `}} />
    </div>
  );
}
