import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from '../ErrorBoundary';
import { useBilling } from '@/hooks/useBilling';
import { AlertTriangle } from 'lucide-react';

function TrialBanner() {
  const { data: billing } = useBilling();

  if (!billing?.isTrialing) return null;
  const days = billing.daysRemaining ?? 0;
  if (days > 7) return null;

  return (
    <div className="bg-amber-900/30 border-b border-amber-700/40 px-4 py-2 flex items-center justify-between gap-4 flex-shrink-0">
      <div className="flex items-center gap-2 text-amber-300 text-[11px]">
        <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
        <span>
          Tu trial vence en <strong>{days} día{days !== 1 ? 's' : ''}</strong> — activa un plan para no perder el acceso.
        </span>
      </div>
      <a
        href="/configuracion"
        className="text-amber-300 hover:text-white text-[11px] font-semibold underline underline-offset-2 flex-shrink-0"
      >
        Ver planes
      </a>
    </div>
  );
}

export function AppShell() {
  return (
    <div className="flex h-screen bg-surface text-white overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
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
