'use client';

import React, { useRef } from 'react';
import { X, Printer, Phone, Globe, Info, Zap } from 'lucide-react';

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

  // Payload oficial fornecido pelo cliente para o PIX Copia e Cola
  const PIX_PAYLOAD = "00020126360014br.gov.bcb.pix0114422616910001275204000053039865802BR5915CAPITAO SOCIETY6009Sao Paulo610901227-20062230519daqr34077869834053663049AF4";

  // Filtrar produtos ativos e remover aluguéis/churrasqueiras para otimizar espaço
  const activeProducts = products.filter(p => {
    if (!p.isActive) return false;
    const cat = (p.category?.name || '').toLowerCase();
    const name = p.name.toLowerCase();
    // Remover itens de locação que não fazem sentido no cardápio de consumo
    if (cat.includes('campo') || cat.includes('quadra') || cat.includes('churrasqueira')) return false;
    if (name.includes('aluguel') || name.includes('locação') || name.includes('churrasqueira')) return false;
    return true;
  });

  // Mapear categorias e renomear "Geral" para "SALGADINHOS", e forçar Energéticos para sua própria categoria
  const rawCategories = Array.from(new Set(activeProducts.map(p => {
    const name = p.name.toLowerCase();
    const cat = (p.category?.name || '').toLowerCase();
    
    // Forçar energéticos e isotônicos para uma categoria principal única
    if (name.includes('monster') || name.includes('red bull') || name.includes('energético') || name.includes('gatorade')) {
      return 'ISOTÔNICOS E ENERG.';
    }

    const catDisplayName = p.category?.name || 'SALGADINHOS';
    return catDisplayName === 'Geral' ? 'SALGADINHOS' : catDisplayName;
  }))).sort();

  const handlePrint = () => {
    window.print();
  };

  const getSubGroup = (name: string) => {
    const n = name.toLowerCase();
    // Prioridade total para Energéticos e Isotônicos
    if (n.includes('energético') || n.includes('monster') || n.includes('red bull') || n.includes('gatorade') || n.includes('powerade')) return 'ISOTÔNICOS E ENERG.';
    
    if (n.includes('600') || n.includes('garrafa')) return 'GARRAFAS';
    if (n.includes('long') || n.includes('neck')) return 'LONGNECKS';
    if (n.includes('lata') || n.includes('269') || n.includes('350')) return 'LATAS';
    if (n.includes('água') || n.includes('agua')) return 'ÁGUAS';
    if (n.includes('refrigerante') || n.includes('coca') || n.includes('guaraná') || n.includes('sprite') || n.includes('fanta') || n.includes('schweppes')) return 'REFRIGERANTES';
    if (n.includes('suco')) return 'SUCOS';
    return 'ISOTÔNICOS E ENERG.';
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl overflow-y-auto print-area">
      
      {/* Toolbar Moderna */}
      <div className="fixed top-0 left-0 right-0 z-[110] flex justify-between items-center p-4 bg-slate-900/50 border-b border-white/5 backdrop-blur-md text-white print-hidden">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Printer size={20} />
          </div>
          <div>
            <h2 className="font-black text-sm tracking-tighter uppercase">Cardápio A4</h2>
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-1">
              <Zap size={10} /> Otimizado
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <button 
              onClick={handlePrint}
              className="bg-white text-slate-900 hover:bg-emerald-500 hover:text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl"
            >
              Imprimir
            </button>
            <button 
              onClick={onClose}
              className="bg-white/5 hover:bg-white/10 p-2.5 rounded-xl border border-white/10 transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center pt-24 pb-20 px-4 print:p-0 print:pt-0">
        
        {/* ÁREA DE IMPRESSÃO (Folha A4) */}
        <div 
          ref={printRef} 
          className="bg-white w-[210mm] min-h-[297mm] shadow-[0_0_80px_rgba(0,0,0,0.5)] p-[1.5cm] print:p-0 font-sans text-slate-900 flex flex-col relative overflow-hidden print:overflow-visible print:shadow-none print:w-full print:min-h-0"
        >
          
          {/* Header Original */}
          <div className="flex flex-col items-center mb-4">
            <div className="bg-[#0369a1] w-full max-w-[600px] py-2 flex flex-col items-center border-2 border-[#0369a1] shadow-sm">
               <div className="border-t-2 border-b-2 border-white/30 py-1 px-8 w-full flex justify-center">
                  <h1 className="text-4xl font-black text-white tracking-[0.2em] italic outline-none uppercase whitespace-nowrap" contentEditable suppressContentEditableWarning>CAPITÃO SOCIETY</h1>
               </div>
            </div>
            <span className="text-[10px] font-bold text-[#0369a1] mt-1 tracking-[0.4em] uppercase outline-none" contentEditable suppressContentEditableWarning>Desde 2019</span>
          </div>

          {/* Grid Principal de Conteúdo */}
          <div className="flex-1 space-y-4">
            {rawCategories.map(catName => {
              const catProducts = activeProducts.filter(p => {
                const pCat = p.category?.name || 'SALGADINHOS';
                const displayName = pCat === 'Geral' ? 'SALGADINHOS' : pCat;
                return displayName === catName;
              });
              
              if (catProducts.length === 0) return null;

              const groups: Record<string, Product[]> = {};
              catProducts.forEach(p => {
                const group = getSubGroup(p.name);
                if (!groups[group]) groups[group] = [];
                groups[group].push(p);
              });

              return (
                <div key={catName} className="flex flex-col">
                  <div className="flex items-center gap-4 mb-2">
                    <h2 className="text-[#0369a1] font-black text-base uppercase italic tracking-widest outline-none whitespace-nowrap" contentEditable suppressContentEditableWarning>
                      {catName}
                    </h2>
                    <div className="flex-1 h-[1.5px] bg-[#0369a1]/30"></div>
                  </div>
                  
                  <div className="space-y-2">
                    {Object.entries(groups).map(([groupName, items]) => (
                      <div key={groupName} className="flex gap-4">
                        {/* Sidebar do grupo */}
                        <div className="w-8 flex items-center justify-center border-r-2 border-slate-300">
                           <span className="[writing-mode:vertical-lr] rotate-180 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap py-1.5 outline-none" contentEditable suppressContentEditableWarning>
                             {groupName}
                           </span>
                        </div>
                        
                        {/* Lista de itens (Grid Dinâmico) */}
                        <div className={`flex-1 grid gap-x-10 gap-y-1 ${items.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {items.map(item => (
                            <div key={item.id} className="flex items-end gap-2 group relative">
                              <span 
                                className="font-bold text-[13px] text-slate-800 whitespace-nowrap outline-none focus:ring-2 focus:ring-blue-100 rounded px-0.5 transition-all" 
                                contentEditable 
                                suppressContentEditableWarning
                              >
                                {item.name.replace(/Energético/gi, '').replace(/Salgadinhos/gi, '').replace(/Salgadinho/gi, '').trim()}
                              </span>
                              <div className="flex-1 border-b-[1.5px] border-slate-300 mb-1 transition-colors group-hover:border-[#0369a1]/40"></div>
                              <span 
                                className="font-black text-sm text-[#0369a1] whitespace-nowrap outline-none focus:ring-2 focus:ring-blue-100 rounded px-0.5 transition-all"
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

          {/* Footer de Alta Performance - REESTRUTURADO PARA CABER TUDO */}
          <div className="mt-4 pt-3 border-t-4 border-[#0369a1] flex justify-between items-center gap-4">
            <div className="flex-1 space-y-3">
               <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white shadow-md">
                    <Phone size={16} fill="white" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5 leading-none">Reservas / Agenda:</p>
                    <span className="font-black text-sm text-slate-900 outline-none whitespace-nowrap leading-none" contentEditable suppressContentEditableWarning>(65) 9 9984 9146</span>
                  </div>
               </div>
               
               <div className="flex flex-col gap-1.5 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-[#0369a1] rounded-md flex items-center justify-center text-white shrink-0">
                      <Globe size={10} />
                    </div>
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest outline-none whitespace-nowrap" contentEditable suppressContentEditableWarning>Instagram: @capitaosociety</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-[#0369a1] rounded-md flex items-center justify-center text-white shrink-0">
                      <Globe size={10} />
                    </div>
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest outline-none whitespace-nowrap" contentEditable suppressContentEditableWarning>Facebook: @capitaosociety</span>
                  </div>
               </div>
            </div>

            {/* PIX CONTAINER - REDIMENSIONADO */}
            <div className="flex items-center gap-4 bg-[#0f172a] p-3 rounded-[2rem] shadow-xl relative overflow-hidden group min-w-[340px]">
               <div className="absolute top-0 right-0 w-16 h-16 bg-[#0369a1]/20 rounded-full -mr-8 -mt-8 blur-xl"></div>
               <div className="text-right relative z-10 flex-1">
                  <p className="text-[9px] font-black text-[#0369a1] uppercase tracking-[0.2em] mb-0.5 leading-none">PIX CNPJ:</p>
                  <p className="font-black text-white text-[12px] italic outline-none tracking-wider whitespace-nowrap leading-tight" contentEditable suppressContentEditableWarning>42.261.691/0001-27</p>
               </div>
               <div className="w-16 h-16 bg-white p-1 rounded-xl flex items-center justify-center relative shadow-inner z-10 shrink-0">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(PIX_PAYLOAD)}`} alt="PIX QR" className="w-full h-full" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-3.5 h-3.5 bg-[#0f172a] rounded-md flex items-center justify-center text-[6px] text-white font-black border border-white/20">C</div>
                  </div>
               </div>
               <div className="w-10 h-16 bg-[#0369a1] rounded-full flex items-center justify-center text-slate-950 font-black text-3xl italic relative z-10 shrink-0 shadow-lg">C</div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @page {
          size: A4;
          margin: 1.5cm;
        }
        @media print {
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
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
            box-sizing: border-box !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          .print-hidden {
            display: none !important;
          }
        }
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #020617;
        }
        ::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}
