import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const navigate                = useNavigate();

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
    <div className="min-h-screen relative overflow-hidden bg-[#080d1a] flex items-center justify-center p-4">

      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/[0.08] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[300px] bg-indigo-600/[0.07] rounded-full blur-[100px]" />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/30 mb-4">
            <span className="text-white font-black text-xl leading-none">C</span>
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Conectia</h1>
          <p className="text-slate-400 text-[13px] mt-1">Panel de Administración</p>
        </div>

        {/* Card */}
        <div className="bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] rounded-2xl p-6 shadow-2xl shadow-black/40">
          <p className="text-slate-300 text-sm font-medium mb-5">Ingresa a tu cuenta</p>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                className="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-brand-primary focus:bg-white/[0.07] transition-colors placeholder:text-slate-600"
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
                className="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-brand-primary focus:bg-white/[0.07] transition-colors"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <span className="text-red-400 text-xs">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-brand-primary hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors shadow-lg shadow-indigo-500/20"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Ingresando…
                </span>
              ) : 'Ingresar'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-600 mt-6">
          Gestión financiera para conjuntos residenciales en Colombia
        </p>
      </div>
    </div>
  );
}
