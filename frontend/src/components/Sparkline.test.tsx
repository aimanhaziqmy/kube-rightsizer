import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders a line for every non-null value', () => {
    const { container } = render(<Sparkline values={[0.5, 0.4, 0.45]} started={[1000, 2000, 3000]} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    // 3 points -> 3 coordinate pairs
    const coords = polyline?.getAttribute('points')?.trim().split(/\s+/);
    expect(coords).toHaveLength(3);
  });

  it('renders dots with titles for each scan point', () => {
    const { container } = render(<Sparkline values={[0.5, 0.4]} started={[1000, 2000]} />);
    const titles = container.querySelectorAll('circle title');
    expect(titles).toHaveLength(2);
    expect(titles[0].textContent).toMatch(/scan/i);
  });

  it('shows a "no data" placeholder for all-null series', () => {
    render(<Sparkline values={[null, null]} started={[1000, 2000]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
    expect(document.querySelector('polyline')).toBeNull();
  });

  it('shows a stable placeholder for a single point (not enough to draw a line)', () => {
    render(<Sparkline values={[0.5]} started={[1000]} />);
    expect(screen.getByText(/1 scan/i)).toBeInTheDocument();
  });
});
