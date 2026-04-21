'use client'

import { useState, useEffect } from 'react';
import { X, History, User, Clock, Package, Briefcase, Key, LogIn, LayoutDashboard } from 'lucide-react';
import { getAuditLogs } from '../app/actions/audit';

export default function AuditLogModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const loadLogs = async () => {
        setLoading(true);
        const res = await getAuditLogs();
        if (res.success) {
            setLogs(res.logs);
        }
        setLoading(false);
    };

    useEffect(() => {
        const initLogs = async () => {
            if (isOpen) {
                await loadLogs();
            }
        };
        initLogs();
    }, [isOpen]);

    const getActionIcon = (action: string) => {
        const a = action.toLowerCase();
        if (a.includes('produto') || a.includes('item')) return <Package className="text-blue-500" size={16} />;
        if (a.includes('estoque')) return <Briefcase className="text-orange-500" size={16} />;
        if (a.includes('permissão') || a.includes('acesso')) return <Key className="text-purple-500" size={16} />;
        if (a.includes('caixa')) return <LayoutDashboard className="text-emerald-500" size={16} />;
        return <LogIn className="text-gray-500" size={16} />;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-end">
            <div className="bg-white w-full max-w-md h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                            <History size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Histórico</h2>
                            <p className="text-xs text-slate-400 font-medium">Últimas 50 operações do sistema</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3">
                            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
                            <p className="text-sm font-bold text-slate-400">Carregando auditoria...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-40">
                            <History size={48} className="mb-4" />
                            <p className="font-bold text-slate-600">Nenhum evento registrado</p>
                            <p className="text-xs">As ações começarão a aparecer aqui conforme os usuários operarem o sistema.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {logs.map((log) => (
                                <div key={log.id} className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm flex flex-col gap-2 group hover:border-slate-300 transition-all">
                                    <div className="flex items-start justify-between gap-1">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-slate-50 rounded-lg group-hover:bg-slate-100 transition">
                                                {getActionIcon(log.action)}
                                            </div>
                                            <span className="text-sm font-black text-slate-800">{log.action}</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap flex items-center gap-1">
                                            <Clock size={10} /> {new Date(log.timestamp).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                        </span>
                                    </div>
                                    
                                    <p className="text-xs text-slate-500 font-medium leading-relaxed pl-1">{log.details}</p>
                                    
                                    <div className="mt-1 pt-2 border-t border-slate-50 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center">
                                                <User size={10} className="text-slate-500" />
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-600">{log.user?.name}</span>
                                        </div>
                                        <span className="text-[9px] bg-slate-50 text-slate-400 px-2 py-0.5 rounded font-black uppercase tracking-widest">{log.user?.role}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
