import { Plus, Download, Mail, FileText, Scale, Presentation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ACTIONS = [
  { icon: Plus,         label: 'Registrar pago',   color: 'text-status-green  bg-status-green/10  hover:bg-status-green/20',  action: 'register-payment' },
  { icon: Download,     label: 'Exportar informe', color: 'text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20', action: 'export' },
  { icon: Mail,         label: 'Recordatorios',    color: 'text-status-yellow bg-status-yellow/10 hover:bg-status-yellow/20', action: 'reminders' },
  { icon: FileText,     label: 'Estado de cuenta', color: 'text-purple-400    bg-purple-400/10     hover:bg-purple-400/20',    action: 'statement' },
  { icon: Scale,        label: 'Carta de cobro',   color: 'text-status-red    bg-status-red/10     hover:bg-status-red/20',    action: 'letter' },
  { icon: Presentation, label: 'Modo Asamblea',    color: 'text-teal-400      bg-teal-400/10       hover:bg-teal-400/20',      action: 'assembly' },
] as const;

export function QuickActions() {
  const navigate = useNavigate();

  const handleAction = (action: string) => {
    if (action === 'assembly') { navigate('/asamblea'); return; }
    // TODO: wire other actions to modals/flows in future sprints
  };

  return (
    <div className="flex gap-2 flex-wrap">
      {ACTIONS.map(({ icon: Icon, label, color, action }) => (
        <button
          key={action}
          onClick={() => handleAction(action)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold transition-colors ${color}`}
          aria-label={label}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}
