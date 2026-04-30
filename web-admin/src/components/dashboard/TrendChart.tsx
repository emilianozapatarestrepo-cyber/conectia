import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { TrendPoint } from '@/lib/schemas';
import { formatCOP } from '@/lib/formatters';

interface Props { data: TrendPoint[]; currentPeriod: string }

type ChartEntry = {
  label: string;
  value: number;
  period: string;
  pct: number;
};

export function TrendChart({ data, currentPeriod }: Props) {
  const chartData: ChartEntry[] = data.map((p) => ({
    label: p.label,
    value: Number(p.collectedAmount) / 100,
    period: p.period,
    pct: p.collectedPct,
  }));

  return (
    <div className="bg-surface-card rounded-lg p-4 h-full">
      <p className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase mb-4">
        RECAUDO MENSUAL
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} barCategoryGap="30%">
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: 'rgba(59,130,246,0.1)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as ChartEntry;
              return (
                <div className="bg-[#0a0f1e] border border-surface-border rounded-md px-3 py-2 text-xs">
                  <p className="text-white font-semibold">{formatCOP(BigInt(Math.round((d?.value ?? 0) * 100)))}</p>
                  <p className="text-slate-400">{d?.pct?.toFixed(1)}% cobrado</p>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.period}
                fill={entry.period === currentPeriod ? '#22C55E' : 'rgba(59,130,246,0.45)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
