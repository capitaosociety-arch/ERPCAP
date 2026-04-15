'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ShoppingCart, Coffee, Box, Users, DollarSign, Settings, FileText } from 'lucide-react';

const MENU_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permKey: 'permDashboard' },
  { href: '/pdv', label: 'PDV', icon: ShoppingCart, permKey: 'permPDV' },
  { href: '/mesas', label: 'Comandas', icon: Coffee, permKey: 'permComandas' },
  { href: '/produtos', label: 'Produtos', icon: Box, permKey: 'permProducts' },
  { href: '/estoque', label: 'Estoque', icon: FileText, permKey: 'permStock' },
  { href: '/clientes', label: 'Clientes', icon: Users, permKey: 'permCustomers' },
  { href: '/financeiro', label: 'Financeiro', icon: DollarSign, permKey: 'permFinance' },
  { href: '/usuarios', label: 'Usuários', icon: Settings, permKey: 'permUsers' },
];

export default function Sidebar({ user }: { user: any }) {
  const pathname = usePathname();

  // Filter menu based on role + granular permission flags
  const filteredNav = MENU_ITEMS.filter(item => {
    if (!user) return false;
    // ADMINs always see everything
    if (user.role === 'ADMIN') return true;
    // All other roles (MANAGER, CASHIER, WAITER) follow granular permission flags
    return user[item.permKey] === true;
  });

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col items-start p-4 shadow-xl z-20 hidden md:flex">
      <div className="flex items-center gap-3 w-full border-b border-slate-700 pb-6 mb-6 pt-2 justify-center">
        <img src="/logo.svg" alt="Capitão Society" className="w-10 h-10 rounded-xl shadow-lg border border-slate-700" />
        <h1 className="text-xl font-bold tracking-tight">Capitão Society</h1>
      </div>

      <nav className="flex-1 w-full flex flex-col gap-2">
        {filteredNav.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${isActive ? 'bg-mrts-blue text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              <item.icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto w-full pt-4 border-t border-slate-700 text-center">
        <p className="text-xs text-slate-500 font-medium">Capitão Society v1.0</p>
      </div>
    </aside>
  );
}
