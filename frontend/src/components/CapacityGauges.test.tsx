import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CapacityGauges } from './CapacityGauges';
import { ScanMeta } from '../types';

const GI = 1024 ** 3;

const scan: ScanMeta = {
  id: '20260101-000000-abcdef',
  started: 1767225600,
  status: 'done',
  params: {
    cpu_percentile: 95,
    memory_buffer_percentage: 15,
    history_days: 14,
    namespaces: [],
  },
};

const capacity = {
  collected_at: 1767225600,
  lookback_hours: 336,
  cpu: { allocatable: 40, usage_avg: 3.2, requests: 36, limits: 98.8 },
  memory: {
    allocatable: 125.06 * GI,
    usage_avg: 58.8 * GI,
    requests: 97.5 * GI,
    limits: 195 * GI,
  },
  warnings: [],
};

describe('CapacityGauges', () => {
  it('renders CPU and memory cards with absolute values and percentages', () => {
    render(<CapacityGauges capacity={capacity} scan={scan} />);

    expect(screen.getByText('Cluster CPU')).toBeInTheDocument();
    expect(screen.getByText('Cluster Memory')).toBeInTheDocument();
    expect(screen.getByTestId('capacity-cpu-center')).toHaveTextContent('40 core');
    expect(screen.getByTestId('capacity-cpu-usage-value')).toHaveTextContent('3.2 core');
    expect(screen.getByTestId('capacity-cpu-usage-percent')).toHaveTextContent('8%');
    expect(screen.getByTestId('capacity-cpu-request-percent')).toHaveTextContent('90%');
    expect(screen.getByTestId('capacity-cpu-limit-percent')).toHaveTextContent('247%');
    expect(screen.getByTestId('capacity-memory-center')).toHaveTextContent('125.06 GiB');
  });

  it('marks over-100 percentages red and caps the arc', () => {
    render(<CapacityGauges capacity={capacity} scan={scan} />);

    expect(screen.getByTestId('capacity-cpu-limit-percent')).toHaveClass('text-rose-600');
    expect(screen.getByTestId('capacity-cpu-limit-arc')).toHaveAttribute(
      'stroke-dasharray',
      expect.stringContaining('439.82'),
    );
  });

  it('shows usage unavailable when Prometheus had no data', () => {
    render(
      <CapacityGauges
        capacity={{
          ...capacity,
          cpu: { allocatable: 40, usage_avg: null, requests: 36, limits: 98.8 },
        }}
        scan={scan}
      />,
    );

    expect(screen.getByTestId('capacity-cpu-usage-percent')).toHaveTextContent('—');
    expect(screen.queryByTestId('capacity-cpu-usage-arc')).not.toBeInTheDocument();
  });

  it('shows capacity unavailable when allocatable is missing', () => {
    render(
      <CapacityGauges
        capacity={{
          ...capacity,
          cpu: { allocatable: null, usage_avg: null, requests: 36, limits: 98.8 },
        }}
        scan={scan}
      />,
    );

    expect(screen.getByTestId('capacity-cpu-center')).toHaveTextContent('unavailable');
    expect(screen.getByTestId('capacity-cpu-request-percent')).toHaveTextContent('—');
  });

  it('shows an empty state for scans without a capacity snapshot', () => {
    render(<CapacityGauges capacity={null} scan={scan} />);
    expect(screen.getByTestId('capacity-empty')).toHaveTextContent('Run a new scan');
  });

  it('treats an empty capacity object like a missing snapshot', () => {
    render(<CapacityGauges capacity={{}} scan={scan} />);
    expect(screen.getByTestId('capacity-empty')).toHaveTextContent('Run a new scan');
  });
});
