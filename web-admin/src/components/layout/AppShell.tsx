import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from '../ErrorBoundary';
import { useBilling } from '@/hooks/useBilling';
import { useAuthStore } from '@/store/auth.store';
import { AlertTriangle, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

// ── Trial Banner ──────────────────────────────────────────────────────────────
function TrialBanner() {
  const { data: billing } = useBilling();
  if (!billing?.isTrialing) return null;
  const days = billing.daysRemaining ?? 0;
  if (days > 7) return null;

  return (
    <div className="bg-amber-950/60 border-b border-amber-700/30 px-4 py-2 flex items-center justify-between gap-4 flex-shrink-0">
      <div className="flex items-center gap-2 text-amber-300 text-[11px]">
        <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
        <span>
          Trial vence en <strong>{days} día{days !== 1 ? 's' : ''}</strong> — activa tu plan para conservar el acceso.
        </span>
      </div>
      <a
        href="/configuracion"
        className="text-amber-300 hover:text-amber-100 text-[11px] font-semibold underline underline-offset-2 flex-shrink-0 transition-colors"
      >
        Ver planes →
      </a>
    </div>
  );
}

// ── User Bar (top right) ──────────────────────────────────────────────────────
function UserBar() {
  const { user } = useAuthStore();

  const handleLogout = async () => {
    try { await signOut(auth); } catch { /* ignore */ }
  };

  return (
    <div className="h-10 flex items-center justify-end px-4 border-b border-white/[0.05] bg-[#080d1a]/70 flex-shrink-0 gap-3">
      {user?.email && (
        <span className="text-[11px] text-slate-600 hidden lg:block truncate max-w-[200px]">
          {user.email}
        </span>
      )}
      <button
        onClick={() => void handleLogout()}
        title="Cerrar sesión"
        className="group flex items-center gap-1.5 text-slate-600 hover:text-slate-300 transition-colors"
      >
        <span className="text-[11px] hidden group-hover:block">Salir</span>
        <LogOut size={12} />
      </button>
    </div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────
export function AppShell() {
  return (
    <div className="flex h-screen bg-surface text-white overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <UserBar />
        <TrialBanner />
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
