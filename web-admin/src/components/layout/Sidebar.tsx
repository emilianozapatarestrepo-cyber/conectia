import { NavLink } from 'react-router-dom';
import {
  BarChart2, DollarSign, FileText, AlertTriangle, RefreshCw,
  Presentation, Settings, Building2, MessageSquare, CalendarCheck, Megaphone,
} from 'lucide-react';
import { clsx } from 'clsx';
import { usePqrsStats } from '@/hooks/usePqrs';

const NAV_ITEMS = [
  { to: '/',             icon: BarChart2,     label: 'Resumen' },
  { to: '/recaudo',      icon: DollarSign,    label: 'Recaudo' },
  { to: '/cartera',      icon: FileText,      label: 'Cartera' },
  { to: '/morosidad',    icon: AlertTriangle, label: 'Morosidad' },
  { to: '/conciliacion', icon: RefreshCw,     label: 'Conciliación' },
  { to: '/unidades',     icon: Building2,     label: 'Unidades' },
  { to: '/reservas',     icon: CalendarCheck, label: 'Reservas' },
  { to: '/comunicados',  icon: Megaphone,     label: 'Comunicados' },
  { to: '/pqrs',         icon: MessageSquare, label: 'PQRS' },
] as const;

const BOTTOM_ITEMS = [
  { to: '/asamblea',     icon: Presentation,  label: 'Asamblea' },
  { to: '/configuracion', icon: Settings,     label: 'Configuración' },
] as const;

export function Sidebar() {
  const { data: pqrsStats } = usePqrsStats();
  const openPqrs = (pqrsStats?.abierta ?? 0) + (pqrsStats?.en_proceso ?? 0);

  return (
    <aside className="w-[168px] flex-shrink-0 bg-surface-deep border-r border-white/[0.06] flex flex-col h-screen sticky top-0">

      {/* Logo */}
      <div className="px-4 py-[18px] border-b border-white/[0.06] flex items-center gap-2.5">
        {/* Logo mark */}
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 flex-shrink-0">
          <span className="text-white font-black text-[13px] leading-none tracking-tight">C</span>
        </div>
        <span className="text-white font-bold text-[15px] tracking-tight">Conectia</span>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-3 px-2.5 space-y-0.5 overflow-y-auto" aria-label="Navegación principal">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'relative flex items-center gap-2.5 pl-2.5 pr-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all',
                isActive
                  ? 'bg-brand-primary/[0.10] text-brand-primary'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active left border indicator */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-brand-primary" />
                )}
                <Icon
                  size={15}
                  strokeWidth={isActive ? 2.2 : 1.7}
                  className="flex-shrink-0"
                />
                <span className="flex-1 min-w-0 truncate">{label}</span>
                {to === '/pqrs' && openPqrs > 0 && (
                  <span className="flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums leading-none flex-shrink-0">
                    {openPqrs > 9 ? '9+' : openPqrs}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-2.5 py-3 border-t border-white/[0.06] space-y-0.5">
        {BOTTOM_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all',
                isActive
                  ? 'bg-brand-primary/[0.12] text-brand-primary'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.05]'
              )
            }
          >
            <Icon size={15} strokeWidth={1.7} className="flex-shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
