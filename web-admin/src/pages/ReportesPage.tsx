import { useState } from 'react';
import { FileDown, BarChart3, TrendingUp } from 'lucide-react';
import { useBalanceGeneral, useEstadoResultados, type ReportAccount } from '@/hooks/useReports';
import { formatCOP } from '@/lib/formatters';
import { api } from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth(): string {
  return today().slice(0, 8) + '01';
}

function copFromStr(s: string): string {
  return formatCOP(BigInt(s));
}

// ── Account section table ─────────────────────────────────────────────────────

interface AccountSectionProps {
  title: string;
  accounts: ReportAccount[];
  total: string;
  totalLabel: string;
  totalColor?: string;
}

function AccountSection({ title, accounts, total, totalLabel, totalColor = 'text-white' }: AccountSectionProps) {
  if (accounts.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] rounded-md mb-1">
        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">{title}</span>
      </div>
      <table className="w-full text-[13px]">
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
              <td className="py-1.5 pl-4 text-slate-500 w-24">{a.code}</td>
              <td className="py-1.5 text-slate-300">{a.name}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-slate-200">{copFromStr(a.balance)}</td>
            </tr>
          ))}
          <tr className="border-t border-white/[0.08]">
            <td className="py-2 pl-4 text-slate-500" colSpan={2}>
              <span className="font-semibold text-slate-300">{totalLabel}</span>
            </td>
            <td className={`py-2 pr-2 text-right tabular-nums font-semibold ${totalColor}`}>{copFromStr(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Balance General Tab ───────────────────────────────────────────────────────

function BalanceGeneralTab() {
  const [asOf, setAsOf] = useState(today());
  const { data, isLoading, error } = useBalanceGeneral(asOf);

  const assets      = data?.accounts.filter((a) => a.accountType === 'asset') ?? [];
  const liabilities = data?.accounts.filter((a) => a.accountType === 'liability') ?? [];
  const equity      = data?.accounts.filter((a) => a.accountType === 'equity') ?? [];

  const handlePdf = async () => {
    const res = await api.get('/reports/balance-general/pdf', {
      params: { asOf },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `balance-general-${asOf}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-slate-400">Corte al</label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.08] text-slate-200 text-[13px] rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={() => void handlePdf()}
          className="flex items-center gap-2 text-[12px] bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-slate-300 rounded-md px-3 py-1.5 transition-colors"
        >
          <FileDown size={13} />
          Exportar PDF
        </button>
      </div>

      {isLoading && <p className="text-slate-500 text-sm py-12 text-center">Cargando…</p>}
      {error && <p className="text-red-400 text-sm py-6 text-center">Error al cargar el reporte</p>}

      {data && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Total Activos',   value: data.totals.assets,      color: 'text-emerald-400' },
              { label: 'Total Pasivos',   value: data.totals.liabilities, color: 'text-amber-400' },
              { label: 'Total Patrimonio', value: data.totals.equity,     color: 'text-indigo-400' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white/[0.04] rounded-xl p-4">
                <p className="text-[11px] text-slate-500 mb-1">{kpi.label}</p>
                <p className={`text-xl font-bold tabular-nums ${kpi.color}`}>{copFromStr(kpi.value)}</p>
              </div>
            ))}
          </div>

          <AccountSection title="ACTIVOS"    accounts={assets}      total={data.totals.assets}      totalLabel="Total Activos"    totalColor="text-emerald-400" />
          <AccountSection title="PASIVOS"    accounts={liabilities} total={data.totals.liabilities} totalLabel="Total Pasivos"    totalColor="text-amber-400" />
          <AccountSection title="PATRIMONIO" accounts={equity}      total={data.totals.equity}      totalLabel="Total Patrimonio" totalColor="text-indigo-400" />

          <div className="mt-4 pt-4 border-t border-white/[0.08] flex justify-between text-[12px] text-slate-500">
            <span>Generado: {data.generatedAt}</span>
            <span className="font-semibold text-slate-300">
              Activos = Pasivos + Patrimonio:{' '}
              <span className={BigInt(data.totals.assets) === BigInt(data.totals.liabilities) + BigInt(data.totals.equity) ? 'text-emerald-400' : 'text-red-400'}>
                {BigInt(data.totals.assets) === BigInt(data.totals.liabilities) + BigInt(data.totals.equity) ? '✓ Cuadra' : '✗ No cuadra'}
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Estado de Resultados Tab ──────────────────────────────────────────────────

function EstadoResultadosTab() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo]     = useState(today());
  const { data, isLoading, error } = useEstadoResultados(from, to);

  const revenue  = data?.accounts.filter((a) => a.accountType === 'revenue') ?? [];
  const expenses = data?.accounts.filter((a) => a.accountType === 'expense') ?? [];

  const handlePdf = async () => {
    const res = await api.get('/reports/estado-resultados/pdf', {
      params: { from, to },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `estado-resultados-${from}-${to}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const net = data ? BigInt(data.totals.netIncome) : 0n;
  const netColor = net >= 0n ? 'text-emerald-400' : 'text-red-400';

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-slate-400">Desde</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.08] text-slate-200 text-[13px] rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <label className="text-[12px] text-slate-400">Hasta</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.08] text-slate-200 text-[13px] rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={() => void handlePdf()}
          className="flex items-center gap-2 text-[12px] bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-slate-300 rounded-md px-3 py-1.5 transition-colors"
        >
          <FileDown size={13} />
          Exportar PDF
        </button>
      </div>

      {isLoading && <p className="text-slate-500 text-sm py-12 text-center">Cargando…</p>}
      {error && <p className="text-red-400 text-sm py-6 text-center">Error al cargar el reporte</p>}

      {data && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Total Ingresos',   value: data.totals.revenue,   color: 'text-emerald-400' },
              { label: 'Total Egresos',    value: data.totals.expenses,  color: 'text-amber-400' },
              { label: 'Resultado Neto',   value: data.totals.netIncome, color: netColor },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white/[0.04] rounded-xl p-4">
                <p className="text-[11px] text-slate-500 mb-1">{kpi.label}</p>
                <p className={`text-xl font-bold tabular-nums ${kpi.color}`}>{copFromStr(kpi.value)}</p>
              </div>
            ))}
          </div>

          <AccountSection title="INGRESOS" accounts={revenue}  total={data.totals.revenue}  totalLabel="Total Ingresos" totalColor="text-emerald-400" />
          <AccountSection title="EGRESOS"  accounts={expenses} total={data.totals.expenses} totalLabel="Total Egresos"  totalColor="text-amber-400" />

          <div className="mt-4 pt-4 border-t border-white/[0.08] flex justify-between items-center text-[12px]">
            <span className="text-slate-500">Generado: {data.generatedAt}</span>
            <div className={`text-base font-bold tabular-nums ${netColor}`}>
              Resultado del período: {copFromStr(data.totals.netIncome)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'balance',   label: 'Balance General',      Icon: BarChart3 },
  { id: 'resultados', label: 'Estado de Resultados', Icon: TrendingUp },
] as const;
type TabId = typeof TABS[number]['id'];

export default function ReportesPage() {
  const [tab, setTab] = useState<TabId>('balance');

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Reportes Financieros</h1>
        <p className="text-[13px] text-slate-500 mt-0.5">Balance general y estado de resultados</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/[0.03] rounded-lg p-1 w-fit">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
              tab === id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-[#0d1425] border border-white/[0.07] rounded-xl p-6">
        {tab === 'balance'    && <BalanceGeneralTab />}
        {tab === 'resultados' && <EstadoResultadosTab />}
      </div>
    </div>
  );
}
