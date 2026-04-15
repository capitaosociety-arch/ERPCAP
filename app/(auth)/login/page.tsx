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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-soft p-8 border border-gray-100">
        <div className="flex justify-center mb-6">
          <img src="/logo.svg" alt="Capitão Society Logo" className="w-16 h-16 rounded-2xl shadow-lg border border-gray-100" />
        </div>
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-8">
          Capitão <span className="text-mrts-blue italic">Society</span>
        </h2>
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-sm text-center font-medium border border-red-100">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">E-mail de acesso</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-mrts-blue focus:border-transparent transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-mrts-blue focus:border-transparent transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-mrts-blue text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-mrts-hover transition-colors disabled:opacity-50"
          >
            {loading ? 'ACESSANDO...' : 'ENTRAR'}
          </button>

          <div className="flex flex-col sm:flex-row items-center justify-between pt-2 gap-3 w-full">
            <button
              type="button"
              onClick={() => alert('Opção de recuperação de senha por email será implementada em breve!')}
              className="text-sm font-semibold text-gray-400 hover:text-mrts-blue transition-all"
            >
              Recuperar senha por email
            </button>
            <button
              type="button"
              onClick={() => alert('Opção de solicitação de cadastro será implementada em breve!')}
              className="text-sm font-semibold text-gray-400 hover:text-mrts-blue transition-all"
            >
              Solicitar para criar cadastro
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
