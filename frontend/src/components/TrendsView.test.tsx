import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrendsView } from './TrendsView';
import { TrendsScan } from '../utils/scanDiff';
import { ScanMeta } from '../types';

const scan = (over: Partial<TrendsScan> & { id: string; started: number }): TrendsScan => ({
  rows: [
    {
      ns: 'production', kind: 'Deployment', name: 'api-gateway', container: 'proxy',
      pods: 2, severity: 'CRITICAL',
      cur: { req_cpu: 2.0, req_mem: 2147483648 },
      rec: { req_cpu: 0.5, req_mem: 536870912 },
    },
  ],
  ...over,
});

const scans: TrendsScan[] = [
  scan({ id: '20260101-000000-aaaaaa', started: 1704067200 }),
  scan({ id: '20260102-000000-bbbbbb', started: 1704153600 }),
];

const scanList: ScanMeta[] = [
  { id: '20260102-000000-bbbbbb', started: 1704153600, status: 'done', params: { cpu_percentile: 95, memory_buffer_percentage: 15, history_days: 14, namespaces: [] } },
  { id: '20260101-000000-aaaaaa', started: 1704067200, status: 'done', params: { cpu_percentile: 95, memory_buffer_percentage: 15, history_days: 14, namespaces: [] } },
];

const defaultProps = () => ({
  trends: scans,
  scanList,
  diff: null,
  baselineId: '20260101-000000-aaaaaa',
  targetId: '20260102-000000-bbbbbb',
  onCompareChange: vi.fn(),
  loading: false,
  onSelectScan: vi.fn(),
});

describe('TrendsView', () => {
  it('renders a timeline chart point per scan with savings and dates', () => {
    render(<TrendsView {...defaultProps()} />);
    // Both scan dates visible on the timeline
    expect(screen.getAllByText(/2024-01-0[12]/).length).toBeGreaterThanOrEqual(2);
    // The api-gateway savings (3 CPU cores) shows on the chart (once per scan)
    expect(screen.getAllByText(/3\.0 cores save/i).length).toBe(2);
  });

  it('lists biggest movers ranked with their recommendation change', () => {
    const withMovers: TrendsScan[] = [
      scan({ id: '20260101-000000-aaaaaa', started: 1704067200, rows: [scan({ id: 'x', started: 0 }).rows[0]] }),
      scan({
        id: '20260102-000000-bbbbbb', started: 1704153600,
        rows: [{
          ns: 'production', kind: 'Deployment', name: 'api-gateway', container: 'proxy',
          pods: 2, severity: 'CRITICAL',
          cur: { req_cpu: 2.0, req_mem: 2147483648 },
          rec: { req_cpu: 1.2, req_mem: 536870912 },
        }],
      }),
    ];
    render(<TrendsView {...defaultProps()} trends={withMovers} />);
    expect(screen.getByText('api-gateway')).toBeInTheDocument();
    // From 500m to 1.2 cores
    expect(screen.getByText('500m')).toBeInTheDocument();
    expect(screen.getByText('1.2')).toBeInTheDocument();
  });

  it('shows removed and added workload counts from the diff', () => {
    render(
      <TrendsView
        {...defaultProps()}
        diff={{
          baseline: { id: '20260101-000000-aaaaaa', started: 1704067200 },
          target: { id: '20260102-000000-bbbbbb', started: 1704153600 },
          rows: [],
          removed: { count: 2, items: [] },
          added: { count: 1, items: [] },
        }}
      />
    );
    expect(screen.getByText(/2 removed/i)).toBeInTheDocument();
    expect(screen.getByText(/1 added/i)).toBeInTheDocument();
  });

  it('shows an empty state when fewer than two scans exist', () => {
    render(<TrendsView {...defaultProps()} trends={[scans[0]]} />);
    expect(screen.getByText(/not enough scan history/i)).toBeInTheDocument();
  });

  it('lets the user pick a different scan pair for comparison', () => {
    const onCompareChange = vi.fn();
    render(<TrendsView {...defaultProps()} onCompareChange={onCompareChange} />);
    const baselineSelect = screen.getByLabelText(/baseline scan/i);
    fireEvent.change(baselineSelect, { target: { value: '20260102-000000-bbbbbb' } });
    expect(onCompareChange).toHaveBeenCalledWith('20260102-000000-bbbbbb', '20260102-000000-bbbbbb');
  });
});
