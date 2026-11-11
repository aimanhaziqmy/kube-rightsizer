/**
 * Cross-scan trend and diff helpers.
 *
 * The backend (`GET /api/scans/trends`, `GET /api/scans/history`) provides
 * lightweight per-scan data; all aggregation math lives here and reuses
 * `krrCalculations.ts` so the Trends tab uses exactly the same formulas as
 * the Overview and Workloads views.
 */
import { WorkloadRow } from '../types';
import { computeStatusDistribution, computeTotals } from './krrCalculations';
import { isNumeric } from './formatters';

/** Change flags for one workload, from GET /api/scans/{id}/diff. */
export interface DiffChanges {
  recommendation: boolean;
  current: boolean;
  current_toward_recommended: boolean;
  severity: boolean;
}

export interface DiffRow {
  key: string;
  ns: string;
  kind: string;
  name: string;
  container: string;
  changes: DiffChanges;
}

export interface DiffItem {
  key: string;
  ns: string;
  kind: string;
  name: string;
  container: string;
}

export interface ScanDiff {
  baseline: { id: string; started: number };
  target: { id: string; started: number };
  rows: DiffRow[];
  removed: { count: number; items: DiffItem[] };
  added: { count: number; items: DiffItem[] };
}

/** Row shape returned by GET /api/scans/trends (trimmed). */export interface TrendsRow {
  ns: string;
  kind: string;
  name: string;
  container: string;
  pods: number;
  severity: string | null;
  cur: { req_cpu: number | null; req_mem: number | null };
  rec: { req_cpu: number | null; req_mem: number | null };
}

export interface TrendsScan {
  id: string;
  started: number;
  score?: number | null;
  rows: TrendsRow[];
}

/** Point shape returned by GET /api/scans/history. */
export interface HistoryPoint {
  id: string;
  started: number;
  severity: string | null;
  cur: Record<string, number | null>;
  rec: Record<string, number | null>;
}

export type SparklineField = 'rec_cpu' | 'rec_mem' | 'cur_cpu' | 'cur_mem';

export interface TimelinePoint {
  id: string;
  started: number;
  cpuSave: number;
  cpuNeed: number;
  memSave: number;
  memNeed: number;
  optimal: number;
  overprovisioned: number;
  underprovisioned: number;
  attention: number;
}

/** Rebuild a full WorkloadRow from a trimmed trends row so the existing
 * math utilities (computeTotals, categorizeWorkload) work unchanged. */
function asWorkloadRow(r: TrendsRow): WorkloadRow {
  return {
    ns: r.ns,
    kind: r.kind,
    name: r.name,
    container: r.container,
    pods: r.pods || 1,
    hpa: false,
    severity: ((r.severity || 'UNKNOWN').toUpperCase() as WorkloadRow['severity']),
    cur: { req_cpu: r.cur.req_cpu, req_mem: r.cur.req_mem, lim_cpu: null, lim_mem: null },
    rec: { req_cpu: r.rec.req_cpu, req_mem: r.rec.req_mem, lim_cpu: null, lim_mem: null },
    info: {},
    warnings: [],
  };
}

export function buildTimelineSeries(scans: TrendsScan[]): TimelinePoint[] {
  return scans.map((scan) => {
    const rows = (scan.rows || []).map(asWorkloadRow);
    const totals = computeTotals(rows);
    const dist = computeStatusDistribution(rows);
    return {
      id: scan.id,
      started: scan.started,
      cpuSave: totals.cpuSave,
      cpuNeed: totals.cpuNeed,
      memSave: totals.memSave,
      memNeed: totals.memNeed,
      optimal: dist.optimal,
      overprovisioned: dist.overprovisioned,
      underprovisioned: dist.underprovisioned,
      attention: dist.attention,
    };
  });
}

export interface Mover {
  key: string;
  ns: string;
  kind: string;
  name: string;
  container: string;
  recFrom: { req_cpu: number | null; req_mem: number | null };
  recTo: { req_cpu: number | null; req_mem: number | null };
  /** Combined relative change used for ranking (higher = bigger mover). */
  relChange: number;
}

const EPS = 1e-9;

function relativeChange(from: number | null, to: number | null): number {
  if (!isNumeric(from) || !isNumeric(to)) return 0;
  return Math.abs(to - from) / Math.max(Math.abs(from), EPS);
}

export function computeBiggestMovers(scans: TrendsScan[], limit: number = 5): Mover[] {
  if (scans.length < 2) return [];
  const baseline = scans[scans.length - 2];
  const target = scans[scans.length - 1];

  const keyOf = (r: TrendsRow) => `${r.ns}/${r.kind}/${r.name}/${r.container}`;
  const baselineByKey = new Map<string, TrendsRow>();
  for (const r of baseline.rows || []) baselineByKey.set(keyOf(r), r);

  const movers: Mover[] = [];
  for (const trow of target.rows || []) {
    const brow = baselineByKey.get(keyOf(trow));
    if (!brow) continue; // new since last scan — not a mover

    const cpuRel = relativeChange(brow.rec.req_cpu, trow.rec.req_cpu);
    const memRel = relativeChange(brow.rec.req_mem, trow.rec.req_mem);
    const relChange = cpuRel * 1000 + memRel * 0.5; // same weighting family as wasteScore
    if (relChange <= EPS) continue; // unchanged

    movers.push({
      key: keyOf(trow),
      ns: trow.ns,
      kind: trow.kind,
      name: trow.name,
      container: trow.container,
      recFrom: { req_cpu: brow.rec.req_cpu, req_mem: brow.rec.req_mem },
      recTo: { req_cpu: trow.rec.req_cpu, req_mem: trow.rec.req_mem },
      relChange,
    });
  }

  movers.sort((a, b) => b.relChange - a.relChange);
  return movers.slice(0, limit);
}

export function buildSparklineSeries(
  points: HistoryPoint[],
  field: SparklineField
): { values: (number | null)[]; started: number[] } {
  const values: (number | null)[] = [];
  const started: number[] = [];
  for (const p of points) {
    const src = field.startsWith('cur') ? p.cur : p.rec;
    const v = src[field.endsWith('cpu') ? 'req_cpu' : 'req_mem'];
    values.push(isNumeric(v) ? v : null);
    started.push(p.started);
  }
  return { values, started };
}
