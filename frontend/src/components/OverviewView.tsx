import React, { useMemo } from 'react';
import { 
  CheckCircle2, 
  TrendingDown, 
  AlertCircle, 
  AlertTriangle, 
  ArrowRight, 
  Sparkles, 
  FolderTree, 
  Layers, 
  Cpu, 
  HardDrive,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { WorkloadRow } from '../types';
import { OverviewCards } from './OverviewCards';
import { 
  computeStatusDistribution, 
  getTopSavingsOpportunities, 
  computeNamespaceDistribution,
  categorizeWorkload
} from '../utils/krrCalculations';
import { formatCpu, formatMem, getStatusBadgeStyle, getCategoryBadgeStyle } from '../utils/formatters';

interface OverviewViewProps {
  rows: WorkloadRow[];
  score?: number | null;
  namespaces: string[];
  isScanning?: boolean;
  scanElapsed?: number;
  onNavigateToWorkloads: (filters?: {
    namespace?: string;
    search?: string;
    severity?: string;
    category?: string;
    savingsOnly?: boolean;
  }) => void;
  onNavigateToNamespaces: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  rows,
  score,
  namespaces,
  isScanning,
  scanElapsed = 0,
  onNavigateToWorkloads,
  onNavigateToNamespaces,
}) => {
  const dist = computeStatusDistribution(rows);
  const total = dist.total || 1;
  const optimalPct = Math.round((dist.optimal / total) * 100);
  const overPct = Math.round((dist.overprovisioned / total) * 100);
  const underPct = Math.round((dist.underprovisioned / total) * 100);
  const attentionPct = Math.max(0, 100 - optimalPct - overPct - underPct);

  const topOpportunities = getTopSavingsOpportunities(rows, 5);
  const nsDistribution = computeNamespaceDistribution(rows).slice(0, 5);
  const workloadNsCount = useMemo(() => new Set(rows.map((r) => r.ns)).size, [rows]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Top Executive KPI Stat Cards */}
      <OverviewCards rows={rows} score={score} />

      {/* 2. Visual Breakdown of Status Distribution */}
      <div className="soft-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
              <span>Cluster Status Distribution</span>
              <span className="text-xs font-normal text-slate-400">({dist.total} total containers)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Workload resource health classification based on historical Prometheus utilization metrics
            </p>
          </div>
          <div className="text-[11px] text-slate-400">
            Click any category to filter workloads
          </div>
        </div>

        {/* Stacked Segmented Progress Bar */}
        <div className="w-full h-3.5 rounded-full bg-slate-100 flex overflow-hidden shadow-inner my-4">
          {dist.optimal > 0 && (
            <div
              style={{ width: `${(dist.optimal / total) * 100}%` }}
              className="bg-emerald-500 hover:bg-emerald-600 transition-all cursor-pointer"
              title={`Optimal: ${dist.optimal} (${optimalPct}%)`}
              onClick={() => onNavigateToWorkloads({ category: 'optimal' })}
            />
          )}
          {dist.overprovisioned > 0 && (
            <div
              style={{ width: `${(dist.overprovisioned / total) * 100}%` }}
              className="bg-amber-400 hover:bg-amber-500 transition-all cursor-pointer"
              title={`Overprovisioned: ${dist.overprovisioned} (${overPct}%)`}
              onClick={() => onNavigateToWorkloads({ category: 'overprovisioned' })}
            />
          )}
          {dist.underprovisioned > 0 && (
            <div
              style={{ width: `${(dist.underprovisioned / total) * 100}%` }}
              className="bg-rose-500 hover:bg-rose-600 transition-all cursor-pointer"
              title={`Underprovisioned: ${dist.underprovisioned} (${underPct}%)`}
              onClick={() => onNavigateToWorkloads({ category: 'underprovisioned' })}
            />
          )}
          {dist.attention > 0 && (
            <div
              style={{ width: `${(dist.attention / total) * 100}%` }}
              className="bg-indigo-500 hover:bg-indigo-600 transition-all cursor-pointer"
              title={`Needs Attention: ${dist.attention} (${attentionPct}%)`}
              onClick={() => onNavigateToWorkloads({ category: 'attention' })}
            />
          )}
        </div>

        {/* 4 Interactive Category Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
          {/* Card: Optimal */}
          <button
            onClick={() => onNavigateToWorkloads({ category: 'optimal' })}
            className="flex flex-col text-left p-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-300 transition group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Optimal</span>
              </span>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                {optimalPct}%
              </span>
            </div>
            <div className="text-2xl font-bold text-emerald-900 mb-1">
              {dist.optimal}
            </div>
            <p className="text-[11px] text-emerald-700/90 leading-tight">
              Properly sized within safe headroom. No adjustments required.
            </p>
            <div className="mt-2 text-[10px] font-semibold text-emerald-700 flex items-center space-x-1 group-hover:translate-x-0.5 transition-transform">
              <span>Explore optimal workloads</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </button>

          {/* Card: Overprovisioned */}
          <button
            onClick={() => onNavigateToWorkloads({ category: 'overprovisioned' })}
            className="flex flex-col text-left p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/40 hover:bg-amber-50 hover:border-amber-300 transition group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center space-x-1.5 text-xs font-semibold text-amber-800">
                <TrendingDown className="w-4 h-4 text-amber-600" />
                <span>Overprovisioned</span>
              </span>
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full">
                {overPct}%
              </span>
            </div>
            <div className="text-2xl font-bold text-amber-900 mb-1">
              {dist.overprovisioned}
            </div>
            <p className="text-[11px] text-amber-750/90 leading-tight text-amber-800">
              Allocated resources exceed historical peak. Potential FinOps savings.
            </p>
            <div className="mt-2 text-[10px] font-semibold text-amber-800 flex items-center space-x-1 group-hover:translate-x-0.5 transition-transform">
              <span>View savings opportunities</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </button>

          {/* Card: Underprovisioned */}
          <button
            onClick={() => onNavigateToWorkloads({ category: 'underprovisioned' })}
            className="flex flex-col text-left p-3.5 rounded-xl border border-rose-200/80 bg-rose-50/40 hover:bg-rose-50 hover:border-rose-300 transition group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center space-x-1.5 text-xs font-semibold text-rose-800">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Underprovisioned</span>
              </span>
              <span className="text-[11px] font-bold text-rose-800 bg-rose-100/80 px-2 py-0.5 rounded-full">
                {underPct}%
              </span>
            </div>
            <div className="text-2xl font-bold text-rose-900 mb-1">
              {dist.underprovisioned}
            </div>
            <p className="text-[11px] text-rose-700/90 leading-tight">
              Requests below usage. At risk of CPU throttling or OOMKills.
            </p>
            <div className="mt-2 text-[10px] font-semibold text-rose-700 flex items-center space-x-1 group-hover:translate-x-0.5 transition-transform">
              <span>Review resource shortages</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </button>

          {/* Card: Needs Attention */}
          <button
            onClick={() => onNavigateToWorkloads({ category: 'attention' })}
            className="flex flex-col text-left p-3.5 rounded-xl border border-indigo-200/80 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-300 transition group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center space-x-1.5 text-xs font-semibold text-indigo-800">
                <AlertCircle className="w-4 h-4 text-indigo-600" />
                <span>Needs Attention</span>
              </span>
              <span className="text-[11px] font-bold text-indigo-800 bg-indigo-100/80 px-2 py-0.5 rounded-full">
                {attentionPct}%
              </span>
            </div>
            <div className="text-2xl font-bold text-indigo-900 mb-1">
              {dist.attention}
            </div>
            <p className="text-[11px] text-indigo-700/90 leading-tight">
              Unset requests or missing Prometheus metrics history.
            </p>
            <div className="mt-2 text-[10px] font-semibold text-indigo-700 flex items-center space-x-1 group-hover:translate-x-0.5 transition-transform">
              <span>Filter critical workloads</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </button>
        </div>
      </div>

      {/* 3. Executive Deep Dives: Top 5 Savings Opportunities & Quick Namespace Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Top 5 Savings Opportunities */}
        <div className="soft-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Top 5 Savings Opportunities
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Workloads with highest wasted resource requests
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigateToWorkloads({ savingsOnly: true })}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1 transition"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {topOpportunities.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No significant savings opportunities detected. All workloads are optimal.
                </div>
              ) : (
                topOpportunities.map((opp, idx) => {
                  const badgeStyle = getCategoryBadgeStyle(opp.category);
                  return (
                    <div
                      key={`${opp.row.ns}-${opp.row.kind}-${opp.row.name}-${opp.row.container}`}
                      className="p-3 rounded-lg border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                            #{idx + 1}
                          </span>
                          <span className="font-semibold text-xs text-slate-800 truncate" title={opp.row.name}>
                            {opp.row.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {opp.row.kind}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200/60">
                            {opp.row.ns}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500 mt-1 flex items-center space-x-3">
                          <span>Container: <strong className="text-slate-700">{opp.row.container}</strong></span>
                          <span>Pods: <strong className="text-slate-700">{opp.row.pods || 1}</strong></span>
                        </div>

                        {/* Resource Diffs */}
                        <div className="mt-2 flex items-center space-x-3 text-[11px]">
                          {opp.cpuSave > 0 && (
                            <div className="flex items-center space-x-1">
                              <Cpu className="w-3 h-3 text-slate-400" />
                              <span className="text-slate-500">CPU:</span>
                              <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                −{formatCpu(opp.cpuSave)}
                              </span>
                              <span className="text-slate-400 text-[10px]">
                                ({formatCpu(opp.row.cur.req_cpu)} → {formatCpu(opp.row.rec.req_cpu)})
                              </span>
                            </div>
                          )}

                          {opp.memSave > 0 && (
                            <div className="flex items-center space-x-1">
                              <HardDrive className="w-3 h-3 text-slate-400" />
                              <span className="text-slate-500">RAM:</span>
                              <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                −{formatMem(opp.memSave)}
                              </span>
                              <span className="text-slate-400 text-[10px]">
                                ({formatMem(opp.row.cur.req_mem)} → {formatMem(opp.row.rec.req_mem)})
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${badgeStyle.bg}`}>
                          {badgeStyle.label}
                        </span>
                        <button
                          onClick={() => onNavigateToWorkloads({ namespace: opp.row.ns, search: opp.row.name })}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition shadow-2xs"
                        >
                          <span>Explore</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Quick Namespace Distribution */}
        <div className="soft-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FolderTree className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Namespace Distribution
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Highest resource waste breakdown by namespace
                  </p>
                </div>
              </div>
              <button
                onClick={onNavigateToNamespaces}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1 transition"
              >
                <span>View All ({namespaces.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {nsDistribution.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No namespace data available
                </div>
              ) : (
                nsDistribution.map((item) => (
                  <div
                    key={item.namespace}
                    className="p-3 rounded-lg border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-xs text-slate-800">
                          {item.namespace}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ({item.containersCount} containers · {item.workloadsCount} workloads)
                        </span>
                      </div>

                      {/* Mini health bar & savings */}
                      <div className="mt-2 flex items-center space-x-4 text-[11px]">
                        <div className="flex items-center space-x-1">
                          <span className="text-slate-400">CPU Savings:</span>
                          <span className="font-semibold text-emerald-600">
                            {item.cpuSave > 0 ? `−${formatCpu(item.cpuSave)}` : '0m'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="text-slate-400">RAM Savings:</span>
                          <span className="font-semibold text-emerald-600">
                            {item.memSave > 0 ? `−${formatMem(item.memSave)}` : '0Mi'}
                          </span>
                        </div>
                        <div className="hidden sm:flex items-center space-x-1 text-slate-400">
                          <span>Health:</span>
                          <span className="font-semibold text-slate-700">{item.optimalPercent}%</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onNavigateToWorkloads({ namespace: item.namespace })}
                      className="px-2.5 py-1 rounded bg-white hover:bg-blue-50 border border-slate-200 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition shadow-2xs flex-shrink-0"
                    >
                      Filter
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Analyzed across {workloadNsCount} active namespaces ({namespaces.length} total in cluster)
            </span>
            <button
              onClick={onNavigateToNamespaces}
              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1"
            >
              <span>Explore All Namespaces</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

