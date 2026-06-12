import { useState } from 'react';
import { X, ShieldCheck, ShieldAlert, Download } from 'lucide-react';
import { useUnitStatement } from '@/hooks/useUnitStatement';
import { SpinnerIcon } from '@/components/ui/icons';
import { formatCOP } from '@/lib/formatters';
import { downloadBlob } from '@/lib/downloadBlob';

interface Props {
  unitId:    string;
  unitLabel: string;
  onClose:   () => void;
}

export function PazSalvoDrawer({ unitId, unitLabel, onClose }: Props) {
  const { data, isLoading } = useUnitStatement(unitId);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const balance = data?.balance ?? null;
  const hasPendingBalance = balance !== null && balance > 0n;

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadBlob(
        `/export/paz-y-salvo?unitId=${encodeURIComponent(unitId)}&asOf=${encodeURIComponent(today)}`,
        `paz-y-salvo-${unitId}-${today}.pdf`,
      );
    } catch {
      setError('No se pudo generar el Paz y Salvo. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />

      <aside
        className="fixed right-0 top-0 bottom-0 z-40 w-[480px] bg-surface-card border-l border-surface-border flex flex-col shadow-2xl shadow-black/60"
        role="dialog"
        aria-label={`Paz y Salvo — ${unitLabel}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
              Certificado
            </p>
            <h2 className="text-white font-bold text-[15px] leading-tight">
              Paz y Salvo — {unitLabel}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-surface-hover transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col items-center justify-center gap-5">
          {isLoading && (
            <div className="flex items-center gap-2 text-slate-400 text-[13px]">
              <SpinnerIcon className="w-4 h-4" />
              Verificando saldo…
            </div>
          )}

          {!isLoading && hasPendingBalance && (
            <div className="w-full space-y-4">
              <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-status-red/[0.05] border border-status-red/25">
                <div className="w-14 h-14 rounded-full bg-status-red/15 flex items-center justify-center">
                  <ShieldAlert size={28} className="text-status-red" />
                </div>
                <div className="text-center">
                  <p className="text-status-red font-bold text-[15px]">No disponible</p>
                  <p className="text-slate-400 text-[12px] mt-1">
                    La unidad tiene un saldo pendiente de:
                  </p>
                  <p className="text-status-red font-bold text-[22px] tabular-nums mt-1">
                    {formatCOP(balance!)}
                  </p>
                </div>
              </div>
              <p className="text-slate-500 text-[11px] text-center leading-relaxed">
                Para obtener el Paz y Salvo, salda todos los cargos pendientes de esta unidad.
              </p>
            </div>
          )}

          {!isLoading && !hasPendingBalance && data && (
            <div className="w-full space-y-4">
              <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-status-green/[0.05] border border-status-green/25">
                <div className="w-14 h-14 rounded-full bg-status-green/15 flex items-center justify-center">
                  <ShieldCheck size={28} className="text-status-green" />
                </div>
                <div className="text-center">
                  <p className="text-status-green font-bold text-[15px]">A paz y salvo</p>
                  <p className="text-slate-400 text-[12px] mt-1">
                    {unitLabel} no registra deudas a la fecha de hoy.
                  </p>
                  {data.unit.ownerName && (
                    <p className="text-slate-500 text-[11px] mt-0.5">{data.unit.ownerName}</p>
                  )}
                </div>
              </div>
              <p className="text-slate-500 text-[11px] text-center leading-relaxed">
                Corte: {today} · El PDF lleva fecha de expedición y firma del administrador.
              </p>
              {error && (
                <p className="text-status-red text-[11px] text-center">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-surface-border flex-shrink-0">
          <button
            onClick={() => void handleDownload()}
            disabled={downloading || isLoading || !!hasPendingBalance || !data}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-md bg-brand-primary/10 border border-brand-primary/30 hover:bg-brand-primary/20 text-brand-primary text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {downloading ? <SpinnerIcon className="w-3.5 h-3.5" /> : <Download size={14} />}
            {downloading ? 'Generando PDF…' : 'Descargar Paz y Salvo'}
          </button>
        </div>
      </aside>
    </>
  );
}
