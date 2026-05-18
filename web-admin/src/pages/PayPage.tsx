import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface PaymentInfo {
  reference:     string;
  status:        string;
  tenantName:    string;
  tenantAddress: string | null;
  unitLabel:     string;
  ownerName:     string | null;
  concept:       string;
  dueDate:       string | null;
  amountCents:   string;
  currency:      string;
  paidAt:        string | null;
  wompiUrl:      string | null;
}

function formatCOPFromCents(cents: string): string {
  const pesos = Number(BigInt(cents)) / 100;
  return new Intl.NumberFormat('es-CO', {
    style:                 'currency',
    currency:              'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pesos);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(iso));
}

function formatDatetime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

// ── Overdue helper ────────────────────────────────────────────────────────────
function isOverdue(dueDateIso: string | null): boolean {
  if (!dueDateIso) return false;
  return new Date(dueDateIso) < new Date();
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PayPage() {
  const { reference } = useParams<{ reference: string }>();
  const [info,    setInfo]    = useState<PaymentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return;
    const ctrl = new AbortController();

    fetch(`/api/v1/pay/${reference}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Error ${r.status}`);
        }
        return r.json() as Promise<PaymentInfo>;
      })
      .then(setInfo)
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [reference]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start px-4 py-8">
      {/* ── Conectia wordmark ── */}
      <div className="mb-6 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
          <span className="text-white font-bold text-[13px]">C</span>
        </div>
        <span className="text-slate-700 font-semibold text-sm tracking-tight">Conectia</span>
      </div>

      {loading && <LoadingCard />}
      {error   && <ErrorCard message={error} />}
      {info    && <PayCard info={info} />}

      <p className="mt-8 text-[11px] text-slate-400 text-center">
        Pago procesado de forma segura por Wompi · Conectia 2026
      </p>
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────

function LoadingCard() {
  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4 animate-pulse">
      <div className="h-3 bg-slate-200 rounded w-2/3" />
      <div className="h-8 bg-slate-200 rounded w-1/2" />
      <div className="h-3 bg-slate-200 rounded w-full" />
      <div className="h-3 bg-slate-200 rounded w-5/6" />
      <div className="h-11 bg-slate-200 rounded-xl w-full mt-4" />
    </div>
  );
}

// ── Error ─────────────────────────────────────────────────────────────────────

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center space-y-3">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto">
        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p className="text-slate-700 font-medium text-sm">No encontramos este link de pago</p>
      <p className="text-slate-400 text-[12px]">{message}</p>
    </div>
  );
}

// ── Main payment card ─────────────────────────────────────────────────────────

function PayCard({ info }: { info: PaymentInfo }) {
  const paid    = info.status === 'confirmed' || info.status === 'settled';
  const overdue = !paid && isOverdue(info.dueDate);

  if (paid) return <PaidCard info={info} />;

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Building header */}
      <div className="bg-blue-600 px-5 py-4">
        <p className="text-blue-200 text-[11px] font-medium uppercase tracking-widest">
          {info.tenantName}
        </p>
        <p className="text-white font-semibold text-sm mt-0.5 leading-tight">
          {info.concept}
        </p>
      </div>

      <div className="p-5 space-y-4">
        {/* Amount */}
        <div className="text-center py-2">
          <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-1">
            Total a pagar
          </p>
          <p className="text-4xl font-bold text-slate-800 tabular-nums">
            {formatCOPFromCents(info.amountCents)}
          </p>
          {info.dueDate && (
            <p className={`text-[12px] mt-1 font-medium ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
              {overdue ? '⚠ Vencido el' : 'Vence el'} {formatDate(info.dueDate)}
            </p>
          )}
        </div>

        {/* Details */}
        <div className="bg-slate-50 rounded-xl divide-y divide-slate-100">
          <DetailRow label="Unidad"       value={info.unitLabel} />
          {info.ownerName && <DetailRow label="Propietario" value={info.ownerName} />}
          {info.tenantAddress && (
            <DetailRow label="Dirección" value={info.tenantAddress} />
          )}
        </div>

        {/* CTA */}
        {info.wompiUrl ? (
          <a
            href={info.wompiUrl}
            className="block w-full text-center py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all text-white font-semibold text-[15px] shadow-sm"
          >
            Pagar ahora
          </a>
        ) : (
          <div className="py-3 text-center text-slate-400 text-sm">
            Link de pago no disponible. Contacta al administrador.
          </div>
        )}

        {/* Trust */}
        <div className="flex items-center justify-center gap-1.5 text-slate-400 text-[11px]">
          <LockIcon />
          Pago seguro procesado por Wompi
        </div>
      </div>
    </div>
  );
}

// ── Paid confirmation ─────────────────────────────────────────────────────────

function PaidCard({ info }: { info: PaymentInfo }) {
  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="bg-green-500 px-5 py-4">
        <p className="text-green-100 text-[11px] font-medium uppercase tracking-widest">
          {info.tenantName}
        </p>
        <p className="text-white font-semibold text-sm mt-0.5">{info.concept}</p>
      </div>

      <div className="p-5 text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <p className="text-slate-800 font-bold text-lg">¡Pago registrado!</p>
          <p className="text-2xl font-bold text-green-600 tabular-nums mt-1">
            {formatCOPFromCents(info.amountCents)}
          </p>
        </div>

        {info.paidAt && (
          <p className="text-slate-400 text-[12px]">
            Pagado el {formatDatetime(info.paidAt)}
          </p>
        )}

        <div className="bg-slate-50 rounded-xl divide-y divide-slate-100 text-left">
          <DetailRow label="Unidad"       value={info.unitLabel} />
          {info.ownerName && <DetailRow label="Propietario" value={info.ownerName} />}
        </div>

        <p className="text-slate-400 text-[11px]">
          Conserva este comprobante. Gracias por tu pago.
        </p>
      </div>
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-slate-400 text-[12px]">{label}</span>
      <span className="text-slate-700 text-[12px] font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

function LockIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}
