'use client';

import React, { useRef } from 'react';
import { X, Printer, Instagram, Facebook, Phone } from 'lucide-react';

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
  // Como o banco tem apenas 1 nível de categoria, vamos usar heurística para as subcategorias laterais
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
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 overflow-y-auto print-area">
      <div className="bg-white w-full max-w-[800px] shadow-2xl flex flex-col print:shadow-none print:w-full print:max-w-none">
        
        {/* Toolbar - Oculta na impressão */}
        <div className="flex justify-between items-center p-4 bg-slate-800 text-white print-hidden">
          <div className="flex items-center gap-2">
            <Printer size={20} />
            <h2 className="font-bold">Pré-visualização do Cardápio</h2>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handlePrint}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition"
            >
              Imprimir Agora
            </button>
            <button 
              onClick={onClose}
              className="bg-slate-700 hover:bg-slate-600 p-2 rounded-lg transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ÁREA DE IMPRESSÃO */}
        <div ref={printRef} className="bg-white p-8 sm:p-12 print:p-4 font-sans text-slate-800 flex flex-col min-h-[1100px] border-[12px] border-slate-100 print:border-none">
          
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="bg-[#0ea5e9] w-full max-w-[500px] py-4 flex flex-col items-center border-2 border-[#0ea5e9]">
               <div className="border-t-2 border-b-2 border-white/30 py-1 px-8 w-full flex justify-center">
                  <h1 className="text-4xl font-black text-white tracking-[0.2em] italic">CAPITÃO SOCIETY</h1>
               </div>
            </div>
            <span className="text-[10px] font-bold text-[#0ea5e9] mt-1 tracking-widest uppercase">Desde 2019</span>
          </div>

          {/* Categorias e Produtos */}
          <div className="flex-1 space-y-8">
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
                  <h2 className="text-[#0ea5e9] font-black text-xl border-b-2 border-[#0ea5e9] mb-4 pb-1 uppercase italic tracking-wider">
                    {catName}
                  </h2>
                  
                  <div className="space-y-4">
                    {Object.entries(groups).map(([groupName, items]) => (
                      <div key={groupName} className="flex gap-4">
                        {/* Sidebar do grupo (Vertical) */}
                        <div className="w-8 flex items-center justify-center border-r border-slate-200">
                           <span className="[writing-mode:vertical-lr] rotate-180 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap py-2">
                             {groupName}
                           </span>
                        </div>
                        
                        {/* Lista de itens */}
                        <div className="flex-1 space-y-1.5">
                          {items.map(item => (
                            <div key={item.id} className="flex items-end gap-2 group">
                              <span className="font-bold text-sm text-slate-700 whitespace-nowrap">{item.name}</span>
                              <div className="flex-1 border-b border-dotted border-slate-300 mb-1 opacity-50"></div>
                              <span className="font-black text-sm text-slate-900 whitespace-nowrap">R${item.price.toFixed(2).replace('.', ',')}</span>
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
          <div className="mt-12 pt-8 border-t-2 border-slate-100 flex justify-between items-end">
            <div className="space-y-4">
               <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contato (Agenda):</p>
                  <div className="flex items-center gap-2 text-slate-700">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white">
                      <Phone size={14} fill="white" />
                    </div>
                    <span className="font-black text-sm">(65) 9 9984 9146</span>
                  </div>
               </div>
               
               <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-500 rounded-lg flex items-center justify-center text-white">
                      <Instagram size={14} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">@capitaosociety</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white">
                      <Facebook size={14} fill="white" />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">@capitaosociety</span>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
               <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">PIX Telefone:</p>
                  <p className="font-black text-slate-800 text-sm italic">65999849146</p>
               </div>
               {/* QR Code Placeholder - In a real app we might use a library, here we mimic the visual */}
               <div className="w-20 h-20 bg-white p-1 border border-slate-200 rounded-lg flex items-center justify-center relative">
                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=65999849146" alt="PIX QR" className="w-full h-full" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    {/* Fake blue logo in center of QR */}
                    <div className="w-4 h-4 bg-[#0ea5e9] rounded flex items-center justify-center text-[6px] text-white font-bold">C</div>
                  </div>
               </div>
               <div className="w-12 h-12 bg-gradient-to-br from-[#0ea5e9] to-[#22c55e] rounded-xl flex items-center justify-center text-white font-black text-2xl italic">C</div>
            </div>
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
          }
          .print-hidden {
            display: none !important;
          }
        }
      `}} />
    </div>
  );
}
