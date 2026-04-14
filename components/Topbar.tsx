'use client';
import { signOut } from 'next-auth/react';
import { LogOut, User as UserIcon } from 'lucide-react';

export default function Topbar({ user }: { user: any }) {
  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 shadow-sm z-10 w-full relative shrink-0">
      <h2 className="text-xl font-bold text-gray-800 md:hidden">Capitão <span className="text-mrts-blue italic">Society</span></h2>
      <div className="hidden md:block"></div>
      <div className="flex items-center gap-4">
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
      </div>
    </header>
  );
}
