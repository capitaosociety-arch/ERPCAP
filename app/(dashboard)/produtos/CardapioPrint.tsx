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

  // Payload oficial extraído da imagem do cliente para o PIX Copia e Cola
  const PIX_PAYLOAD = "00020126360014br.gov.bcb.pix0114422616910001275204000053039865802BR5915CAPITAO SOCIETY6009Cuiaba62070503***6304D892";

  // Filtrar produtos ativos e remover aluguéis/churrasqueiras para otimizar espaço
  const activeProducts = products.filter(p => {
    if (!p.isActive) return false;
    const cat = (p.category?.name || '').toLowerCase();
    const name = p.name.toLowerCase();
    // Remover itens de locação que não fazem sentido no cardápio de consumo
    if (cat.includes('campo') || cat.includes('quadra') || cat.includes('churrasqueira')) return false;
    if (name.includes('aluguel') || name.includes('locação')) return false;
    return true;
  });

  // Mapear categorias e renomear "Geral" para "SALGADINHOS"
  const rawCategories = Array.from(new Set(activeProducts.map(p => {
    const name = p.category?.name || 'SALGADINHOS';
    return name === 'Geral' ? 'SALGADINHOS' : name;
  }))).sort();

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
    <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl overflow-y-auto print-area">
      
      {/* Toolbar Moderna */}
      <div className="fixed top-0 left-0 right-0 z-[110] flex justify-between items-center p-5 bg-slate-900/50 border-b border-white/5 backdrop-blur-md text-white print-hidden">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Printer size={20} />
          </div>
          <div>
            <h2 className="font-black text-sm tracking-tighter uppercase">Cardápio Inteligente</h2>
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-1">
              <Zap size={10} /> Otimizado para A4
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <button 
              onClick={handlePrint}
              className="bg-white text-slate-900 hover:bg-emerald-500 hover:text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl"
            >
              Imprimir Cardápio
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

      <div className="flex flex-col items-center pt-28 pb-20 px-4 print:p-0 print:pt-0">
        
        {/* Dica Flutuante */}
        <div className="mb-8 bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl max-w-[850px] w-full flex items-center gap-4 print-hidden">
          <Info className="text-blue-400 shrink-0" size={24} />
          <p className="text-xs text-blue-100 font-medium leading-relaxed">
            <span className="font-black text-blue-400 uppercase mr-1">Dica Premium:</span> 
            O "Aluguel de Campo" e "Churrasqueira" foram removidos automaticamente para otimizar o espaço. 
            Você pode clicar em qualquer texto abaixo para editar nomes ou preços manualmente antes de imprimir!
          </p>
        </div>

        {/* ÁREA DE IMPRESSÃO (Folha A4) */}
        <div 
          ref={printRef} 
          className="bg-white w-[210mm] min-h-[297mm] shadow-[0_0_80px_rgba(0,0,0,0.5)] p-12 print:p-0 font-sans text-slate-900 flex flex-col relative overflow-hidden print:shadow-none print:w-full print:min-h-0"
        >
          
          {/* Header Original */}
          <div className="flex flex-col items-center mb-8">
            <div className="bg-[#0ea5e9] w-full max-w-[650px] py-4 flex flex-col items-center border-2 border-[#0ea5e9] shadow-sm">
               <div className="border-t-2 border-b-2 border-white/30 py-1 px-8 w-full flex justify-center">
                  <h1 className="text-4xl font-black text-white tracking-[0.2em] italic outline-none uppercase whitespace-nowrap" contentEditable suppressContentEditableWarning>CAPITÃO SOCIETY</h1>
               </div>
            </div>
            <span className="text-[10px] font-bold text-[#0ea5e9] mt-2 tracking-[0.4em] uppercase outline-none" contentEditable suppressContentEditableWarning>Desde 2019</span>
          </div>

          {/* Grid Principal de Conteúdo */}
          <div className="flex-1 space-y-8">
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
                  <div className="flex items-center gap-4 mb-4">
                    <h2 className="text-[#0ea5e9] font-black text-lg uppercase italic tracking-widest outline-none whitespace-nowrap" contentEditable suppressContentEditableWarning>
                      {catName}
                    </h2>
                    <div className="flex-1 h-[1.5px] bg-[#0ea5e9]/20"></div>
                  </div>
                  
                  <div className="space-y-6">
                    {Object.entries(groups).map(([groupName, items]) => (
                      <div key={groupName} className="flex gap-6">
                        {/* Sidebar do grupo */}
                        <div className="w-10 flex items-center justify-center border-r-2 border-slate-100">
                           <span className="[writing-mode:vertical-lr] rotate-180 text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] whitespace-nowrap py-2 outline-none" contentEditable suppressContentEditableWarning>
                             {groupName}
                           </span>
                        </div>
                        
                        {/* Lista de itens (Grid Dinâmico) */}
                        <div className={`flex-1 grid gap-x-12 gap-y-2 ${items.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {items.map(item => (
                            <div key={item.id} className="flex items-end gap-2 group relative">
                              <span 
                                className="font-bold text-[14px] text-slate-800 whitespace-nowrap outline-none focus:ring-2 focus:ring-blue-100 rounded px-1 transition-all" 
                                contentEditable 
                                suppressContentEditableWarning
                              >
                                {item.name.replace(/Energético/gi, '').trim()}
                              </span>
                              <div className="flex-1 border-b-[1.5px] border-slate-100 mb-1.5 transition-colors group-hover:border-[#0ea5e9]/30"></div>
                              <span 
                                className="font-black text-[15px] text-[#0ea5e9] whitespace-nowrap outline-none focus:ring-2 focus:ring-blue-100 rounded px-1 transition-all"
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

          {/* Footer de Alta Performance */}
          <div className="mt-8 pt-6 border-t-4 border-[#0ea5e9] flex justify-between items-center">
            <div className="space-y-5">
               <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                  <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-green-500/20">
                    <Phone size={20} fill="white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Reservas / Agenda:</p>
                    <span className="font-black text-lg text-slate-900 outline-none whitespace-nowrap" contentEditable suppressContentEditableWarning>(65) 9 9984 9146</span>
                  </div>
               </div>
               
               <div className="flex gap-4 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-[#0ea5e9] rounded-lg flex items-center justify-center text-white">
                      <Globe size={12} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest outline-none whitespace-nowrap" contentEditable suppressContentEditableWarning>Instagram: @capitaosociety</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-[#0ea5e9] rounded-lg flex items-center justify-center text-white">
                      <Globe size={12} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest outline-none whitespace-nowrap" contentEditable suppressContentEditableWarning>Facebook: @capitaosociety</span>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-6 bg-[#0f172a] p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-20 h-20 bg-[#0ea5e9]/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
               <div className="text-right relative z-10">
                  <p className="text-[10px] font-black text-[#0ea5e9] uppercase tracking-[0.2em] mb-1">Pagamento PIX CNPJ:</p>
                  <p className="font-black text-white text-base italic outline-none tracking-wider whitespace-nowrap" contentEditable suppressContentEditableWarning>42.261.691/0001-27</p>
               </div>
               <div className="w-24 h-24 bg-white p-2 rounded-2xl flex items-center justify-center relative shadow-inner z-10">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(PIX_PAYLOAD)}`} alt="PIX QR" className="w-full h-full" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-6 h-6 bg-[#0f172a] rounded-lg flex items-center justify-center text-[9px] text-white font-black shadow-xl border border-white/20">C</div>
                  </div>
               </div>
               <div className="w-16 h-16 bg-[#0ea5e9] rounded-3xl flex items-center justify-center text-[#0f172a] font-black text-4xl italic shadow-lg relative z-10">C</div>
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
        ::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
      `}} />
    </div>
  );
}
