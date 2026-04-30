'use client';

import { useState } from 'react';
import { Plus, Users, Calendar, Check, X, CreditCard, Trash, RefreshCw } from 'lucide-react';
import { 
    createMensalista, 
    toggleMensalistaStatus, 
    deleteMensalista, 
    gerarMensalidadesMes, 
    createHorista, 
    confirmarPagamentoLocacao, 
    cancelarLocacao 
} from '@/app/actions/quadras';

export default function QuadrasClient({ initialData }: { initialData: any }) {
    const [activeTab, setActiveTab] = useState<'mensalistas' | 'horistas'>('mensalistas');
    
    // UI State
    const [isAddMensalistaOpen, setIsAddMensalistaOpen] = useState(false);
    const [isAddHoristaOpen, setIsAddHoristaOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [mesGeracao, setMesGeracao] = useState(new Date().getMonth());
    const [anoGeracao, setAnoGeracao] = useState(new Date().getFullYear());

    // Form States
    const [mensalistaForm, setMensalistaForm] = useState({ nome: '', telefone: '', dia_semana: 'Segunda-feira', horario: '', valor_mensal: '' });
    const [horistaForm, setHoristaForm] = useState({ clienteAvulso: '', data: '', hora: '', valor: '' });

    // Handle Mensalista Submit
    const handleAddMensalista = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await createMensalista({
                nome: mensalistaForm.nome,
                telefone: mensalistaForm.telefone,
                dia_semana: mensalistaForm.dia_semana,
                horario: mensalistaForm.horario,
                valor_mensal: Number(mensalistaForm.valor_mensal)
            });
            setIsAddMensalistaOpen(false);
            setMensalistaForm({ nome: '', telefone: '', dia_semana: 'Segunda-feira', horario: '', valor_mensal: '' });
            alert('Mensalista cadastrado com sucesso!');
        } catch (error: any) {
            alert('Erro ao cadastrar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddHorista = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await createHorista({
                clienteAvulso: horistaForm.clienteAvulso,
                data: horistaForm.data,
                hora: horistaForm.hora,
                valor: Number(horistaForm.valor)
            });
            setIsAddHoristaOpen(false);
            setHoristaForm({ clienteAvulso: '', data: '', hora: '', valor: '' });
            alert('Aluguel avulso cadastrado!');
        } catch (error: any) {
            alert('Erro ao cadastrar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateMonthly = async () => {
        if(!confirm(`Deseja gerar as mensalidades para o mês ${mesGeracao + 1}/${anoGeracao}?`)) return;
        setLoading(true);
        try {
            const res = await gerarMensalidadesMes(anoGeracao, mesGeracao);
            if(res.count === 0) {
                alert('Nenhuma mensalidade nova foi gerada. Talvez já tenham sido geradas para este mês?');
            } else {
                alert(`${res.count} mensalidades geradas com sucesso!`);
            }
        } catch (error: any) {
            alert('Erro: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmPayment = async (id: string) => {
        if(!confirm('Confirmar recebimento (PIX padrão)?')) return;
        setLoading(true);
        try {
            await confirmarPagamentoLocacao(id, 'PIX');
        } catch (error: any) {
            alert('Erro: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = async (id: string) => {
        if(!confirm('Deseja realmente cancelar este lançamento?')) return;
        setLoading(true);
        try {
            await cancelarLocacao(id);
        } catch (error: any) {
            alert('Erro: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMensalista = async (id: string) => {
        if(!confirm('Excluir mensalista? Isso apaga também pagamentos pendentes dele.')) return;
        setLoading(true);
        try {
            await deleteMensalista(id);
        } catch (error: any) {
            alert('Erro: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h1 className="text-3xl font-black text-slate-800 tracking-tight">Gestão de Quadra</h1>
            </div>

            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500">
                        <Calendar className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-400">A Receber (Mensalidades)</p>
                        <h2 className="text-2xl font-black text-slate-800">
                            R$ {initialData.totalAReceberMensalidades.toFixed(2)}
                        </h2>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center text-green-500">
                        <CreditCard className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-400">Total Recebido no Mês</p>
                        <h2 className="text-2xl font-black text-slate-800">
                            R$ {initialData.totalRecebidoMes.toFixed(2)}
                        </h2>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl w-fit">
                <button 
                    onClick={() => setActiveTab('mensalistas')}
                    className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'mensalistas' ? 'bg-white text-mrts-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Aba Mensalistas
                </button>
                <button 
                    onClick={() => setActiveTab('horistas')}
                    className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'horistas' ? 'bg-white text-mrts-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Aba Horistas
                </button>
            </div>

            {/* Mensalistas Tab */}
            {activeTab === 'mensalistas' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Users className="w-5 h-5 text-mrts-blue" />
                                Clientes Fixos (Mensalistas)
                            </h2>
                            <button 
                                onClick={() => setIsAddMensalistaOpen(true)}
                                className="bg-mrts-blue text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-mrts-blue/90 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Cadastrar Mensalista
                            </button>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-gray-100">
                                        <th className="py-4 font-bold text-slate-400 text-sm">Nome</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm">Dia/Horário</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm">Valor Mensal</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm">Status</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {initialData.mensalistas.map((m: any) => (
                                        <tr key={m.id} className="border-b border-gray-50 hover:bg-slate-50 transition-colors">
                                            <td className="py-4 font-bold text-slate-700">{m.nome}</td>
                                            <td className="py-4 text-slate-600 text-sm">{m.dia_semana} às {m.horario}</td>
                                            <td className="py-4 font-bold text-mrts-green">R$ {m.valor_mensal.toFixed(2)}</td>
                                            <td className="py-4">
                                                <button 
                                                    disabled={loading}
                                                    onClick={() => toggleMensalistaStatus(m.id, !m.isActive)}
                                                    className={`px-3 py-1 rounded-full text-xs font-bold ${m.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                                                >
                                                    {m.isActive ? 'Ativo' : 'Inativo'}
                                                </button>
                                            </td>
                                            <td className="py-4">
                                                <button onClick={() => handleDeleteMensalista(m.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                                                    <Trash className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {initialData.mensalistas.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-gray-400 font-medium">Nenhum mensalista cadastrado</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                            <h2 className="text-xl font-bold text-slate-800">Mensalidades do Mês</h2>
                            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl">
                                <select 
                                    className="bg-transparent border-none font-bold text-slate-700 text-sm focus:ring-0 cursor-pointer outline-none"
                                    value={mesGeracao}
                                    onChange={(e) => setMesGeracao(Number(e.target.value))}
                                >
                                    {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => (
                                        <option key={i} value={i}>{m}</option>
                                    ))}
                                </select>
                                <select 
                                    className="bg-transparent border-none font-bold text-slate-700 text-sm focus:ring-0 cursor-pointer outline-none"
                                    value={anoGeracao}
                                    onChange={(e) => setAnoGeracao(Number(e.target.value))}
                                >
                                    {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                                <button 
                                    disabled={loading}
                                    onClick={handleGenerateMonthly}
                                    className="bg-mrts-blue text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-mrts-blue/90 transition-colors ml-2"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Gerar
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-gray-100">
                                        <th className="py-4 font-bold text-slate-400 text-sm">Cliente</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm">Vencimento (Data Ref)</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm">Valor</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm">Status</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {initialData.pagamentosMensalistas.map((p: any) => (
                                        <tr key={p.id} className="border-b border-gray-50">
                                            <td className="py-4 font-bold text-slate-700">{p.mensalista?.nome || p.clienteAvulso}</td>
                                            <td className="py-4 text-slate-600 text-sm">{new Date(p.data).toLocaleDateString('pt-BR')}</td>
                                            <td className="py-4 font-bold text-mrts-green">R$ {p.valor.toFixed(2)}</td>
                                            <td className="py-4">
                                                <span className={`px-2 py-1 rounded-lg text-xs font-bold ${p.status === 'PAGO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {p.status}
                                                </span>
                                            </td>
                                            <td className="py-4 text-right flex items-center justify-end gap-2">
                                                {p.status === 'PENDENTE' && (
                                                    <button onClick={() => handleConfirmPayment(p.id)} className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors" title="Confirmar Pagamento">
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button onClick={() => handleCancel(p.id)} className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors" title="Cancelar Lançamento">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {initialData.pagamentosMensalistas.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-gray-400 font-medium">Nenhum pagamento gerado para este período</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Horistas Tab */}
            {activeTab === 'horistas' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-slate-800">Aluguéis Avulsos (Horistas)</h2>
                            <button 
                                onClick={() => setIsAddHoristaOpen(true)}
                                className="bg-mrts-blue text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-mrts-blue/90 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Lançar Aluguel
                            </button>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-gray-100">
                                        <th className="py-4 font-bold text-slate-400 text-sm">Data</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm">Hora</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm">Cliente</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm">Valor</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm">Status</th>
                                        <th className="py-4 font-bold text-slate-400 text-sm text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {initialData.pagamentosHoristas.map((p: any) => (
                                        <tr key={p.id} className="border-b border-gray-50">
                                            <td className="py-4 text-slate-600 text-sm font-medium">{new Date(p.data).toLocaleDateString('pt-BR')}</td>
                                            <td className="py-4 text-slate-600 font-bold">{p.hora}</td>
                                            <td className="py-4 font-bold text-slate-700">{p.clienteAvulso}</td>
                                            <td className="py-4 font-bold text-mrts-green">R$ {p.valor.toFixed(2)}</td>
                                            <td className="py-4">
                                                <span className={`px-2 py-1 rounded-lg text-xs font-bold ${p.status === 'PAGO' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {p.status}
                                                </span>
                                            </td>
                                            <td className="py-4 text-right flex items-center justify-end gap-2">
                                                {p.status === 'PENDENTE' && (
                                                    <button onClick={() => handleConfirmPayment(p.id)} className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors" title="Confirmar Pagamento">
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button onClick={() => handleCancel(p.id)} className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors" title="Cancelar Lançamento">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {initialData.pagamentosHoristas.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-gray-400 font-medium">Nenhum aluguel avulso encontrado</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Add Mensalista */}
            {isAddMensalistaOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-slate-800">Cadastrar Mensalista</h2>
                            <button onClick={() => setIsAddMensalistaOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleAddMensalista} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nome / Equipe</label>
                                <input required type="text" value={mensalistaForm.nome} onChange={e => setMensalistaForm({...mensalistaForm, nome: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-mrts-blue transition-colors" placeholder="Ex: Galáticos FC" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Telefone (Opcional)</label>
                                <input type="text" value={mensalistaForm.telefone} onChange={e => setMensalistaForm({...mensalistaForm, telefone: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-mrts-blue transition-colors" placeholder="(00) 00000-0000" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Dia da Semana</label>
                                    <select value={mensalistaForm.dia_semana} onChange={e => setMensalistaForm({...mensalistaForm, dia_semana: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-mrts-blue transition-colors bg-white">
                                        <option>Segunda-feira</option>
                                        <option>Terça-feira</option>
                                        <option>Quarta-feira</option>
                                        <option>Quinta-feira</option>
                                        <option>Sexta-feira</option>
                                        <option>Sábado</option>
                                        <option>Domingo</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Horário Fixo</label>
                                    <input required type="time" value={mensalistaForm.horario} onChange={e => setMensalistaForm({...mensalistaForm, horario: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-mrts-blue transition-colors" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Valor Mensal (R$)</label>
                                <input required type="number" step="0.01" value={mensalistaForm.valor_mensal} onChange={e => setMensalistaForm({...mensalistaForm, valor_mensal: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-mrts-blue transition-colors" placeholder="0.00" />
                            </div>
                            <div className="pt-4 flex justify-end">
                                <button disabled={loading} type="submit" className="bg-mrts-blue text-white px-6 py-3 rounded-xl font-bold w-full hover:bg-mrts-blue/90 transition-all shadow-md shadow-mrts-blue/30 disabled:opacity-50">
                                    Salvar Mensalista
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Add Horista */}
            {isAddHoristaOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-slate-800">Lançar Aluguel Avulso</h2>
                            <button onClick={() => setIsAddHoristaOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleAddHorista} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nome do Cliente</label>
                                <input required type="text" value={horistaForm.clienteAvulso} onChange={e => setHoristaForm({...horistaForm, clienteAvulso: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-mrts-blue transition-colors" placeholder="Nome" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Data</label>
                                    <input required type="date" value={horistaForm.data} onChange={e => setHoristaForm({...horistaForm, data: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-mrts-blue transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Horário</label>
                                    <input required type="time" value={horistaForm.hora} onChange={e => setHoristaForm({...horistaForm, hora: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-mrts-blue transition-colors" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Valor Cobrado (R$)</label>
                                <input required type="number" step="0.01" value={horistaForm.valor} onChange={e => setHoristaForm({...horistaForm, valor: e.target.value})} className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-mrts-blue transition-colors" placeholder="0.00" />
                            </div>
                            <div className="pt-4 flex justify-end">
                                <button disabled={loading} type="submit" className="bg-mrts-green text-white px-6 py-3 rounded-xl font-bold w-full hover:bg-mrts-green/90 transition-all shadow-md shadow-mrts-green/30 disabled:opacity-50">
                                    Lançar Avulso
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
