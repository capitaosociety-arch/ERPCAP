const fs = require('fs');
const p = 'C:/Users/MRTS/.gemini/antigravity/scratch/bar-erp/app/(dashboard)/financeiro/FinanceiroClient.tsx';
let d = fs.readFileSync(p, 'utf8');

if (!d.includes('openGlobalCashRegister')) {
    d = d.replace(import { useState } from 'react';, import { useState } from 'react';\nimport { openGlobalCashRegister, closeGlobalCashRegister } from '../../actions/caixa';);
    
    const stateVars =   const [activeTab, setActiveTab] = useState('DASHBOARD');
  const [openVal, setOpenVal] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const openBoxData = cashRegisters.find((c) => c.status === 'OPEN');

  const handleOpen = async () => {
    if(!openVal) return alert('Insira o fundo de troco!');
    setLoadingAction(true);
    try { await openGlobalCashRegister(Number(openVal)); setOpenVal(''); }
    catch(e) { alert(e.message); }
    setLoadingAction(false);
  };
  const handleClose = async () => {
    if(!openVal) return alert('Insira o montante total para fechar (Sangria Final)!');
    setLoadingAction(true);
    try { await closeGlobalCashRegister(openBoxData.id, Number(openVal)); setOpenVal(''); }
    catch(e) { alert(e.message); }
    setLoadingAction(false);
  };;

    d = d.replace(  const [activeTab, setActiveTab] = useState('DASHBOARD'); // DASHBOARD, CASHIER, stateVars);

    const controlPanel = 
          <div className="flex flex-col gap-4 mb-6">
               {!openBoxData ? (
                 <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6 flex items-center justify-between shadow-sm">
                    <div>
                        <h3 className="font-black text-emerald-800 text-lg flex items-center gap-2"><Unlock size={20}/> <span>NENHUM CAIXA ABERTO</span></h3>
                        <p className="text-sm font-medium text-emerald-600 mt-1">O ERP est\u00E1 bloqueado para vendas. Inicie o turno abrindo o caixa central.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                            <input type="number" value={openVal} onChange={e => setOpenVal(e.target.value)} placeholder="Fundo Troco" className="border-2 border-emerald-200 rounded-xl py-3 pl-10 pr-4 outline-none font-bold text-slate-700 w-40"/>
                        </div>
                        <button disabled={loadingAction} onClick={handleOpen} className="bg-emerald-500 hover:bg-emerald-600 text-white font-black py-3.5 px-6 rounded-xl shadow-lg transition">
                            {loadingAction ? '...' : 'ABRIR TURNO'}
                        </button>
                    </div>
                 </div>
               ) : (
                 <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm">
                    <div>
                        <h3 className="font-black text-red-800 text-lg flex items-center gap-2"><Lock size={20}/> <span>CAIXA GERAL ABERTO</span></h3>
                        <p className="text-sm font-medium text-red-600 mt-1">N\u00E3o esque\u00E7a de informar a sangria final antes de encerrar o expediente!</p>
                        <p className="text-xs font-bold text-slate-500 mt-2 bg-white/50 inline-block px-2 py-1 rounded">Caixa #{openBoxData.id.slice(-8)} \u2022 Fundo: R$ {openBoxData.openingBal}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-4 md:mt-0">
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                            <input type="number" value={openVal} onChange={e => setOpenVal(e.target.value)} placeholder="0.00" className="border-2 border-red-200 rounded-xl py-3 pl-10 pr-4 outline-none font-bold text-slate-700 w-40"/>
                        </div>
                        <button disabled={loadingAction} onClick={handleClose} className="bg-red-500 hover:bg-red-600 text-white font-black py-3.5 px-6 rounded-xl shadow-lg transition whitespace-nowrap">
                            {loadingAction ? '...' : 'FECHAR E CONTAR'}
                        </button>
                    </div>
                 </div>
               )}
          </div>
          ;

    d = d.replace({activeTab === 'CASHIER' && (, {activeTab === 'CASHIER' && (\n        <>\n);
    
    // Replace the closing div of CASHIER with closing fragment
    d = d.replace(            )}
                    </tbody>
                </table>
                </div>
          </div>
      )},             )}
                    </tbody>
                </table>
                </div>
          </div>
        </>\n      )});

    fs.writeFileSync(p, d);
    console.log('FinanceiroClient.tsx updated with Control Panel!');
} else {
    console.log('Control panel already injected.');
}
