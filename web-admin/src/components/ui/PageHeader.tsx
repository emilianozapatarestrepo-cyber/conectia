interface Props {
  title:     string;
  subtitle?: string;
  actions?:  React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-white font-bold text-[15px] tracking-tight truncate">{title}</h1>
        {subtitle && (
          <p className="text-slate-400 text-[11px] mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
