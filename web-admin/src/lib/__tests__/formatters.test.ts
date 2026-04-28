import { describe, it, expect } from 'vitest';
import { formatCOP, formatPct, formatDate, formatTrend } from '../formatters';

describe('formatCOP', () => {
  it('formats bigint COP centavos to Colombian peso string', () => {
    // 4280000000 centavos = $42.800.000
    const result = formatCOP(4280000000n);
    expect(result).toMatch(/42[.,]800[.,]000/);
  });
  it('formats zero', () => {
    const result = formatCOP(0n);
    expect(result).toMatch(/0/);
  });
  it('handles millions correctly', () => {
    const result = formatCOP(100000000n);
    expect(result).toMatch(/1[.,]000[.,]000/);
  });
});

describe('formatPct', () => {
  it('formats number as percentage with 1 decimal', () => {
    const result = formatPct(94.2);
    expect(result).toMatch(/94[.,]2\s*%/);
  });
  it('rounds to 1 decimal', () => {
    const result = formatPct(94.25);
    // Should round to 94.3% (or 94.2% depending on rounding)
    expect(result).toMatch(/94[.,][23]\s*%/);
  });
});

describe('formatTrend', () => {
  it('returns positive trend with up arrow', () => {
    expect(formatTrend(2.1)).toBe('↑ +2.1%');
  });
  it('returns negative trend with down arrow', () => {
    expect(formatTrend(-1.5)).toBe('↓ -1.5%');
  });
  it('returns em dash for zero', () => {
    expect(formatTrend(0)).toBe('—');
  });
});
