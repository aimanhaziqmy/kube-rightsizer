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
  noReqCount: number;
  unknownCount: number;
  criticalCount: number;
  warningCount: number;
  optimalCount: number;
}

export function computeTotals(rows: WorkloadRow[]): ClusterTotals {
  const t: ClusterTotals = {
    cpuSave: 0,
    cpuNeed: 0,
    memSave: 0,
    memNeed: 0,
    cpuCur: 0,
    memCur: 0,
    containerCount: rows.length,
    noReqCount: 0,
    unknownCount: 0,
    criticalCount: 0,
    warningCount: 0,
    optimalCount: 0,
  };

  for (const r of rows) {
    const pods = Math.max(r.pods || 1, 1);
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

  return t;
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
