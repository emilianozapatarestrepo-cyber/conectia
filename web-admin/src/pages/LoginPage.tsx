import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch {
      setError('Correo o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-white text-2xl font-bold">Conectia</h1>
          <p className="text-slate-400 text-sm mt-1">Panel Administrativo</p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-surface-card rounded-xl p-6 space-y-4 border border-surface-border"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0d1526] border border-surface-border rounded-md px-3 py-2.5 text-white text-sm focus:outline-none focus:border-brand-primary"
              placeholder="admin@conjunto.com"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0d1526] border border-surface-border rounded-md px-3 py-2.5 text-white text-sm focus:outline-none focus:border-brand-primary"
            />
          </div>
          {error && <p className="text-status-red text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-60 text-white font-semibold py-2.5 rounded-md text-sm transition-colors"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
