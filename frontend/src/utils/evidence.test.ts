import { describe, expect, it } from 'vitest';
import { buildWhyLines, hasUsageData } from './evidence';
import { WorkloadRow } from '../types';

const baseRow: WorkloadRow = {
  ns: 'production',
  kind: 'Deployment',
  name: 'api',
  container: 'app',
  pods: 2,
  hpa: false,
  severity: 'WARNING',
  cur: { req_cpu: 2.0, req_mem: 2147483648, lim_cpu: 4.0, lim_mem: 4294967296 },
  rec: { req_cpu: 0.5, req_mem: 536870912, lim_cpu: null, lim_mem: null },
  info: {},
  warnings: [],
};

const params = { cpu_percentile: 95, memory_buffer_percentage: 15 };

describe('hasUsageData', () => {
  it('returns false for pre-v1.1.0 scans (no usage)', () => {
    expect(hasUsageData(baseRow)).toBe(false);
  });

  it('returns true when any usage present', () => {
    expect(hasUsageData({ ...baseRow, usage: { cpu: { p95: 0.4 } } })).toBe(true);
  });
});

describe('buildWhyLines', () => {
  it('derives CPU from measured p95 (no headroom) and memory from peak × buffer', () => {
    const row: WorkloadRow = {
      ...baseRow,
      usage: {
        cpu: { p50: 0.2, p90: 0.35, p95: 0.48, p99: 0.5, max: 0.52 },
        memory: { p50: 209715200, p90: 400000000, p95: 440000000, p99: 460000000, max: 466810000 },
      },
    };
    const lines = buildWhyLines(row, params);
    expect(lines.some((l) => l.includes('p95 of measured CPU usage') && l.includes('480m') && l.includes('500m'))).toBe(true);
    expect(lines.some((l) => l.includes('peak working set') && l.includes('1.15 buffer'))).toBe(true);
  });

  it('flags when recommendation drifts from the measured basis', () => {
    const row: WorkloadRow = {
      ...baseRow,
      usage: { cpu: { p95: 0.2, max: 0.2 } },
    };
    const lines = buildWhyLines(row, params);
    expect(lines.some((l) => l.includes('Differs from measured basis'))).toBe(true);
  });

  it('refuses CPU with a stated reason for HPA-managed workloads', () => {
    const row: WorkloadRow = {
      ...baseRow,
      hpa: true,
      rec: { ...baseRow.rec, req_cpu: null },
      info: { cpu: 'HPA detected' },
    };
    const lines = buildWhyLines(row, params);
    expect(lines.some((l) => l.startsWith('CPU request skipped') && l.includes('HPA'))).toBe(true);
  });

  it('adds a sidecar caution line', () => {
    const lines = buildWhyLines({ ...baseRow, sidecar: true }, params);
    expect(lines.some((l) => l.includes('Sidecar container'))).toBe(true);
  });

  it('falls back to a plain recommendation line without usage data', () => {
    const lines = buildWhyLines(baseRow, params);
    expect(lines.some((l) => l.includes('measured usage unavailable'))).toBe(true);
  });
});
