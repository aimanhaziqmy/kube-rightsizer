import React, { useMemo } from 'react';
import { FolderTree, Cpu, HardDrive, ArrowRight, Layers } from 'lucide-react';
import { WorkloadRow } from '../types';
import { formatCpu, formatMem } from '../utils/formatters';
import { calculateDelta } from '../utils/krrCalculations';

interface NamespacesViewProps {
  rows: WorkloadRow[];
  onSelectNamespace: (ns: string) => void;
}

interface NamespaceSummary {
  ns: string;
  workloadCount: number;
  podCount: number;
  cpuSave: number;
  cpuNeed: number;
  memSave: number;
  memNeed: number;
  criticalCount: number;
}

export const NamespacesView: React.FC<NamespacesViewProps> = ({ rows, onSelectNamespace }) => {
  const summaries = useMemo(() => {
    const map = new Map<string, NamespaceSummary>();

    for (const r of rows) {
      if (!map.has(r.ns)) {
        map.set(r.ns, {
          ns: r.ns,
          workloadCount: 0,
          podCount: 0,
          cpuSave: 0,
          cpuNeed: 0,
          memSave: 0,
          memNeed: 0,
          criticalCount: 0,
        });
      }
      const s = map.get(r.ns)!;
      s.workloadCount += 1;
      s.podCount += r.pods || 1;

      const dCpu = calculateDelta(r, 'req_cpu');
      const dMem = calculateDelta(r, 'req_mem');

      if (dCpu !== null) {
        if (dCpu > 0) s.cpuSave += dCpu;
        else if (dCpu < 0) s.cpuNeed += Math.abs(dCpu);
      }

      if (dMem !== null) {
        if (dMem > 0) s.memSave += dMem;
        else if (dMem < 0) s.memNeed += Math.abs(dMem);
      }

      if (r.severity?.toUpperCase() === 'CRITICAL') {
        s.criticalCount += 1;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.cpuSave - a.cpuSave);
  }, [rows]);

  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">Namespace Allocation Breakdown</h2>
          <p className="text-xs text-slate-500">
            Holistic view of resource allocations and potential cost savings across all Kubernetes namespaces
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
          {summaries.length} Namespaces Analyzed
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {summaries.map((s) => (
          <div
            key={s.ns}
            className="soft-card p-4 hover:shadow-soft-md transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <FolderTree className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">{s.ns}</h3>
                    <span className="text-[11px] text-slate-400">
                      {s.workloadCount} containers · {s.podCount} total pods
                    </span>
                  </div>
                </div>
                {s.criticalCount > 0 && (
                  <span className="text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
                    {s.criticalCount} Needs Attention
                  </span>
                )}
              </div>

              {/* Resource savings metrics */}
              <div className="grid grid-cols-2 gap-2 my-3">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div className="flex items-center space-x-1 text-[11px] font-medium text-slate-500 mb-1">
                    <Cpu className="w-3.5 h-3.5 text-blue-500" />
                    <span>CPU Potential</span>
                  </div>
                  <div className="text-sm font-bold text-emerald-600">
                    {s.cpuSave > 0 ? `−${formatCpu(s.cpuSave)}` : '0m'}
                  </div>
                  {s.cpuNeed > 0 && (
                    <div className="text-[10px] text-rose-500 mt-0.5">
                      +{formatCpu(s.cpuNeed)} needed
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div className="flex items-center space-x-1 text-[11px] font-medium text-slate-500 mb-1">
                    <HardDrive className="w-3.5 h-3.5 text-indigo-500" />
                    <span>RAM Potential</span>
                  </div>
                  <div className="text-sm font-bold text-emerald-600">
                    {s.memSave > 0 ? `−${formatMem(s.memSave)}` : '0Mi'}
                  </div>
                  {s.memNeed > 0 && (
                    <div className="text-[10px] text-rose-500 mt-0.5">
                      +{formatMem(s.memNeed)} needed
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => onSelectNamespace(s.ns)}
              className="mt-2 w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 transition"
            >
              <span>Inspect {s.ns} Workloads</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
