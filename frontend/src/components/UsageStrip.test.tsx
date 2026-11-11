import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageStrip } from './UsageStrip';

describe('UsageStrip', () => {
  const usage = {
    p50: 0.2,
    p90: 0.35,
    p95: 0.48,
    p99: 0.5,
    max: 0.6,
  };

  it('renders the measured distribution with markers', () => {
    render(
      <UsageStrip
        title="CPU usage"
        usage={usage}
        currentValue={2.0}
        recommendedValue={0.5}
        highlightKey="p95"
        format={(v) => `${Math.round(v * 1000)}m`}
      />
    );
    expect(screen.getByTestId('usage-strip')).toBeInTheDocument();
    // p50..p99 ticks + current + recommended markers
    expect(screen.getByTitle('p50: 200m')).toBeInTheDocument();
    expect(screen.getByTitle('p95: 480m')).toBeInTheDocument();
    expect(screen.getByTitle('Current: 2000m')).toBeInTheDocument();
    expect(screen.getByTitle('Recommended: 500m')).toBeInTheDocument();
  });

  it('shows the pre-v1.1.0 placeholder when no usage data exists', () => {
    render(<UsageStrip title="CPU usage" usage={null} format={(v) => `${v}`} />);
    expect(screen.getByTestId('usage-strip-empty')).toBeInTheDocument();
    expect(screen.getByText(/pre-v1\.1\.0|Run a new scan/i)).toBeInTheDocument();
  });

  it('handles partial percentile data (e.g. only max)', () => {
    render(<UsageStrip title="Memory usage" usage={{ max: 500 }} format={(v) => `${v}`} />);
    expect(screen.getByTestId('usage-strip')).toBeInTheDocument();
    expect(screen.getByText(/max 500/)).toBeInTheDocument();
  });
});
