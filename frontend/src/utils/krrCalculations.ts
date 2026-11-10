import { WorkloadRow } from '../types';
import { isNumeric } from './formatters';

const MI = 2 ** 20;

export function calculateDelta(
  row: WorkloadRow,
  resourceKey: 'req_cpu' | 'req_mem' | 'lim_cpu' | 'lim_mem'
): number | null {
  const current = row.cur[resourceKey];
  const recommended = row.rec[resourceKey];

  if (isNumeric(current) && isNumeric(recommended)) {
    const pods = Math.max(row.pods || 1, 1);
    return (current - recommended) * pods;
  }
  return null;
}

export interface ClusterTotals {
  cpuSave: number;
  cpuNeed: number;
  memSave: number;
  memNeed: number;
  cpuCur: number;
  memCur: number;
  containerCount: number;
  workloadCount: number;
  namespaceCount: number;
  podCount: number;
  noReqCount: number;
  unknownCount: number;
  criticalCount: number;
  warningCount: number;
  optimalCount: number;
}

export function computeTotals(rows: WorkloadRow[]): ClusterTotals {
  const workloadsSet = new Set<string>();
  const namespacesSet = new Set<string>();
  let podSum = 0;

  const t: ClusterTotals = {
    cpuSave: 0,
    cpuNeed: 0,
    memSave: 0,
    memNeed: 0,
    cpuCur: 0,
    memCur: 0,
    containerCount: rows.length,
    workloadCount: 0,
    namespaceCount: 0,
    podCount: 0,
    noReqCount: 0,
    unknownCount: 0,
    criticalCount: 0,
    warningCount: 0,
    optimalCount: 0,
  };

  for (const r of rows) {
    const pods = Math.max(r.pods || 1, 1);
    const wlKey = `${r.ns}/${r.kind}/${r.name}`;
    if (!workloadsSet.has(wlKey)) {
      workloadsSet.add(wlKey);
      podSum += pods;
    }
    namespacesSet.add(r.ns);

    const dCpu = calculateDelta(r, 'req_cpu');
    const dMem = calculateDelta(r, 'req_mem');

    if (dCpu !== null) {
      if (dCpu > 0) t.cpuSave += dCpu;
      else if (dCpu < 0) t.cpuNeed += Math.abs(dCpu);
    }

    if (dMem !== null) {
      if (dMem > 0) t.memSave += dMem;
      else if (dMem < 0) t.memNeed += Math.abs(dMem);
    }

    if (isNumeric(r.cur.req_cpu)) t.cpuCur += r.cur.req_cpu * pods;
    if (isNumeric(r.cur.req_mem)) t.memCur += r.cur.req_mem * pods;

    if (r.cur.req_cpu === null && r.cur.req_mem === null) {
      t.noReqCount++;
    }

    const sev = r.severity?.toUpperCase();
    if (sev === 'CRITICAL') t.criticalCount++;
    else if (sev === 'WARNING') t.warningCount++;
    else if (sev === 'OK' || sev === 'GOOD') t.optimalCount++;
    else t.unknownCount++;
  }

  t.workloadCount = workloadsSet.size;
  t.namespaceCount = namespacesSet.size;
  t.podCount = podSum;

  return t;
}

export type WorkloadStatusCategory = 'optimal' | 'overprovisioned' | 'underprovisioned' | 'attention';

export function categorizeWorkload(row: WorkloadRow): WorkloadStatusCategory {
  const sev = (row.severity || '').toUpperCase();
  const dCpu = calculateDelta(row, 'req_cpu');
  const dMem = calculateDelta(row, 'req_mem');
  const isNoReq = row.cur.req_cpu === null && row.cur.req_mem === null;
  const isNoData = !isNumeric(row.rec.req_cpu) && !isNumeric(row.rec.req_mem);

  // Severe issue, missing requests, or missing metrics -> Needs Attention
  if (sev === 'CRITICAL' || isNoReq || isNoData) {
    return 'attention';
  }

  // Requested significantly below recommended -> Underprovisioned (starvation / throttling risk)
  const isUnderCpu = dCpu !== null && dCpu < -0.005;
  const isUnderMem = dMem !== null && dMem < -5 * 1024 * 1024;
  if (isUnderCpu || isUnderMem) {
    return 'underprovisioned';
  }

  // Requested significantly above recommended -> Overprovisioned (wasteful)
  const isOverCpu = dCpu !== null && dCpu > 0.005;
  const isOverMem = dMem !== null && dMem > 5 * 1024 * 1024;
  if (isOverCpu || isOverMem || sev === 'WARNING') {
    return 'overprovisioned';
  }

  return 'optimal';
}

export interface StatusDistribution {
  optimal: number;
  overprovisioned: number;
  underprovisioned: number;
  attention: number;
  total: number;
}

export function computeStatusDistribution(rows: WorkloadRow[]): StatusDistribution {
  const dist: StatusDistribution = {
    optimal: 0,
    overprovisioned: 0,
    underprovisioned: 0,
    attention: 0,
    total: rows.length,
  };

  for (const r of rows) {
    const cat = categorizeWorkload(r);
    dist[cat]++;
  }

  return dist;
}

export interface SavingsOpportunity {
  row: WorkloadRow;
  cpuSave: number;
  memSave: number;
  wasteScore: number;
  category: WorkloadStatusCategory;
}

export function getTopSavingsOpportunities(rows: WorkloadRow[], limit: number = 5): SavingsOpportunity[] {
  const opps: SavingsOpportunity[] = rows.map((r) => {
    const dCpu = calculateDelta(r, 'req_cpu');
    const dMem = calculateDelta(r, 'req_mem');
    const cpuSave = Math.max(0, dCpu || 0);
    const memSave = Math.max(0, dMem || 0);
    // Weighted waste score: 1 CPU core ~ 1000m, 1 GiB ~ 1024 MiB
    const wasteScore = (cpuSave * 1000) + ((memSave / (1024 * 1024)) * 0.5);
    return {
      row: r,
      cpuSave,
      memSave,
      wasteScore,
      category: categorizeWorkload(r),
    };
  });

  // Filter only workloads with actual savings potential (> 0)
  const withSavings = opps.filter((o) => o.wasteScore > 0);

  // Sort descending by wasteScore
  withSavings.sort((a, b) => b.wasteScore - a.wasteScore);

  return withSavings.slice(0, limit);
}

export interface NamespaceDistributionItem {
  namespace: string;
  containersCount: number;
  workloadsCount: number;
  cpuSave: number;
  cpuNeed: number;
  memSave: number;
  memNeed: number;
  optimalCount: number;
  optimalPercent: number;
}

export function computeNamespaceDistribution(rows: WorkloadRow[]): NamespaceDistributionItem[] {
  const nsMap = new Map<string, {
    containersCount: number;
    workloads: Set<string>;
    cpuSave: number;
    cpuNeed: number;
    memSave: number;
    memNeed: number;
    optimalCount: number;
  }>();

  for (const r of rows) {
    let entry = nsMap.get(r.ns);
    if (!entry) {
      entry = {
        containersCount: 0,
        workloads: new Set<string>(),
        cpuSave: 0,
        cpuNeed: 0,
        memSave: 0,
        memNeed: 0,
        optimalCount: 0,
      };
      nsMap.set(r.ns, entry);
    }

    entry.containersCount++;
    entry.workloads.add(`${r.kind}/${r.name}`);

    const dCpu = calculateDelta(r, 'req_cpu');
    const dMem = calculateDelta(r, 'req_mem');

    if (dCpu !== null) {
      if (dCpu > 0) entry.cpuSave += dCpu;
      else if (dCpu < 0) entry.cpuNeed += Math.abs(dCpu);
    }

    if (dMem !== null) {
      if (dMem > 0) entry.memSave += dMem;
      else if (dMem < 0) entry.memNeed += Math.abs(dMem);
    }

    if (categorizeWorkload(r) === 'optimal') {
      entry.optimalCount++;
    }
  }

  const items: NamespaceDistributionItem[] = [];
  for (const [ns, val] of nsMap.entries()) {
    items.push({
      namespace: ns,
      containersCount: val.containersCount,
      workloadsCount: val.workloads.size,
      cpuSave: val.cpuSave,
      cpuNeed: val.cpuNeed,
      memSave: val.memSave,
      memNeed: val.memNeed,
      optimalCount: val.optimalCount,
      optimalPercent: val.containersCount > 0 ? Math.round((val.optimalCount / val.containersCount) * 100) : 100,
    });
  }

  // Sort by potential savings or container count
  items.sort((a, b) => {
    const scoreA = (a.cpuSave * 1000) + ((a.memSave / (1024 * 1024)) * 0.5);
    const scoreB = (b.cpuSave * 1000) + ((b.memSave / (1024 * 1024)) * 0.5);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return b.containersCount - a.containersCount;
  });

  return items;
}

export function generateResourceYaml(row: WorkloadRow): string {
  const rec = row.rec;
  const lines: string[] = ['resources:'];

  const formatCpuVal = (v: number) => Math.ceil(v * 1000) + 'm';
  const formatMemVal = (v: number) => Math.ceil(v / MI) + 'Mi';

  const appendSection = (section: 'requests' | 'limits', cpu: any, mem: any) => {
    const entries: string[] = [];
    if (isNumeric(cpu)) {
      entries.push(`    cpu: ${formatCpuVal(cpu)}`);
    } else if (cpu === '?') {
      entries.push('    # cpu: not enough data to recommend');
    }

    if (isNumeric(mem)) {
      entries.push(`    memory: ${formatMemVal(mem)}`);
    } else if (mem === '?') {
      entries.push('    # memory: not enough data to recommend');
    }

    if (entries.length > 0) {
      lines.push(`  ${section}:`);
      lines.push(...entries);
    }
  };

  appendSection('requests', rec.req_cpu, rec.req_mem);
  appendSection('limits', rec.lim_cpu, rec.lim_mem);

  return lines.join('\n');
}
