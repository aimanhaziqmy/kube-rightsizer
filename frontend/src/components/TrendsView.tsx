import React, { useMemo } from 'react';
import { ScanMeta } from '../types';
import { TrendsScan, ScanDiff, buildTimelineSeries, computeBiggestMovers, DiffRow } from '../utils/scanDiff';
import { formatTimestamp, formatCpu, formatMem } from '../utils/formatters';
import { formatMem as fmtMemRaw } from '../utils/formatters';
import { TrendingUp, TrendingDown, ArrowUpRight, TrendingUp as MoverIcon, Layers, Trash2, PlusCircle } from 'lucide-react';

interface TrendsViewProps {
  /** Chronological trimmed scans (oldest first), from GET /api/scans/trends */
  trends: TrendsScan[];
  /** All scans for the comparison pickers */
  scanList: ScanMeta[];
  diff: ScanDiff | null;
  baselineId: string | null;
  targetId: string | null;
  onCompareChange: (baselineId: string, targetId: string) => void;
  loading?: boolean;
  onSelectScan: (id: string) => void;
}

const GI = 2 ** 30;

const sectionCard = 'soft-card p-4 sm:p-5';
const sectionTitle = 'text-xs font-bold text-slate-800 tracking-tight flex items-center gap-1.5';

export const TrendsView: React.FC<TrendsViewProps> = ({
  trends,
  scanList,
  diff,
  baselineId,
  targetId,
  onCompareChange,
  loading = false,
  onSelectScan,
}) => {
  const timeline = useMemo(() => buildTimelineSeries(trends), [trends]);
  const movers = useMemo(() => computeBiggestMovers(trends, 5), [trends]);

  if (!loading && trends.length < 2) {
    return (
      <div className="soft-card p-8 sm:p-12 text-center max-w-xl mx-auto mt-8 space-y-3 animate-fade-in">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto shadow-sm">
          <TrendingUp className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Not Enough Scan History</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Trends and drift detection compare two or more rightsizing scans. Run at least one more scan to unlock this view.
        </p>
      </div>
    );
  }

  const maxCpu = Math.max(...timeline.map((p) => p.cpuSave + p.cpuNeed), 0.0001);
  const maxMem = Math.max(...timeline.map((p) => p.memSave + p.memNeed), 1);
  const maxStatus = Math.max(...timeline.map((p) => p.optimal + p.overprovisioned + p.underprovisioned + p.attention), 1);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Comparison pickers */}
      <div className={`${sectionCard} flex flex-col sm:flex-row sm:items-end gap-3`}>
        <div className="flex-1 min-w-0">
          <h2 className={sectionTitle}>
            <TrendingUp className="w-4 h-4 text-blue-600" />
            Cross-Scan Trends
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            How cluster rightsizing metrics and recommendations evolve across {trends.length} scans.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-shrink-0">
          <div>
            <label htmlFor="diff-baseline" className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Baseline scan
            </label>
            <select
              id="diff-baseline"
              value={baselineId ?? ''}
              onChange={(e) => onCompareChange(e.target.value, targetId ?? e.target.value)}
              className="text-xs rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 max-w-[210px]"
            >
              {scanList.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatTimestamp(s.started)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="diff-target" className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Compared to
            </label>
            <select
              id="diff-target"
              value={targetId ?? ''}
              onChange={(e) => onCompareChange(baselineId ?? e.target.value, e.target.value)}
              className="text-xs rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 max-w-[210px]"
            >
              {scanList.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatTimestamp(s.started)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {diff && (
        <div className={`${sectionCard} flex flex-wrap items-center gap-3 text-xs`}>
          <span className="font-semibold text-slate-700">Comparison:</span>
          <span className="text-slate-500">{formatTimestamp(diff.baseline.started)} → {formatTimestamp(diff.target.started)}</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
            <Trash2 className="w-3 h-3" /> {diff.removed.count} removed
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
            <PlusCircle className="w-3 h-3" /> {diff.added.count} added
          </span>
          <span className="text-slate-400 text-[11px]">
            {diff.rows.filter((r) => Object.values(r.changes).some(Boolean)).length} drifting workloads
          </span>
        </div>
      )}

      {/* Chart 1: savings over time */}
      <div className={sectionCard}>
        <h3 className={sectionTitle}>
          <TrendingDown className="w-4 h-4 text-emerald-600" />
          Potential savings per scan
        </h3>
        <div className="mt-3 space-y-2.5">
          {timeline.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500 w-28 flex-shrink-0 tabular-nums">{formatTimestamp(p.started)}</span>
              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2.5 bg-slate-100 rounded overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${(p.cpuSave / maxCpu) * 100}%` }}
                    />
                    <div
                      className="h-full bg-rose-400"
                      style={{ width: `${(p.cpuNeed / maxCpu) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-600 w-24 tabular-nums text-right">
                    {p.cpuSave.toFixed(1)} cores save
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2.5 bg-slate-100 rounded overflow-hidden flex">
                    <div
                      className="h-full bg-teal-500"
                      style={{ width: `${(p.memSave / maxMem) * 100}%` }}
                    />
                    <div
                      className="h-full bg-rose-400"
                      style={{ width: `${(p.memNeed / maxMem) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-600 w-24 tabular-nums text-right">
                    {(p.memSave / GI).toFixed(1)} GiB save
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-3 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" />CPU over-provisioned</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-teal-500" />Memory over-provisioned</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-400" />Under-provisioned (needs more)</span>
        </div>
      </div>

      {/* Chart 2: status distribution over time */}
      <div className={sectionCard}>
        <h3 className={sectionTitle}>
          <Layers className="w-4 h-4 text-blue-600" />
          Workload status distribution per scan
        </h3>
        <div className="mt-3 space-y-2.5">
          {timeline.map((p) => {
            const total = p.optimal + p.overprovisioned + p.underprovisioned + p.attention;
            return (
              <div key={p.id} className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500 w-28 flex-shrink-0 tabular-nums">{formatTimestamp(p.started)}</span>
                <div className="flex-1 h-3 bg-slate-100 rounded overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${(p.optimal / maxStatus) * 100}%` }} title={`${p.optimal} optimal`} />
                  <div className="h-full bg-amber-400" style={{ width: `${(p.overprovisioned / maxStatus) * 100}%` }} title={`${p.overprovisioned} overprovisioned`} />
                  <div className="h-full bg-rose-500" style={{ width: `${(p.underprovisioned / maxStatus) * 100}%` }} title={`${p.underprovisioned} underprovisioned`} />
                  <div className="h-full bg-indigo-500" style={{ width: `${(p.attention / maxStatus) * 100}%` }} title={`${p.attention} need attention`} />
                </div>
                <span className="text-[10px] text-slate-600 w-28 tabular-nums text-right">
                  {p.optimal}/{total} optimal
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-3 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" />Optimal</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400" />Overprovisioned</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500" />Underprovisioned</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-indigo-500" />Needs attention</span>
        </div>
      </div>

      {/* Biggest movers */}
      <div className={sectionCard}>
        <h3 className={sectionTitle}>
          <MoverIcon className="w-4 h-4 text-violet-600" />
          Biggest movers since previous scan
        </h3>
        {movers.length === 0 ? (
          <p className="mt-2 text-[11px] text-slate-500">No recommendation changes between the last two scans.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                  <th className="py-1.5 pr-3 font-semibold">Workload</th>
                  <th className="py-1.5 pr-3 font-semibold">Rec CPU</th>
                  <th className="py-1.5 pr-3 font-semibold">Rec Memory</th>
                </tr>
              </thead>
              <tbody>
                {movers.map((m) => (
                  <tr key={m.key} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-3">
                      <button
                        onClick={() => onSelectScan(scanList.find((s) => s.started === diff?.target.started)?.id ?? targetId ?? '')}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                        title={`View ${m.ns}/${m.kind}/${m.name}`}
                      >
                        {m.name}
                      </button>
                      <span className="text-[10px] text-slate-400 ml-1.5">{m.ns} · {m.kind}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-xs tabular-nums">
                      {m.recFrom.req_cpu !== m.recTo.req_cpu ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-slate-400">{m.recFrom.req_cpu != null ? formatCpu(m.recFrom.req_cpu) : '—'}</span>
                          <ArrowUpRight className="w-3 h-3 text-slate-400" />
                          <span className="font-semibold text-slate-800">{m.recTo.req_cpu != null ? formatCpu(m.recTo.req_cpu) : '—'}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-xs tabular-nums">
                      {m.recFrom.req_mem !== m.recTo.req_mem ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-slate-400">{m.recFrom.req_mem != null ? formatMem(m.recFrom.req_mem) : '—'}</span>
                          <ArrowUpRight className="w-3 h-3 text-slate-400" />
                          <span className="font-semibold text-slate-800">{m.recTo.req_mem != null ? formatMem(m.recTo.req_mem) : '—'}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// Keep DiffRow referenced for consumers typing diff-driven tables
export type { DiffRow };
