import { NavLink } from 'react-router-dom';
import { BarChart2, DollarSign, FileText, AlertTriangle, RefreshCw, Presentation, Settings, Building2, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { usePqrsStats } from '@/hooks/usePqrs';

const NAV_ITEMS = [
  { to: '/',             icon: BarChart2,      label: 'Resumen' },
  { to: '/recaudo',      icon: DollarSign,     label: 'Recaudo' },
  { to: '/cartera',      icon: FileText,       label: 'Cartera' },
  { to: '/morosidad',    icon: AlertTriangle,  label: 'Morosidad' },
  { to: '/conciliacion', icon: RefreshCw,      label: 'Conciliación' },
  { to: '/unidades',     icon: Building2,      label: 'Unidades' },
  { to: '/pqrs',         icon: MessageSquare,  label: 'PQRS' },
] as const;

export function Sidebar() {
  const { data: pqrsStats } = usePqrsStats();
  const openPqrs = (pqrsStats?.abierta ?? 0) + (pqrsStats?.en_proceso ?? 0);

  return (
    <aside className="w-[160px] flex-shrink-0 bg-[#0a0f1e] border-r border-surface-border flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 border-b border-surface-border">
        <span className="text-white font-bold text-base tracking-tight">Conectia</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1" aria-label="Navegación principal">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-brand-primary/15 text-brand-primary font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-surface-hover'
              )
            }
          >
            <Icon size={15} strokeWidth={1.8} />
            <span className="flex-1">{label}</span>
            {to === '/pqrs' && openPqrs > 0 && (
              <span className="ml-1 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                {openPqrs > 9 ? '9+' : openPqrs}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom links */}
      <div className="p-3 border-t border-surface-border">
        <NavLink
          to="/asamblea"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-400 hover:text-white hover:bg-surface-hover"
        >
          <Presentation size={15} />
          <span>Modo Asamblea</span>
        </NavLink>
        <NavLink
          to="/configuracion"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors mt-1',
              isActive
                ? 'bg-brand-primary/15 text-brand-primary font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-surface-hover'
            )
          }
        >
          <Settings size={15} />
          <span>Configuración</span>
        </NavLink>
      </div>
    </aside>
  );
}
