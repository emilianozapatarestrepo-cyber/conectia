/** Format COP centavos (bigint) to display string: $42.800.000 */
export function formatCOP(centavos: bigint): string {
  const pesos = Number(centavos) / 100;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pesos);
}

/** Format a percentage number: 94.2 → '94.2%' */
export function formatPct(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

/** Format date in es-CO locale: 2026-05-15 → '15 may. 2026' */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** Format period YYYY-MM to display: '2026-05' → 'Mayo 2026' */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-');
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' })
    .format(new Date(Number(year), Number(month) - 1));
}

/** Format trend delta: 2.1 → '↑ +2.1%', -1.5 → '↓ -1.5%', 0 → '—' */
export function formatTrend(delta: number): string {
  if (delta === 0) return '—';
  const sign = delta > 0 ? '+' : '';
  const arrow = delta > 0 ? '↑' : '↓';
  return `${arrow} ${sign}${delta.toFixed(1)}%`;
}

/** Parse bigint string from API to bigint */
export function parseBigInt(value: string | number): bigint {
  return BigInt(value);
}
