import { isNumeric } from './formatters';
import { WorkloadRow } from '../types';

export interface WhyParams {
  cpu_percentile: number;
  memory_buffer_percentage: number;
}

const CPU_HEADROOM_TOLERANCE = 0.15;

export function hasUsageData(row: WorkloadRow): boolean {
  const u = row.usage;
  return !!u && !!(u.cpu || u.memory);
}

function cpuHpaRefused(row: WorkloadRow): boolean {
  // KRR refuses CPU recommendations for HPA-managed resources ("HPA detected"
  // info) or reports "No data"/"Not enough data" as an undefined value.
  const infoCpu = row.info?.cpu ? String(row.info.cpu) : '';
  return infoCpu.includes('HPA detected') || infoCpu.includes('No data') || infoCpu.includes('Not enough data');
}

/**
 * Build the auditable "why" derivation lines for a workload row.
 *
 * Formula mirrors the KRR "simple" strategy:
 *   CPU request    = configured percentile of per-pod usage, max across pods (no headroom)
 *   Memory request = max working set across pods × (1 + buffer%)
 *
 * Returns one line per resource; empty array when nothing can be derived.
 */
export function buildWhyLines(row: WorkloadRow, params?: WhyParams): string[] {
  const lines: string[] = [];
  const recCpu = row.rec?.req_cpu;
  const recMem = row.rec?.req_mem;
  const usage = row.usage;

  // CPU line
  if (cpuHpaRefused(row)) {
    lines.push(
      'CPU request skipped: an HPA with a CPU target controls this value — changing CPU requests would alter autoscaler behavior.'
    );
  } else if (isNumeric(recCpu)) {
    const basisKey = params ? `p${params.cpu_percentile}` : 'p95';
    const basis = usage?.cpu?.[basisKey];
    if (isNumeric(basis)) {
      let line = `CPU request = ${basisKey} of measured CPU usage, max across pods (${Math.round(basis * 1000)}m) → recommended ${Math.round(recCpu * 1000)}m.`;
      if (Math.abs(recCpu - basis) / Math.max(basis, 1e-9) > CPU_HEADROOM_TOLERANCE) {
        line += ' Differs from measured basis; the engine may have used a different window or percentile.';
      }
      lines.push(line);
    } else {
      lines.push(`CPU request recommended at ${Math.round(recCpu * 1000)}m; measured usage unavailable for this container.`);
    }
  }

  // Memory line
  if (row.info?.memory && String(row.info.memory).includes('HPA detected')) {
    lines.push(
      'Memory request skipped: an HPA with a memory target controls this value — changing memory requests would alter autoscaler behavior.'
    );
  } else if (isNumeric(recMem)) {
    const peak = usage?.memory?.max;
    const buffer = params ? params.memory_buffer_percentage : 15;
    if (isNumeric(peak)) {
      const derived = peak * (1 + buffer / 100);
      let line = `Memory request = peak working set (${(peak / 2 ** 20).toFixed(0)}Mi) × ${1 + buffer / 100} buffer → recommended ${(recMem / 2 ** 20).toFixed(0)}Mi.`;
      if (Math.abs(recMem - derived) / Math.max(derived, 1e-9) > CPU_HEADROOM_TOLERANCE) {
        line += ' Differs from measured basis; the engine may have used a different window.';
      }
      lines.push(line);
    } else {
      lines.push(`Memory request recommended at ${(recMem / 2 ** 20).toFixed(0)}Mi; measured usage unavailable for this container.`);
    }
  }

  if (row.sidecar) {
    lines.push('Sidecar container: sized by its own injector (e.g. service mesh) — treat its recommendation with care.');
  }

  return lines;
}
