'use client'

import { useState } from 'react';
import { Plus, Search, Shield, User as UserIcon, X, Check, Lock, Unlock, Phone, Mail, Edit2, LayoutDashboard, ShoppingCart, Coffee, Box, FileText, Users, DollarSign, Settings } from 'lucide-react';
import { createUser, toggleUserStatus, updateUserRole, updateUserDetails, toggleUserPermission } from '../../../app/actions/usuarios';

export default function UsuariosClient({ initialUsers }: { initialUsers: any[] }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    
    // New User State
    const [formData, setFormData] = useState({
        name: '', email: '', phone: '', password: '', role: 'WAITER'
    });

    // Edit User State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState({ name: '', email: '', phone: '', password: '' });

    const handleCreate = async () => {
        setLoading(true);
        try {
            await createUser(formData);
            setFormData({ name: '', email: '', phone: '', password: '', role: 'WAITER' });
            setIsModalOpen(false);
        } catch (e: any) {
            alert(e.message);
        }
        setLoading(false);
    };

    const handleToggleStatus = async (id: string, name: string) => {
        if(confirm(`Tem certeza que deseja alterar o status de acesso de ${name}?`)) {
            await toggleUserStatus(id);
        }
    };

    const startEditing = (u: any) => {
        setEditingId(u.id);
        setEditData({ name: u.name, email: u.email || '', phone: u.phone || '', password: '' });
    };

    const handleSaveEdit = async () => {
        if(!editingId) return;
        setLoading(true);
        await updateUserDetails(editingId, editData.name, editData.email, editData.phone, editData.password);
        setEditingId(null);
        setLoading(false);
    };

    const handleTogglePerm = async (id: string, key: string) => {
        await toggleUserPermission(id, key);
    };

    const handleRoleChange = async (id: string, newRole: string) => {
        await updateUserRole(id, newRole);
    };

    const rolesMap: any = {
        'ADMIN': { label: 'Administrador', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
        'MANAGER': { label: 'Gerente', color: 'bg-blue-100 text-blue-700 border-blue-200' },
        'CASHIER': { label: 'Operador de Caixa', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
        'WAITER': { label: 'Balcão / Garçom', color: 'bg-orange-100 text-orange-700 border-orange-200' }
    };

    const MENU_TOGGLES = [
      { key: 'permDashboard', label: 'Painel', icon: LayoutDashboard },
      { key: 'permPDV', label: 'PDV', icon: ShoppingCart },
      { key: 'permComandas', label: 'Mesas', icon: Coffee },
      { key: 'permProducts', label: 'Itens', icon: Box },
      { key: 'permStock', label: 'Estoque', icon: FileText },
      { key: 'permCustomers', label: 'Clientes', icon: Users },
      { key: 'permFinance', label: 'Fluxo', icon: DollarSign },
      { key: 'permUsers', label: 'Equipe', icon: Settings },
    ];

    const filtered = initialUsers.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || (u.email && u.email.toLowerCase().includes(search.toLowerCase())));

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">Equipe e Permissões</h1>
                  <p className="text-gray-500 text-sm mt-1">Gerencie os acessos e limites bloqueando quem pode ver áreas sensíveis.</p>
                </div>
                
                <div className="flex gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Buscar nome ou e-mail..." 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="bg-white border-2 border-gray-100 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:border-mrts-blue focus:ring-0 outline-none w-full font-medium"
                        />
                    </div>
                    <button 
                    onClick={() => setIsModalOpen(true)}
                    className="flex shrink-0 w-11 h-11 md:w-auto items-center justify-center gap-2 bg-slate-900 text-white md:px-5 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition shadow-sm"
                    >
                        <Plus size={20} /> <span className="hidden md:inline">Matricular</span>
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto min-h-[40vh]">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                    <tr className="bg-slate-50 border-b border-gray-100 text-xs uppercase text-slate-500 font-bold tracking-wider">
                        <th className="p-4">Funcionário</th>
                        <th className="p-4">Contato Oficial</th>
                        <th className="p-4 text-center">Matriz de Acessos (Módulos do Sistema)</th>
                        <th className="p-4 text-center">Status no Sistema</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                    {filtered.map((user: any) => (
                        <tr key={user.id} className="hover:bg-slate-50/50 transition">
                            <td className="p-4 max-w-[200px]">
                                {editingId === user.id ? (
                                    <div className="flex flex-col gap-2">
                                        <input type="text" value={editData.name} onChange={e=>setEditData({...editData, name: e.target.value})} className="border p-2 rounded text-xs font-bold w-full outline-none focus:border-mrts-blue" placeholder="Nome Completo"/>
                                        <button onClick={handleSaveEdit} disabled={loading} className="bg-green-500 text-white w-full rounded py-1.5 text-xs font-bold hover:bg-green-600 transition flex justify-center items-center gap-1"><Check size={14}/> Salvar Cadsatro</button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 relative group">
                                        <div className="w-10 h-10 rounded-full bg-mrts-blue/10 text-mrts-blue font-black flex items-center justify-center shrink-0">
                                            {user.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm truncate mr-6">{user.name}</p>
                                            <p className="text-xs text-gray-400 font-mono mt-0.5" title="Chave do sistema">ID: {user.id.slice(-6)}</p>
                                        </div>
                                        <button onClick={() => startEditing(user)} className="opacity-0 group-hover:opacity-100 transition absolute right-0 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-100 rounded-full text-slate-400"><Edit2 size={14}/></button>
                                    </div>
                                )}
                            </td>
                            <td className="p-4">
                                {editingId === user.id ? (
                                    <div className="flex flex-col gap-2">
                                        <input type="email" value={editData.email} onChange={e=>setEditData({...editData, email: e.target.value})} className="border p-2 rounded text-xs w-full outline-none focus:border-mrts-blue" placeholder="E-mail"/>
                                        <input type="text" value={editData.phone} onChange={e=>setEditData({...editData, phone: e.target.value})} className="border p-2 rounded text-xs w-full outline-none focus:border-mrts-blue" placeholder="Telefone"/>
                                        <input type="password" value={editData.password} onChange={e=>setEditData({...editData, password: e.target.value})} className="border border-red-200 bg-red-50 p-2 rounded text-xs w-full outline-none focus:border-red-500 placeholder-red-300" title="Deixe em branco para não alterar" placeholder="Forçar nova senha..."/>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-1"><Mail size={14} className="text-slate-400"/> {user.email || 'N/A'}</p>
                                        <p className="text-xs font-semibold text-slate-500 flex items-center gap-2"><Phone size={14} className="text-slate-400"/> {user.phone || 'S/ telefone'}</p>
                                    </>
                                )}
                            </td>
                            <td className="p-4">
                                <div className="flex flex-col items-center gap-3">
                                    <select 
                                        className={`text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full border outline-none cursor-pointer ${rolesMap[user.role]?.color || 'bg-gray-100 border-gray-200'}`}
                                        value={user.role}
                                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                        title="Esta é apenas uma etiqueta visual. Use as caixinhas para liberar recursos reais de fato."
                                    >
                                        <option value="ADMIN">★ Administrador</option>
                                        <option value="MANAGER">Gestor</option>
                                        <option value="CASHIER">Caixa PDV</option>
                                        <option value="WAITER">Operador</option>
                                    </select>
                                    
                                    <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-[300px]">
                                        {MENU_TOGGLES.map((t) => {
                                            const isActive = user[t.key] === true;
                                            return (
                                                <button 
                                                    key={t.key}
                                                    onClick={() => handleTogglePerm(user.id, t.key)}
                                                    title={t.label}
                                                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${isActive ? 'bg-mrts-blue text-white border-transparent shadow shadow-mrts-blue/30 scale-100' : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-400 scale-95 hover:scale-100'}`}
                                                >
                                                    <t.icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            </td>
                            <td className="p-4 text-center">
                                <button 
                                    onClick={() => handleToggleStatus(user.id, user.name)}
                                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${user.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'}`}
                                >
                                    {user.isActive ? <><Check size={14}/> Acesso Liberado</> : <><X size={14}/> Bloqueado</>}
                                </button>
                            </td>
                        </tr>
                    ))}
                    {filtered.length === 0 && (
                        <tr><td colSpan={4} className="text-center py-12 text-gray-400 font-medium">Nenhum funcionário encontrado na busca.</td></tr>
                    )}
                    </tbody>
                </table>
                </div>
            </div>

            {/* Modal Cadastrar Usuário */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95 flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                                <Shield className="text-mrts-blue"/> Nova Credencial
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200">
                                <X size={16}/>
                            </button>
                        </div>
                        
                        <div className="space-y-4 font-medium text-sm">
                            <div>
                                <label className="block text-slate-600 font-bold mb-1 ml-1">Nome Completo</label>
                                <input type="text" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} placeholder="João da Silva" className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none focus:border-mrts-blue focus:bg-blue-50/30 transition"/>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-slate-600 font-bold mb-1 ml-1">E-mail para Acesso</label>
                                    <input type="email" value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} placeholder="joao@bar.com" className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none focus:border-mrts-blue focus:bg-blue-50/30 transition"/>
                                </div>
                                <div>
                                    <label className="block text-slate-600 font-bold mb-1 ml-1">Telefone / Celular</label>
                                    <input type="text" value={formData.phone} onChange={e=>setFormData({...formData, phone: e.target.value})} placeholder="(11) 90000-0000" className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none focus:border-mrts-blue focus:bg-blue-50/30 transition"/>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-slate-600 font-bold mb-1 ml-1">Senha Padrão Provisória</label>
                                    <input type="password" value={formData.password} onChange={e=>setFormData({...formData, password: e.target.value})} placeholder="********" className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none focus:border-mrts-blue focus:bg-blue-50/30 transition"/>
                                </div>
                                <div>
                                    <label className="block text-slate-600 font-bold mb-1 ml-1">Patente (Permissão)</label>
                                    <select value={formData.role} onChange={e=>setFormData({...formData, role: e.target.value})} className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none bg-white focus:border-mrts-blue focus:bg-blue-50/30 transition cursor-pointer">
                                        <option value="ADMIN">Administrador (Tudo)</option>
                                        <option value="MANAGER">Gestor</option>
                                        <option value="CASHIER">Caixa Financeiro</option>
                                        <option value="WAITER">Operador Limitado</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button disabled={loading} onClick={() => setIsModalOpen(false)} className="flex-[1] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 py-3.5 rounded-xl transition">
                                Cancelar
                            </button>
                            <button disabled={loading} onClick={handleCreate} className="flex-[2] bg-slate-900 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-slate-800 transition disabled:opacity-50">
                                {loading ? 'Emitindo Credencial...' : 'Registrar Funcionário'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
