'use client';
import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { LogOut, User as UserIcon, Menu, History } from 'lucide-react';
import AuditLogModal from './AuditLogModal';

export default function Topbar({ user, onOpenMenu }: { user: any, onOpenMenu?: () => void }) {
  const [isAuditModalOpen, setAuditModalOpen] = useState(false);

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 md:px-6 shadow-sm z-10 w-full relative shrink-0">
      <div className="flex items-center gap-2">
        <button 
          onClick={onOpenMenu}
          className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg md:hidden"
          aria-label="Toggle Menu"
        >
          <Menu size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800 md:hidden">Capitão <span className="text-mrts-blue italic">Society</span></h2>
      </div>
      <div className="hidden md:block"></div>

      <div className="flex items-center gap-4">
        <button 
          onClick={() => setAuditModalOpen(true)}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition border border-slate-100"
          title="Histórico de Operações"
        >
          <History size={16} />
          <span className="text-sm font-bold hidden lg:inline">Histórico</span>
        </button>

        <div className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
          <UserIcon size={16} className="text-gray-500" />
          <span className="font-semibold text-gray-700 hidden sm:inline">{user.name}</span>
          <span className="bg-mrts-blue text-white px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">{user.role}</span>
        </div>
        <button 
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition"
        >
          <LogOut size={16} />
          <span className="text-sm font-bold hidden sm:inline">Sair</span>
        </button>

        <AuditLogModal isOpen={isAuditModalOpen} onClose={() => setAuditModalOpen(false)} />
      </div>
    </header>
  );
}
