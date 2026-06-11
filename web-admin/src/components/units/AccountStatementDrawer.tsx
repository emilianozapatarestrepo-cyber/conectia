import { useState } from 'react';
import { X, FileText, Download } from 'lucide-react';
import { useUnitStatement } from '@/hooks/useUnitStatement';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { WhatsAppIcon, SpinnerIcon } from '@/components/ui/icons';
import { formatCOP } from '@/lib/formatters';
import { api } from '@/lib/api';
import type { UnitStatementCharge, UnitStatementPayment } from '@/lib/schemas';

interface Props {
  unitId:    string;
  unitLabel: string;
  period:    string;
  onClose:   () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ChargeRow({ charge }: { charge: UnitStatementCharge }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-[#0d1526] hover:bg-surface-hover transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-slate-200 text-[12px] font-medium truncate">{charge.concept}</p>
        <p className="text-slate-500 text-[10px] mt-0.5">Vence: {formatDate(charge.dueDate)}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <p className="text-slate-200 text-[12px] font-semibold tabular-nums">{formatCOP(charge.amount)}</p>
        <StatusBadge status={charge.status} />
        {charge.status === 'partial' && charge.paidAmount > 0n && (
          <p className="text-brand-primary text-[10px] tabular-nums">Abonado: {formatCOP(charge.paidAmount)}</p>
        )}
      </div>
    </div>
  );
}

function PaymentRow({ payment }: { payment: UnitStatementPayment }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#0d1526] hover:bg-surface-hover transition-colors">
      <span className="w-1.5 h-1.5 rounded-full bg-status-green flex-shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-slate-200 text-[12px] font-medium truncate">{payment.concept}</p>
        <p className="text-slate-500 text-[10px] mt-0.5">{formatDate(payment.paidAt)}</p>
      </div>
      <p className="text-status-green text-[12px] font-semibold tabular-nums flex-shrink-0">
        +{formatCOP(payment.amount)}
      </p>
    </div>
  );
}

async function downloadBlob(path: string, filename: string) {
  const { data } = await api.get<Blob>(path, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AccountStatementDrawer({ unitId, unitLabel, period, onClose }: Props) {
  const { data, isLoading } = useUnitStatement(unitId);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      await downloadBlob(
        `/export/statement?unitId=${encodeURIComponent(unitId)}&period=${period}`,
        `estado-cuenta-${unitId}-${period}.pdf`,
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!data) return;
    const BOM = '﻿';
    const header = 'Tipo;Concepto;Fecha;Monto COP;Estado\n';
    const chargeLines = data.charges.map((c) =>
      `Cargo;${c.concept};${c.dueDate};${(Number(c.amount) / 100).toFixed(2)};${c.status}`
    );
    const paymentLines = data.payments.map((p) =>
      `Pago;${p.concept};${p.paidAt?.slice(0, 10) ?? ''};${(Number(p.amount) / 100).toFixed(2)};pagado`
    );
    const csv = BOM + header + [...chargeLines, ...paymentLines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estado-cuenta-${unitId}-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const phone = data?.unit.phone ?? null;

  return (
    <>
      {/* Scrim */}
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />

      {/* Panel */}
      <aside
        className="fixed right-0 top-0 bottom-0 z-40 w-[480px] bg-surface-card border-l border-surface-border flex flex-col shadow-2xl shadow-black/60"
        role="dialog"
        aria-label={`Estado de cuenta — ${unitLabel}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">
              Estado de cuenta
            </p>
            <h2 className="text-white font-bold text-[15px] leading-tight">{unitLabel}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-surface-hover transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Unit info strip */}
        <div className="px-5 py-3 border-b border-surface-border flex items-center gap-4 flex-shrink-0 bg-[#0d1526]">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Propietario</p>
            <p className="text-slate-200 text-[13px] font-medium truncate mt-0.5">
              {data?.unit.ownerName ?? <span className="text-slate-600 italic">Sin registrar</span>}
            </p>
          </div>
          {phone ? (
            <a
              href={`https://wa.me/57${phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-brand-whatsapp/10 border border-brand-whatsapp/30 hover:bg-brand-whatsapp/20 text-brand-whatsapp text-[11px] font-semibold transition-colors flex-shrink-0"
            >
              <WhatsAppIcon className="w-3.5 h-3.5" />
              {phone}
            </a>
          ) : (
            <span className="text-slate-600 text-[10px] italic flex-shrink-0">Sin teléfono</span>
          )}
        </div>

        {/* Balance strip */}
        <div className="grid grid-cols-3 divide-x divide-surface-border border-b border-surface-border flex-shrink-0">
          {[
            { label: 'Total cobrado', value: data?.totalCharged ?? 0n, color: 'text-slate-200' },
            { label: 'Total pagado',  value: data?.totalPaid ?? 0n,    color: 'text-status-green' },
            { label: 'Saldo',         value: data?.balance ?? 0n,      color: (data?.balance ?? 0n) > 0n ? 'text-status-red' : 'text-status-green' },
          ].map(({ label, value, color }) => (
            <div key={label} className="px-4 py-3 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
              <p className={`${color} text-[14px] font-bold tabular-nums mt-1`}>{formatCOP(value)}</p>
            </div>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading && (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400 text-[13px]">
              <SpinnerIcon className="w-4 h-4" />
              Cargando historial…
            </div>
          )}

          {!isLoading && (
            <>
              {/* Cargos */}
              <section>
                <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Cargos
                  <span className="ml-2 text-slate-600 normal-case font-normal tracking-normal">
                    {data?.charges.length ?? 0} registros
                  </span>
                </h3>
                {(data?.charges.length ?? 0) === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-center rounded-lg border border-dashed border-surface-border">
                    <FileText size={24} className="text-slate-700" />
                    <p className="text-slate-500 text-[12px] font-medium">Sin cargos pendientes</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {data?.charges.map((c) => <ChargeRow key={c.id} charge={c} />)}
                  </div>
                )}
              </section>

              {/* Pagos */}
              <section>
                <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Pagos recibidos
                  <span className="ml-2 text-slate-600 normal-case font-normal tracking-normal">
                    {data?.payments.length ?? 0} registros
                  </span>
                </h3>
                {(data?.payments.length ?? 0) === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-center rounded-lg border border-dashed border-surface-border">
                    <Download size={24} className="text-slate-700" />
                    <p className="text-slate-500 text-[12px] font-medium">Sin pagos registrados</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {data?.payments.map((p) => <PaymentRow key={p.id} payment={p} />)}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-surface-border flex-shrink-0 gap-2">
          <button
            onClick={() => void handleDownloadPdf()}
            disabled={downloading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-brand-primary/10 border border-brand-primary/30 hover:bg-brand-primary/20 text-brand-primary text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {downloading ? <SpinnerIcon className="w-3.5 h-3.5" /> : <FileText size={13} />}
            Descargar PDF
          </button>
          <button
            onClick={handleDownloadCsv}
            disabled={!data}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md border border-surface-border hover:bg-surface-hover text-slate-300 hover:text-white text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={13} />
            Descargar CSV
          </button>
        </div>
      </aside>
    </>
  );
}
