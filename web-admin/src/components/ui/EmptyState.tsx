import type { LucideIcon } from 'lucide-react';

interface Props {
  icon:      LucideIcon;
  title:     string;
  subtitle?: string;
  action?:   React.ReactNode;
}

export function EmptyState({ icon: Icon, title, subtitle, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="w-11 h-11 rounded-2xl bg-surface-card border border-surface-border flex items-center justify-center">
        <Icon size={20} className="text-slate-500" />
      </div>
      <div>
        <p className="text-slate-300 text-sm font-medium">{title}</p>
        {subtitle && (
          <p className="text-slate-500 text-[11px] mt-0.5 max-w-xs">{subtitle}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
