import React, { useMemo, useState } from 'react';
import { FolderTree, Cpu, HardDrive, ArrowRight, Layers, Info, Search, CheckCircle2, ShieldAlert } from 'lucide-react';
import { WorkloadRow } from '../types';
import { formatCpu, formatMem } from '../utils/formatters';
import { calculateDelta } from '../utils/krrCalculations';

interface NamespacesViewProps {
  rows: WorkloadRow[];
  clusterNamespaces?: string[];
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
  hasWorkloads: boolean;
}

type NamespaceFilterTab = 'all' | 'with-workloads' | 'empty';

export const NamespacesView: React.FC<NamespacesViewProps> = ({
  rows,
  clusterNamespaces = [],
  onSelectNamespace,
}) => {
  const [filterTab, setFilterTab] = useState<NamespaceFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const allSummaries = useMemo(() => {
    const map = new Map<string, NamespaceSummary>();

    // 1. Seed discovered cluster namespaces from Kubernetes core API
    if (clusterNamespaces && clusterNamespaces.length > 0) {
      for (const ns of clusterNamespaces) {
        map.set(ns, {
          ns,
          workloadCount: 0,
          podCount: 0,
          cpuSave: 0,
          cpuNeed: 0,
          memSave: 0,
          memNeed: 0,
          criticalCount: 0,
          hasWorkloads: false,
        });
      }
    }

    // 2. Aggregate scanned workloads from KRR
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
          hasWorkloads: false,
        });
      }
      const s = map.get(r.ns)!;
      s.workloadCount += 1;
      s.podCount += r.pods || 1;
      s.hasWorkloads = true;

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

    // Sort: namespaces with workloads first (by highest potential CPU savings), then alphabetical
    return Array.from(map.values()).sort((a, b) => {
      if (a.hasWorkloads && !b.hasWorkloads) return -1;
      if (!a.hasWorkloads && b.hasWorkloads) return 1;
      if (a.hasWorkloads && b.hasWorkloads) {
        if (b.cpuSave !== a.cpuSave) return b.cpuSave - a.cpuSave;
        return b.workloadCount - a.workloadCount;
      }
      return a.ns.localeCompare(b.ns);
    });
  }, [rows, clusterNamespaces]);

  const withWorkloadsCount = useMemo(
    () => allSummaries.filter((s) => s.hasWorkloads).length,
    [allSummaries]
  );
  const emptyCount = allSummaries.length - withWorkloadsCount;

  // Filtered summaries based on tab and search
  const displayedSummaries = useMemo(() => {
    return allSummaries.filter((s) => {
      if (filterTab === 'with-workloads' && !s.hasWorkloads) return false;
      if (filterTab === 'empty' && s.hasWorkloads) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return s.ns.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allSummaries, filterTab, searchQuery]);

  return (
    <div className="space-y-4 mb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Cluster Namespaces Breakdown</h2>
          <p className="text-xs text-slate-500">
            Real cluster-wide namespace view ({allSummaries.length} total discovered in cluster, {withWorkloadsCount} with analyzed workloads)
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
            {withWorkloadsCount} / {allSummaries.length} Namespaces with Workloads
          </span>
        </div>
      </div>

      {/* Alignment Explanation Callout Banner */}
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3.5 flex items-start space-x-3 text-xs">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-slate-600 space-y-1">
          <div className="font-semibold text-slate-800">
            Cluster Namespace Alignment ({allSummaries.length} Discovered Namespaces)
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            The Kubernetes API detected <strong className="text-slate-700">{allSummaries.length} active namespaces</strong> in your cluster.{' '}
            <strong className="text-blue-700">{withWorkloadsCount} namespaces</strong> host active Deployments, StatefulSets, or DaemonSets analyzed by KRR.{' '}
            The other <strong className="text-slate-700">{emptyCount} namespaces</strong> are system, fleet, or unmanaged namespaces with zero monitored workloads.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
        {/* Filter Pills */}
        <div className="flex items-center space-x-1 bg-slate-100/80 p-1 rounded-lg text-xs">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1 rounded-md font-medium transition ${
              filterTab === 'all'
                ? 'bg-white text-slate-800 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Namespaces ({allSummaries.length})
          </button>
          <button
            onClick={() => setFilterTab('with-workloads')}
            className={`px-3 py-1 rounded-md font-medium transition ${
              filterTab === 'with-workloads'
                ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            With Workloads ({withWorkloadsCount})
          </button>
          <button
            onClick={() => setFilterTab('empty')}
            className={`px-3 py-1 rounded-md font-medium transition ${
              filterTab === 'empty'
                ? 'bg-white text-slate-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            No Workloads ({emptyCount})
          </button>
        </div>

        {/* Realtime Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search namespace..."
            className="w-full pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white text-slate-700 transition"
          />
        </div>
      </div>

      {/* Grid of Namespaces */}
      {displayedSummaries.length === 0 ? (
        <div className="soft-card p-12 text-center text-xs text-slate-500">
          No namespaces matching the selected filter or search term.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {displayedSummaries.map((s) => (
            <div
              key={s.ns}
              className={`soft-card p-4 hover:shadow-soft-md transition flex flex-col justify-between ${
                !s.hasWorkloads ? 'opacity-80 bg-slate-50/40 border-dashed' : ''
              }`}
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        s.hasWorkloads
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      <FolderTree className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 break-all">{s.ns}</h3>
                      <span className="text-[11px] text-slate-400">
                        {s.hasWorkloads
                          ? `${s.workloadCount} containers · ${s.podCount} total pods`
                          : '0 workloads analyzed'}
                      </span>
                    </div>
                  </div>

                  {s.hasWorkloads ? (
                    s.criticalCount > 0 ? (
                      <span className="text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full flex-shrink-0">
                        {s.criticalCount} Needs Attention
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex-shrink-0">
                        Active
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full flex-shrink-0">
                      Empty / System
                    </span>
                  )}
                </div>

                {/* Resource savings metrics */}
                {s.hasWorkloads ? (
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
                ) : (
                  <div className="my-3 p-3 bg-slate-50/80 rounded-lg border border-slate-200/60 text-[11px] text-slate-500">
                    No Deployments, StatefulSets, or DaemonSets analyzed in this namespace during the latest scan.
                  </div>
                )}
              </div>

              <button
                onClick={() => onSelectNamespace(s.ns)}
                className={`mt-2 w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-lg border text-xs font-medium transition ${
                  s.hasWorkloads
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <span>
                  {s.hasWorkloads ? `Inspect ${s.ns} Workloads` : `Filter by ${s.ns} (0)`}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
