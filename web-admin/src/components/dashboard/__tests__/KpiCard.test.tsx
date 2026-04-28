import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from '../KpiCard';

describe('KpiCard', () => {
  it('renders label, value, and trend', () => {
    render(<KpiCard label="RECAUDO" value="$42.8M" trend="↑ +2.1%" trendPositive color="green" />);
    expect(screen.getByText('RECAUDO')).toBeInTheDocument();
    expect(screen.getByText('$42.8M')).toBeInTheDocument();
    expect(screen.getByText('↑ +2.1%')).toBeInTheDocument();
  });

  it('applies correct border color class for red', () => {
    const { container } = render(<KpiCard label="MORA" value="5.8%" trendPositive={false} color="red" />);
    expect(container.firstChild).toHaveClass('border-status-red');
  });

  it('renders without trend', () => {
    render(<KpiCard label="MORA" value="5.8%" color="yellow" />);
    expect(screen.getByText('MORA')).toBeInTheDocument();
  });
});
