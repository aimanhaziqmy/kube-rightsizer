import { describe, expect, it } from 'vitest';
import { buildTimelineSeries, computeBiggestMovers, buildSparklineSeries, TrendsScan, HistoryPoint } from './scanDiff';

const row = (over: Partial<Parameters<typeof Object.assign>[0]> = {}) => ({
  ns: 'production',
  kind: 'Deployment',
  name: 'api-gateway',
  container: 'proxy',
  pods: 2,
  severity: 'CRITICAL',
  cur: { req_cpu: 2.0, req_mem: 2147483648 },
  rec: { req_cpu: 0.5, req_mem: 536870912 },
  ...over,
});

describe('buildTimelineSeries', () => {
  it('aggregates savings and status counts per scan, oldest first', () => {
    const scans: TrendsScan[] = [
      {
        id: 'scan-old',
        started: 1000,
        rows: [
          row() as any,
          row({ name: 'starved', cur: { req_cpu: 0.1, req_mem: 268435456 }, rec: { req_cpu: 0.5, req_mem: 805306368 }, severity: 'CRITICAL' }) as any,
          row({ name: 'optimal', cur: { req_cpu: 0.5, req_mem: 536870912 }, rec: { req_cpu: 0.5, req_mem: 536870912 }, severity: 'GOOD' }) as any,
        ],
      },
      {
        id: 'scan-new',
        started: 2000,
        rows: [
          // Someone applied the patch between scans: cur moved to the recommendation
          row({ cur: { req_cpu: 0.5, req_mem: 536870912 } }) as any,
        ],
      },
    ];

    const series = buildTimelineSeries(scans);

    expect(series).toHaveLength(2);
    // Oldest first (chronological)
    expect(series[0].id).toBe('scan-old');

    // api-gateway over-provisioned: (2.0 - 0.5) * 2 pods = 3.0 CPU cores
    expect(series[0].cpuSave).toBeCloseTo(3.0 + 0.0, 6);
    // starved workload under-provisioned: (0.5 - 0.1) * 2 pods = 0.8 cores needed
    expect(series[0].cpuNeed).toBeCloseTo(0.8, 6);
    // memSave: (2147483648 - 536870912) * 2 = 3221225472 bytes
    expect(series[0].memSave).toBe(3221225472);

    // In the newer scan the fix was applied: savings drop to zero
    expect(series[1].cpuSave).toBeCloseTo(0, 6);
    expect(series[1].memSave).toBe(0);

    // Status counts follow computeStatusDistribution
    expect(series[0].attention).toBeGreaterThanOrEqual(2);
  });
});

describe('computeBiggestMovers', () => {
  it('ranks workloads by relative recommendation change between the last two scans', () => {
    const scans: TrendsScan[] = [
      {
        id: 'scan-old',
        started: 1000,
        rows: [
          row({ name: 'big-mover', rec: { req_cpu: 0.5, req_mem: 536870912 } }) as any,
          row({ name: 'small-mover', rec: { req_cpu: 0.5, req_mem: 536870912 } }) as any,
        ],
      },
      {
        id: 'scan-new',
        started: 2000,
        rows: [
          // big-mover: CPU 0.5 -> 2.0 (300% change), mem unchanged
          row({ name: 'big-mover', rec: { req_cpu: 2.0, req_mem: 536870912 } }) as any,
          // small-mover: CPU 0.5 -> 0.55 (10% change)
          row({ name: 'small-mover', rec: { req_cpu: 0.55, req_mem: 536870912 } }) as any,
          // new workload: not a mover (absent from baseline)
          row({ name: 'brand-new' }) as any,
        ],
      },
    ];

    const movers = computeBiggestMovers(scans, 5);

    expect(movers).toHaveLength(2);
    expect(movers[0].key).toBe('production/Deployment/big-mover/proxy');
    expect(movers[0].recFrom.req_cpu).toBe(0.5);
    expect(movers[0].recTo.req_cpu).toBe(2.0);
    expect(movers[1].key).toBe('production/Deployment/small-mover/proxy');

    // Unchanged recommendations are not movers; brand-new rows are excluded
    expect(movers.find((m) => m.name === 'brand-new')).toBeUndefined();
  });

  it('returns an empty list when fewer than two scans exist', () => {
    const scans: TrendsScan[] = [{ id: 'only', started: 1000, rows: [row() as any] }];
    expect(computeBiggestMovers(scans, 5)).toEqual([]);
  });
});

describe('buildSparklineSeries', () => {
  it('extracts recommendation values in chronological order with scan starts', () => {
    const points: HistoryPoint[] = [
      { id: 'a', started: 1000, severity: 'CRITICAL', cur: {}, rec: { req_cpu: 0.5, req_mem: 1 } } as any,
      { id: 'b', started: 2000, severity: 'WARNING', cur: {}, rec: { req_cpu: 0.4, req_mem: 1 } } as any,
      { id: 'c', started: 3000, severity: 'OK', cur: {}, rec: { req_cpu: 0.45, req_mem: 1 } } as any,
    ];

    const series = buildSparklineSeries(points, 'rec_cpu');
    expect(series.values).toEqual([0.5, 0.4, 0.45]);
    expect(series.started).toEqual([1000, 2000, 3000]);
  });

  it('keeps gaps as null when a scan has no value for the field', () => {
    const points: HistoryPoint[] = [
      { id: 'a', started: 1000, severity: 'CRITICAL', cur: {}, rec: { req_cpu: 0.5, req_mem: 1 } } as any,
      { id: 'b', started: 2000, severity: 'WARNING', cur: {}, rec: { req_cpu: null, req_mem: 1 } } as any,
    ];
    expect(buildSparklineSeries(points, 'rec_cpu').values).toEqual([0.5, null]);
  });
});
