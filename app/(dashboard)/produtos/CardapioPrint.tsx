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
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-md flex flex-col items-center overflow-y-auto py-10 print-area">
      
      {/* Toolbar Fixa no Topo - Oculta na impressão */}
      <div className="fixed top-0 left-0 right-0 z-[110] flex justify-between items-center p-4 bg-slate-900/90 border-b border-white/10 text-white backdrop-blur-md print-hidden">
        <div className="flex items-center gap-4">
          <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400">
            <Printer size={20} />
          </div>
          <div>
            <h2 className="font-bold text-sm">Modo de Impressão</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Capitão Society</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-2 text-amber-400 bg-amber-400/10 px-3 py-1.5 rounded-full border border-amber-400/20">
            <Info size={14} />
            <span className="text-[10px] font-bold uppercase">Dica: Você pode clicar nos textos abaixo para editar manualmente antes de imprimir</span>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={handlePrint}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              <Printer size={18} /> Imprimir
            </button>
            <button 
              onClick={onClose}
              className="bg-white/10 hover:bg-white/20 p-2.5 rounded-xl transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* ÁREA DE IMPRESSÃO (Simulação de Folha A4) */}
      <div 
        ref={printRef} 
        className="bg-white w-full max-w-[850px] shadow-2xl p-8 sm:p-16 print:p-0 font-sans text-slate-800 flex flex-col min-h-[1100px] mt-12 mb-20 relative overflow-hidden print:shadow-none print:mt-0 print:mb-0"
      >
        
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="bg-[#0ea5e9] w-full max-w-[500px] py-4 flex flex-col items-center border-2 border-[#0ea5e9] shadow-sm">
             <div className="border-t-2 border-b-2 border-white/30 py-1 px-8 w-full flex justify-center">
                <h1 className="text-4xl font-black text-white tracking-[0.2em] italic outline-none" contentEditable suppressContentEditableWarning>CAPITÃO SOCIETY</h1>
             </div>
          </div>
          <span className="text-[10px] font-bold text-[#0ea5e9] mt-2 tracking-widest uppercase outline-none" contentEditable suppressContentEditableWarning>Desde 2019</span>
        </div>

        {/* Categorias e Produtos */}
        <div className="flex-1 space-y-10">
          {categories.map(catName => {
            const catProducts = activeProducts.filter(p => p.category?.name === catName);
            
            // Agrupar por subgrupo (heurística)
            const groups: Record<string, Product[]> = {};
            catProducts.forEach(p => {
              const group = getSubGroup(p.name);
              if (!groups[group]) groups[group] = [];
              groups[group].push(p);
            });

            return (
              <div key={catName} className="flex flex-col">
                <h2 className="text-[#0ea5e9] font-black text-xl border-b-2 border-[#0ea5e9] mb-6 pb-1 uppercase italic tracking-wider outline-none" contentEditable suppressContentEditableWarning>
                  {catName}
                </h2>
                
                <div className="space-y-6">
                  {Object.entries(groups).map(([groupName, items]) => (
                    <div key={groupName} className="flex gap-6">
                      {/* Sidebar do grupo (Vertical) */}
                      <div className="w-10 flex items-center justify-center border-r border-slate-200">
                         <span className="[writing-mode:vertical-lr] rotate-180 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap py-2 outline-none" contentEditable suppressContentEditableWarning>
                           {groupName}
                         </span>
                      </div>
                      
                      {/* Lista de itens */}
                      <div className="flex-1 space-y-3">
                        {items.map(item => (
                          <div key={item.id} className="flex items-end gap-3 group">
                            <span 
                              className="font-bold text-[15px] text-slate-700 whitespace-nowrap outline-none focus:bg-blue-50 px-1 rounded transition-colors" 
                              contentEditable 
                              suppressContentEditableWarning
                            >
                              {item.name}
                            </span>
                            <div className="flex-1 border-b-2 border-dotted border-slate-200 mb-1.5 opacity-60"></div>
                            <span 
                              className="font-black text-base text-slate-900 whitespace-nowrap outline-none focus:bg-blue-50 px-1 rounded transition-colors"
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

        {/* Footer - Social & PIX */}
        <div className="mt-16 pt-8 border-t-2 border-slate-100 flex justify-between items-end">
          <div className="space-y-6">
             <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contato (Agenda):</p>
                <div className="flex items-center gap-3 text-slate-700">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white shadow-sm">
                    <Phone size={16} fill="white" />
                  </div>
                  <span className="font-black text-base outline-none" contentEditable suppressContentEditableWarning>(65) 9 9984 9146</span>
                </div>
             </div>
             
             <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                    <Globe size={14} />
                  </div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight outline-none" contentEditable suppressContentEditableWarning>Instagram: @capitaosociety</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                    <Globe size={14} />
                  </div>
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight outline-none" contentEditable suppressContentEditableWarning>Facebook: @capitaosociety</span>
                </div>
             </div>
          </div>

          <div className="flex items-center gap-6 bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-sm">
             <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">PIX CNPJ:</p>
                <p className="font-black text-slate-800 text-base italic outline-none" contentEditable suppressContentEditableWarning>42.261.691/0001-27</p>
             </div>
             <div className="w-24 h-24 bg-white p-1.5 border border-slate-200 rounded-2xl flex items-center justify-center relative shadow-sm">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=42261691000127" alt="PIX QR" className="w-full h-full" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-5 h-5 bg-[#0ea5e9] rounded-md flex items-center justify-center text-[8px] text-white font-bold shadow-sm">C</div>
                </div>
             </div>
             <div className="w-14 h-14 bg-gradient-to-br from-[#0ea5e9] to-[#22c55e] rounded-2xl flex items-center justify-center text-white font-black text-3xl italic shadow-sm">C</div>
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
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
          }
          .print-hidden {
            display: none !important;
          }
          [contenteditable]:focus {
            background-color: transparent !important;
          }
        }
        /* Personalização da barra de rolagem para o preview */
        .print-area::-webkit-scrollbar {
          width: 8px;
        }
        .print-area::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        .print-area::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
        }
        .print-area::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}} />
    </div>
  );
}
