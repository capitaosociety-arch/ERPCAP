'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });
    setLoading(false);
    
    if (res?.error) {
      setError(res.error);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 font-sans relative overflow-hidden bg-slate-950">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-60 scale-105 animate-pulse-slow"
        style={{ backgroundImage: 'url("/soccer_field_abstract_bg.png")' }}
      ></div>
      <div className="absolute inset-0 z-1 bg-gradient-to-tr from-slate-950 via-slate-900/40 to-emerald-900/20"></div>

      {/* Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px] z-0 animate-blob"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] z-0 animate-blob animation-delay-2000"></div>

      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl rounded-[32px] shadow-2xl p-10 border border-white/20 z-10 relative group hover:border-emerald-500/30 transition-all duration-500">
        <div className="flex justify-center mb-8">
          <div className="relative">
             <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
             <img src="/logo.svg" alt="Capitão Society Logo" className="w-20 h-20 rounded-2xl shadow-2xl border border-white/10 relative z-10" />
          </div>
        </div>
        
        <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-white tracking-tight">
              Capitão <span className="text-emerald-400 italic">Society</span>
            </h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mt-2">Gestão Esportiva & ERP</p>
        </div>

        {error && (
          <div className="bg-red-500/10 text-red-400 p-4 rounded-2xl mb-8 text-sm text-center font-bold border border-red-500/20 animate-in shake duration-500">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">E-mail de acesso</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-medium"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Senha Privada</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-medium"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 rounded-2xl shadow-xl shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 mt-4 uppercase tracking-widest text-sm"
          >
            {loading ? 'AUTENTICANDO...' : 'ACESSAR SISTEMA'}
          </button>

          <div className="flex flex-col items-center gap-4 pt-6 border-t border-white/5 mt-4">
            <button
              type="button"
              onClick={() => alert('Opção de recuperação de senha por email será implementada em breve!')}
              className="text-[10px] font-black text-slate-500 hover:text-emerald-400 transition-all uppercase tracking-widest"
            >
              Esqueci minha senha
            </button>
            <button
              type="button"
              onClick={() => alert('Opção de solicitação de cadastro será implementada em breve!')}
              className="text-[10px] font-black text-slate-500 hover:text-emerald-400 transition-all uppercase tracking-widest"
            >
              Solicitar novo acesso
            </button>
          </div>
        </form>
      </div>
      
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-10">
          <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">Capitão Society © 2026</p>
      </div>
    </div>
  );
}
