import React from 'react';
import { 
  Cpu, 
  HardDrive, 
  Layers, 
  ShieldCheck, 
  ArrowDownRight,
  ArrowUpRight,
  Server
} from 'lucide-react';
import { WorkloadRow } from '../types';
import { computeTotals } from '../utils/krrCalculations';
import { formatCpu, formatMem } from '../utils/formatters';

interface OverviewCardsProps {
  rows: WorkloadRow[];
  score?: number | null;
  onFilterSeverity?: (severity: string) => void;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({ rows, score }) => {
  const totals = computeTotals(rows);

  // Derive an efficiency score if not provided directly
  const calculatedScore = score ?? (
    totals.containerCount > 0 
      ? Math.round((totals.optimalCount / totals.containerCount) * 100)
      : 100
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Card 1: Cluster Health / Rightsizing Score */}
      <div className="soft-card p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Rightsizing Score
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center space-x-1 ${
              calculatedScore >= 80
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                : calculatedScore >= 50
                ? 'bg-amber-50 text-amber-800 border border-amber-200/80'
                : 'bg-rose-50 text-rose-700 border border-rose-200/80'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{calculatedScore >= 80 ? 'Optimal' : calculatedScore >= 50 ? 'Moderate' : 'Action Needed'}</span>
          </span>
        </div>

        <div className="my-1 flex items-baseline space-x-2">
          <span className="text-3xl font-bold tracking-tight text-slate-800">
            {calculatedScore}
          </span>
          <span className="text-xs font-medium text-slate-400">/ 100</span>
        </div>

        {/* Score progress bar */}
        <div className="w-full bg-slate-100 rounded-full h-2 my-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              calculatedScore >= 80 ? 'bg-emerald-500' : calculatedScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'
            }`}
            style={{ width: `${Math.min(Math.max(calculatedScore, 5), 100)}%` }}
          />
        </div>

        <div className="text-[11px] text-slate-500 flex items-center justify-between">
          <span>{totals.optimalCount} of {totals.containerCount} optimal</span>
          <span className="font-semibold text-slate-700">
            {totals.containerCount > 0 ? Math.round((totals.optimalCount / totals.containerCount) * 100) : 100}%
          </span>
        </div>
      </div>

      {/* Card 2: Potential CPU Savings */}
      <div className="soft-card p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total CPU Savings
          </span>
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Cpu className="w-4 h-4" />
          </div>
        </div>

        <div className="my-1 flex items-baseline space-x-2">
          <span className="text-2xl font-bold tracking-tight text-emerald-600">
            {totals.cpuSave > 0 ? `−${formatCpu(totals.cpuSave)}` : '0m'}
          </span>
          <span className="text-xs font-medium text-slate-400">recoverable</span>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-[11px]">
          <div className="flex justify-between items-center text-slate-500">
            <span className="flex items-center space-x-1">
              <ArrowDownRight className="w-3 h-3 text-emerald-500" />
              <span>Overprovisioned:</span>
            </span>
            <span className="font-semibold text-emerald-600">−{formatCpu(totals.cpuSave)}</span>
          </div>
          <div className="flex justify-between items-center text-slate-500">
            <span className="flex items-center space-x-1">
              <ArrowUpRight className="w-3 h-3 text-rose-500" />
              <span>Underprovisioned:</span>
            </span>
            <span className="font-semibold text-rose-600">+{formatCpu(totals.cpuNeed)}</span>
          </div>
        </div>
      </div>

      {/* Card 3: Potential Memory Savings */}
      <div className="soft-card p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total RAM Savings
          </span>
          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <HardDrive className="w-4 h-4" />
          </div>
        </div>

        <div className="my-1 flex items-baseline space-x-2">
          <span className="text-2xl font-bold tracking-tight text-emerald-600">
            {totals.memSave > 0 ? `−${formatMem(totals.memSave)}` : '0Mi'}
          </span>
          <span className="text-xs font-medium text-slate-400">recoverable</span>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-[11px]">
          <div className="flex justify-between items-center text-slate-500">
            <span className="flex items-center space-x-1">
              <ArrowDownRight className="w-3 h-3 text-emerald-500" />
              <span>Overprovisioned:</span>
            </span>
            <span className="font-semibold text-emerald-600">−{formatMem(totals.memSave)}</span>
          </div>
          <div className="flex justify-between items-center text-slate-500">
            <span className="flex items-center space-x-1">
              <ArrowUpRight className="w-3 h-3 text-rose-500" />
              <span>Underprovisioned:</span>
            </span>
            <span className="font-semibold text-rose-600">+{formatMem(totals.memNeed)}</span>
          </div>
        </div>
      </div>

      {/* Card 4: Total Pods / Containers Analyzed */}
      <div className="soft-card p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Pods & Containers
          </span>
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        <div className="my-1 flex items-baseline space-x-2">
          <span className="text-2xl font-bold tracking-tight text-slate-800">
            {totals.workloadCount}
          </span>
          <span className="text-xs font-medium text-slate-400">workloads</span>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-[11px]">
          <div className="flex justify-between items-center text-slate-500">
            <span className="flex items-center space-x-1">
              <Server className="w-3 h-3 text-slate-400" />
              <span>Containers:</span>
            </span>
            <span className="font-semibold text-slate-700">{totals.containerCount}</span>
          </div>
          <div className="flex justify-between items-center text-slate-500">
            <span>Pods / Namespaces:</span>
            <span className="font-semibold text-slate-700" title={`${totals.namespaceCount} namespaces with analyzed workloads`}>
              {totals.podCount} pods · {totals.namespaceCount} ns with workloads
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
