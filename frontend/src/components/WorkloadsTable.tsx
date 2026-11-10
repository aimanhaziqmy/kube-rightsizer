import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  Check, 
  Download, 
  ArrowUpDown, 
  Layers, 
  AlertTriangle, 
  Info, 
  Sparkles,
  Zap,
  RotateCcw
} from 'lucide-react';
import { WorkloadRow, StatusFilter, SortKey, SortDirection } from '../types';
import { formatCpu, formatMem, formatDelta, getStatusBadgeStyle } from '../utils/formatters';
import { calculateDelta, generateResourceYaml } from '../utils/krrCalculations';
import { exportToCsv, exportToJson } from '../utils/exportUtils';

interface WorkloadsTableProps {
  rows: WorkloadRow[];
  globalSearch: string;
  selectedNamespace?: string;
  selectedSeverity?: string;
  onClearFilters?: () => void;
}

export const WorkloadsTable: React.FC<WorkloadsTableProps> = ({
  rows,
  globalSearch,
  selectedNamespace = 'ALL',
  selectedSeverity = 'ALL',
  onClearFilters,
}) => {
  // Local filter states
  const [tableSearch, setTableSearch] = useState('');
  const [filterNs, setFilterNs] = useState<string>(selectedNamespace);
  const [filterKind, setFilterKind] = useState<string>('ALL');
  const [filterSeverity, setFilterSeverity] = useState<string>(selectedSeverity);
  const [onlySavings, setOnlySavings] = useState(false);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('dcpu');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Copied row state for feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Keep filterNs / filterSeverity in sync when props change
  React.useEffect(() => {
    if (selectedNamespace) setFilterNs(selectedNamespace);
  }, [selectedNamespace]);

  React.useEffect(() => {
    if (selectedSeverity) setFilterSeverity(selectedSeverity);
  }, [selectedSeverity]);

  // Unique namespaces & kinds for dropdowns
  const availableNamespaces = useMemo(() => {
    const set = new Set(rows.map((r) => r.ns));
    return Array.from(set).sort();
  }, [rows]);

  const availableKinds = useMemo(() => {
    const set = new Set(rows.map((r) => r.kind));
    return Array.from(set).sort();
  }, [rows]);

  const getRowKey = (r: WorkloadRow) => `${r.ns}/${r.kind}/${r.name}/${r.container}`;

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCopyYaml = (row: WorkloadRow, key: string) => {
    const yaml = generateResourceYaml(row);
    navigator.clipboard.writeText(yaml).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  // Filtered and sorted data
  const filteredRows = useMemo(() => {
    const query = (tableSearch || globalSearch).toLowerCase().trim();

    return rows.filter((r) => {
      // Global and table search
      if (query) {
        const matchesName = r.name.toLowerCase().includes(query);
        const matchesContainer = r.container.toLowerCase().includes(query);
        const matchesNs = r.ns.toLowerCase().includes(query);
        const matchesKind = r.kind.toLowerCase().includes(query);
        if (!matchesName && !matchesContainer && !matchesNs && !matchesKind) {
          return false;
        }
      }

      // Namespace filter
      if (filterNs !== 'ALL' && r.ns !== filterNs) return false;

      // Kind filter
      if (filterKind !== 'ALL' && r.kind !== filterKind) return false;

      // Severity filter
      if (filterSeverity !== 'ALL') {
        const norm = (r.severity || 'UNKNOWN').toUpperCase();
        if (filterSeverity === 'CRITICAL' && norm !== 'CRITICAL') return false;
        if (filterSeverity === 'WARNING' && norm !== 'WARNING') return false;
        if (filterSeverity === 'OK' && norm !== 'OK' && norm !== 'GOOD') return false;
        if (filterSeverity === 'UNKNOWN' && norm !== 'UNKNOWN') return false;
      }

      // Savings only toggle
      if (onlySavings) {
        const dCpu = calculateDelta(r, 'req_cpu');
        const dMem = calculateDelta(r, 'req_mem');
        const hasSavings = (dCpu !== null && dCpu > 0) || (dMem !== null && dMem > 0);
        if (!hasSavings) return false;
      }

      return true;
    });
  }, [rows, tableSearch, globalSearch, filterNs, filterKind, filterSeverity, onlySavings]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortKey) {
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case 'ns':
          valA = a.ns.toLowerCase();
          valB = b.ns.toLowerCase();
          break;
        case 'kind':
          valA = a.kind.toLowerCase();
          valB = b.kind.toLowerCase();
          break;
        case 'container':
          valA = a.container.toLowerCase();
          valB = b.container.toLowerCase();
          break;
        case 'pods':
          valA = a.pods || 1;
          valB = b.pods || 1;
          break;
        case 'dcpu':
          valA = calculateDelta(a, 'req_cpu') ?? -999999;
          valB = calculateDelta(b, 'req_cpu') ?? -999999;
          break;
        case 'dmem':
          valA = calculateDelta(a, 'req_mem') ?? -999999;
          valB = calculateDelta(b, 'req_mem') ?? -999999;
          break;
        case 'severity':
          const order: Record<string, number> = { CRITICAL: 4, WARNING: 3, OK: 2, GOOD: 2, UNKNOWN: 1 };
          valA = order[a.severity?.toUpperCase()] || 0;
          valB = order[b.severity?.toUpperCase()] || 0;
          break;
        default:
          valA = 0;
          valB = 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredRows, sortKey, sortDirection]);

  // Paginated rows
  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  return (
    <div className="soft-card flex flex-col mb-8 overflow-hidden">
      {/* Control Bar: Search & Filters */}
      <div className="p-4 border-b border-slate-200 bg-white space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Table Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => {
                setTableSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Filter workloads, namespaces..."
              className="w-full text-xs pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>

          {/* Export and Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => exportToCsv(sortedRows)}
              disabled={sortedRows.length === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition disabled:opacity-50"
              title="Export filtered workloads as CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV</span>
            </button>
            <button
              onClick={() => exportToJson(sortedRows)}
              disabled={sortedRows.length === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition disabled:opacity-50"
              title="Export filtered workloads as JSON"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {/* Filter Badges & Selectors */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-600">
          {/* Namespace Filter */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <span className="text-[11px] font-medium text-slate-400">Namespace:</span>
            <select
              value={filterNs}
              onChange={(e) => {
                setFilterNs(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Namespaces ({availableNamespaces.length})</option>
              {availableNamespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          </div>

          {/* Kind Filter */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <span className="text-[11px] font-medium text-slate-400">Kind:</span>
            <select
              value={filterKind}
              onChange={(e) => {
                setFilterKind(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Kinds</option>
              {availableKinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          {/* Severity Pills */}
          <div className="flex items-center space-x-1 bg-slate-100/70 p-0.5 rounded-lg border border-slate-200/60">
            {(['ALL', 'CRITICAL', 'WARNING', 'OK'] as const).map((sev) => {
              const active = filterSeverity === sev;
              const labels: Record<string, string> = {
                ALL: 'All Statuses',
                CRITICAL: 'Critical',
                WARNING: 'Warning',
                OK: 'Optimal',
              };
              return (
                <button
                  key={sev}
                  onClick={() => {
                    setFilterSeverity(sev);
                    setCurrentPage(1);
                  }}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60 font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {labels[sev]}
                </button>
              );
            })}
          </div>

          {/* Only Savings Toggle */}
          <label className="flex items-center space-x-1.5 cursor-pointer ml-auto select-none">
            <input
              type="checkbox"
              checked={onlySavings}
              onChange={(e) => {
                setOnlySavings(e.target.checked);
                setCurrentPage(1);
              }}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
            />
            <span className="text-xs text-slate-600 font-medium">Show only savings</span>
          </label>

          {(filterNs !== 'ALL' || filterKind !== 'ALL' || filterSeverity !== 'ALL' || onlySavings || tableSearch) && (
            <button
              onClick={() => {
                setTableSearch('');
                setFilterNs('ALL');
                setFilterKind('ALL');
                setFilterSeverity('ALL');
                setOnlySavings(false);
                if (onClearFilters) onClearFilters();
              }}
              className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center space-x-1 ml-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse soft-table">
          <thead>
            <tr>
              <th className="w-8"></th>
              <th onClick={() => handleSort('name')} className="cursor-pointer hover:text-slate-900">
                <div className="flex items-center space-x-1">
                  <span>Workload & Container</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('ns')} className="cursor-pointer hover:text-slate-900">
                <div className="flex items-center space-x-1">
                  <span>Namespace</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('pods')} className="cursor-pointer hover:text-slate-900 text-center">
                <div className="flex items-center justify-center space-x-1">
                  <span>Pods</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('dcpu')} className="cursor-pointer hover:text-slate-900">
                <div className="flex items-center space-x-1">
                  <span>CPU (Cur → Rec)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('dmem')} className="cursor-pointer hover:text-slate-900">
                <div className="flex items-center space-x-1">
                  <span>Memory (Cur → Rec)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th onClick={() => handleSort('severity')} className="cursor-pointer hover:text-slate-900">
                <div className="flex items-center space-x-1">
                  <span>Status</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="w-20 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Info className="w-6 h-6 text-slate-400" />
                    <p className="text-sm font-medium text-slate-600">No matching workloads found</p>
                    <p className="text-xs text-slate-400">Try adjusting your filters or search terms.</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedRows.map((r) => {
                const key = getRowKey(r);
                const isExpanded = expandedRows.has(key);
                const dCpu = calculateDelta(r, 'req_cpu');
                const dMem = calculateDelta(r, 'req_mem');
                const badge = getStatusBadgeStyle(r.severity || 'UNKNOWN');
                const cpuDeltaFmt = formatDelta(dCpu, formatCpu);
                const memDeltaFmt = formatDelta(dMem, formatMem);

                return (
                  <React.Fragment key={key}>
                    <tr className={isExpanded ? 'expanded-parent' : ''}>
                      {/* Expand Toggle */}
                      <td className="text-center pl-3 pr-1">
                        <button
                          onClick={() => toggleRow(key)}
                          className="p-1 text-slate-400 hover:text-slate-700 transition"
                          title={isExpanded ? 'Collapse row' : 'Expand row details'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-blue-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Workload & Container Name */}
                      <td>
                        <div className="flex flex-col min-w-[160px]">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-slate-800 text-xs truncate max-w-[220px]">
                              {r.name}
                            </span>
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {r.kind}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-[220px]">
                            {r.container}
                          </span>
                        </div>
                      </td>

                      {/* Namespace */}
                      <td>
                        <span className="inline-block text-xs font-medium text-slate-700 bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200/60">
                          {r.ns}
                        </span>
                      </td>

                      {/* Pods & HPA */}
                      <td className="text-center">
                        <div className="flex flex-col items-center">
                          <span className="font-semibold text-xs text-slate-700">{r.pods}</span>
                          {r.hpa && (
                            <span className="text-[9px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 rounded mt-0.5" title="Horizontal Pod Autoscaler enabled">
                              HPA
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CPU */}
                      <td>
                        <div className="flex items-center space-x-2 text-xs">
                          <div className="flex flex-col">
                            <span className="text-slate-500 text-[11px]">
                              {formatCpu(r.cur.req_cpu)} → <strong className="text-slate-800 font-semibold">{formatCpu(r.rec.req_cpu)}</strong>
                            </span>
                          </div>
                          {cpuDeltaFmt.type !== 'unset' && (
                            <span
                              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                                cpuDeltaFmt.type === 'save'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                  : cpuDeltaFmt.type === 'need'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {cpuDeltaFmt.text}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Memory */}
                      <td>
                        <div className="flex items-center space-x-2 text-xs">
                          <div className="flex flex-col">
                            <span className="text-slate-500 text-[11px]">
                              {formatMem(r.cur.req_mem)} → <strong className="text-slate-800 font-semibold">{formatMem(r.rec.req_mem)}</strong>
                            </span>
                          </div>
                          {memDeltaFmt.type !== 'unset' && (
                            <span
                              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                                memDeltaFmt.type === 'save'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                  : memDeltaFmt.type === 'need'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {memDeltaFmt.text}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status / Severity */}
                      <td>
                        <span
                          className={`inline-flex items-center space-x-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${badge.bg}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="text-right pr-4">
                        <button
                          onClick={() => handleCopyYaml(r, key)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-md transition"
                          title="Copy recommended resources YAML"
                        >
                          {copiedKey === key ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Details Row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={8} className="p-4 border-b border-slate-200">
                          <div className="space-y-4">
                            {/* Comparison Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* CPU Allocation Detail */}
                              <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                    CPU Allocations (Cores)
                                  </span>
                                  <span className="text-[11px] text-slate-400">Total Pods: {r.pods}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <div className="text-[10px] text-slate-400 font-medium">Current Req</div>
                                    <div className="font-semibold text-slate-700">{formatCpu(r.cur.req_cpu)}</div>
                                    <div className="text-[10px] text-slate-400 mt-1">Limit: {formatCpu(r.cur.lim_cpu)}</div>
                                  </div>
                                  <div className="bg-blue-50/50 p-2 rounded border border-blue-100">
                                    <div className="text-[10px] text-blue-600 font-medium">Recommended Req</div>
                                    <div className="font-semibold text-blue-900">{formatCpu(r.rec.req_cpu)}</div>
                                    <div className="text-[10px] text-blue-500 mt-1">Limit: {formatCpu(r.rec.lim_cpu)}</div>
                                  </div>
                                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <div className="text-[10px] text-slate-400 font-medium">Total Cores Delta</div>
                                    <div
                                      className={`font-semibold ${
                                        dCpu && dCpu > 0
                                          ? 'text-emerald-600'
                                          : dCpu && dCpu < 0
                                          ? 'text-rose-600'
                                          : 'text-slate-600'
                                      }`}
                                    >
                                      {cpuDeltaFmt.text}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-1">
                                      {dCpu && dCpu > 0 ? 'Savings' : dCpu && dCpu < 0 ? 'Deficit' : 'Balanced'}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Memory Allocation Detail */}
                              <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                    Memory Allocations (RAM)
                                  </span>
                                  <span className="text-[11px] text-slate-400">Total Pods: {r.pods}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <div className="text-[10px] text-slate-400 font-medium">Current Req</div>
                                    <div className="font-semibold text-slate-700">{formatMem(r.cur.req_mem)}</div>
                                    <div className="text-[10px] text-slate-400 mt-1">Limit: {formatMem(r.cur.lim_mem)}</div>
                                  </div>
                                  <div className="bg-indigo-50/50 p-2 rounded border border-indigo-100">
                                    <div className="text-[10px] text-indigo-600 font-medium">Recommended Req</div>
                                    <div className="font-semibold text-indigo-900">{formatMem(r.rec.req_mem)}</div>
                                    <div className="text-[10px] text-indigo-500 mt-1">Limit: {formatMem(r.rec.lim_mem)}</div>
                                  </div>
                                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                    <div className="text-[10px] text-slate-400 font-medium">Total RAM Delta</div>
                                    <div
                                      className={`font-semibold ${
                                        dMem && dMem > 0
                                          ? 'text-emerald-600'
                                          : dMem && dMem < 0
                                          ? 'text-rose-600'
                                          : 'text-slate-600'
                                      }`}
                                    >
                                      {memDeltaFmt.text}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-1">
                                      {dMem && dMem > 0 ? 'Savings' : dMem && dMem < 0 ? 'Deficit' : 'Balanced'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Info Notes & Warnings */}
                            <div className="flex flex-wrap items-center gap-2">
                              {r.info && Object.keys(r.info).length > 0 && (
                                Object.entries(r.info).map(([k, v]) => (
                                  <div
                                    key={k}
                                    className="inline-flex items-center space-x-1.5 text-xs bg-white border border-slate-200 px-2.5 py-1 rounded-md text-slate-600"
                                  >
                                    <Info className="w-3.5 h-3.5 text-blue-500" />
                                    <span>
                                      <strong className="text-slate-700 capitalize">{k}:</strong> {String(v)}
                                    </span>
                                  </div>
                                ))
                              )}

                              {r.warnings && r.warnings.length > 0 && (
                                r.warnings.map((w, idx) => (
                                  <div
                                    key={idx}
                                    className="inline-flex items-center space-x-1.5 text-xs bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md text-amber-800"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                    <span>{w}</span>
                                  </div>
                                ))
                              )}

                              {r.hpa && (
                                <div className="inline-flex items-center space-x-1.5 text-xs bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md text-indigo-700">
                                  <Zap className="w-3.5 h-3.5" />
                                  <span>HPA active: Recommended to only adjust memory or ensure CPU targets match percentile.</span>
                                </div>
                              )}
                            </div>

                            {/* YAML Code Snippet */}
                            <div className="relative">
                              <div className="flex items-center justify-between bg-slate-800 text-slate-300 px-3 py-1.5 rounded-t-lg text-xs font-mono">
                                <span>Kubernetes YAML Snippet</span>
                                <button
                                  onClick={() => handleCopyYaml(r, key)}
                                  className="flex items-center space-x-1 text-slate-300 hover:text-white transition"
                                >
                                  {copiedKey === key ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copy YAML</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <pre className="p-3 bg-slate-900 text-slate-100 rounded-b-lg text-xs font-mono overflow-x-auto">
                                {generateResourceYaml(r)}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="p-3 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
        <div>
          Showing{' '}
          <strong className="text-slate-700 font-semibold">
            {sortedRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
          </strong>{' '}
          to{' '}
          <strong className="text-slate-700 font-semibold">
            {Math.min(currentPage * pageSize, sortedRows.length)}
          </strong>{' '}
          of <strong className="text-slate-700 font-semibold">{sortedRows.length}</strong> workloads
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage <= 1}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 transition"
            >
              Previous
            </button>
            <span className="px-2 font-medium text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 transition"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
