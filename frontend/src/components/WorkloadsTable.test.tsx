import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkloadsTable } from './WorkloadsTable';
import { WorkloadRow } from '../types';
import { DiffChanges, HistoryPoint } from '../utils/scanDiff';

const row = (over: Partial<WorkloadRow> = {}): WorkloadRow => ({
  ns: 'production',
  kind: 'Deployment',
  name: 'api-gateway',
  container: 'proxy',
  pods: 2,
  hpa: false,
  severity: 'CRITICAL',
  cur: { req_cpu: 2.0, req_mem: 2147483648, lim_cpu: 4.0, lim_mem: 4294967296 },
  rec: { req_cpu: 0.5, req_mem: 536870912, lim_cpu: 1.0, lim_mem: 1073741824 },
  info: {},
  warnings: [],
  ...over,
});

const drift: Record<string, DiffChanges> = {
  'production/Deployment/api-gateway/proxy': {
    recommendation: true,
    current: false,
    current_toward_recommended: false,
    severity: false,
  },
};

const historyPoints: HistoryPoint[] = [
  { id: 'a', started: 1000, severity: 'CRITICAL', cur: { req_cpu: 2.0, req_mem: 1 }, rec: { req_cpu: 0.5, req_mem: 1 } },
  { id: 'b', started: 2000, severity: 'CRITICAL', cur: { req_cpu: 2.0, req_mem: 1 }, rec: { req_cpu: 0.4, req_mem: 1 } },
];

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('WorkloadsTable drift integration', () => {
  it('shows a DRIFT column with badges for drifting workloads', () => {
    render(<WorkloadsTable rows={[row()]} drift={drift} />);
    expect(screen.getByText('DRIFT')).toBeInTheDocument();
    expect(screen.getByText('Rec changed')).toBeInTheDocument();
  });

  it('renders no drift badges when drift data is absent', () => {
    render(<WorkloadsTable rows={[row()]} />);
    expect(screen.queryByText('Rec changed')).not.toBeInTheDocument();
  });

  it('lazily loads and renders a recommendation sparkline when a row is expanded', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/scans/history')) {
        return { ok: true, json: async () => ({ key: 'x', points: historyPoints }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkloadsTable rows={[row()]} />);

    // Expand the row
    fireEvent.click(screen.getByTitle('Expand row details'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/scans/history'));
    });
    // Two scan points on the sparkline
    await waitFor(() => {
      expect(document.querySelectorAll('svg circle title').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows a friendly message when history fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ detail: 'boom' }) })));

    render(<WorkloadsTable rows={[row()]} />);
    fireEvent.click(screen.getByTitle('Expand row details'));

    await waitFor(() => {
      expect(screen.getByText(/history unavailable/i)).toBeInTheDocument();
    });
  });
});
