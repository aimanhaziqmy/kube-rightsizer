const MI = 2 ** 20;
const GI = 2 ** 30;

export const isNumeric = (v: any): v is number => typeof v === 'number' && !isNaN(v);

export function formatCpu(v: number | null | string): string {
  if (v === null || v === undefined) return 'unset';
  if (typeof v === 'string') return v;
  if (!isNumeric(v)) return '?';
  if (Math.abs(v) < 1) {
    return Math.round(v * 1000) + 'm';
  }
  return Number(v.toFixed(2)).toString();
}

export function formatMem(v: number | null | string): string {
  if (v === null || v === undefined) return 'unset';
  if (typeof v === 'string') return v;
  if (!isNumeric(v)) return '?';
  if (Math.abs(v) >= GI) {
    return (v / GI).toFixed(1) + 'Gi';
  }
  return Math.round(v / MI) + 'Mi';
}

export function formatDelta(v: number | null, unitFormatter: (n: number) => string): { text: string; type: 'save' | 'need' | 'zero' | 'unset' } {
  if (v === null || v === undefined) return { text: '—', type: 'unset' };
  if (Math.abs(v) < 1e-9) return { text: '0', type: 'zero' };
  if (v > 0) {
    return { text: `−${unitFormatter(v)}`, type: 'save' };
  }
  return { text: `+${unitFormatter(-v)}`, type: 'need' };
}

export function formatTimestamp(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

export function getStatusBadgeStyle(severity: string) {
  const norm = severity.toUpperCase();
  switch (norm) {
    case 'CRITICAL':
      return {
        label: 'Needs Attention',
        bg: 'bg-rose-50 text-rose-700 border-rose-200/80',
        dot: 'bg-rose-500',
      };
    case 'WARNING':
      return {
        label: 'Overprovisioned',
        bg: 'bg-amber-50 text-amber-800 border-amber-200/80',
        dot: 'bg-amber-500',
      };
    case 'OK':
    case 'GOOD':
      return {
        label: 'Optimal',
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
        dot: 'bg-emerald-500',
      };
    case 'RUNNING':
      return {
        label: 'Running',
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
        dot: 'bg-emerald-500',
      };
    case 'STOPPED':
      return {
        label: 'Stopped',
        bg: 'bg-slate-100 text-slate-700 border-slate-200',
        dot: 'bg-slate-400',
      };
    case 'DEGRADED':
      return {
        label: 'Degraded',
        bg: 'bg-amber-50 text-amber-800 border-amber-200/80',
        dot: 'bg-amber-500',
      };
    default:
      return {
        label: 'Needs Data',
        bg: 'bg-slate-100 text-slate-600 border-slate-200',
        dot: 'bg-slate-400',
      };
  }
}
