import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  ChevronDown, 
  ChevronUp, 
  ChevronRight, 
  Copy, 
  Check, 
  Download, 
  ArrowUpDown, 
  AlertTriangle, 
  Info, 
  Zap, 
  RotateCcw, 
  X 
} from 'lucide-react';
import { WorkloadRow, StatusFilter, SortKey, SortDirection } from '../types';
import { formatCpu, formatMem, isNumeric } from '../utils/formatters';
import { calculateDelta, generateResourceYaml } from '../utils/krrCalculations';
import { exportToCsv, exportToJson } from '../utils/exportUtils';
import { buildWhyLines, hasUsageData } from '../utils/evidence';
import { DriftBadge } from './DriftBadge';
import { Sparkline } from './Sparkline';
import { UsageStrip } from './UsageStrip';
import { fetchWorkloadHistory } from '../api';
import { DiffChanges, HistoryPoint } from '../utils/scanDiff';

interface WhyScanParams {
  cpu_percentile: number;
  memory_buffer_percentage: number;
  history_days: number;
}

interface WorkloadsTableProps {
  rows: WorkloadRow[];
  clusterNamespaces?: string[];
  globalSearch?: string;
  selectedNamespace?: string;
  selectedSeverity?: string;
  selectedCategory?: string;
  savingsOnly?: boolean;
  onSelectNamespace?: (ns: string) => void;
  onClearFilters?: () => void;
  /** Drift flags per workload key, from the cross-scan diff (optional). */
  drift?: Record<string, DiffChanges>;
  /** Scan parameters for the auditable "why" derivation (optional). */
  scanParams?: WhyScanParams;
}

export const WorkloadsTable: React.FC<WorkloadsTableProps> = ({
  rows,
  clusterNamespaces = [],
  globalSearch = '',
  selectedNamespace = 'ALL',
  selectedSeverity = 'ALL',
  selectedCategory = 'ALL',
  savingsOnly = false,
  onSelectNamespace,
  onClearFilters,
  drift,
  scanParams,
}) => {
  // Local filter states
  const [tableSearch, setTableSearch] = useState(globalSearch || '');
  const [filterNs, setFilterNs] = useState<string>(selectedNamespace);
  const [filterKind, setFilterKind] = useState<string>('ALL');

  const handleNamespaceChange = (newNs: string) => {
    setFilterNs(newNs);
    setCurrentPage(1);
    onSelectNamespace?.(newNs);
  };
  const [filterSeverity, setFilterSeverity] = useState<StatusFilter>(() => {
    if (selectedSeverity && selectedSeverity !== 'ALL') {
      return selectedSeverity as StatusFilter;
    }
    if (selectedCategory && selectedCategory !== 'ALL') {
      if (selectedCategory === 'optimal') return 'OK';
      if (selectedCategory === 'overprovisioned') return 'WARNING';
      if (selectedCategory === 'attention') return 'CRITICAL';
    }
    return 'ALL';
  });
  const [onlySavings, setOnlySavings] = useState(savingsOnly);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('dcpu');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Lazy-loaded recommendation history per workload key (for sparklines)
  const [history, setHistory] = useState<Record<string, HistoryPoint[] | null>>({});
  const historyInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const key of expandedRows) {
      if (key in history || historyInFlight.current.has(key)) continue;
      historyInFlight.current.add(key);
      fetchWorkloadHistory(key)
        .then((res) => setHistory((prev) => ({ ...prev, [key]: res.points })))
        .catch(() => setHistory((prev) => ({ ...prev, [key]: null })))
        .finally(() => {
          historyInFlight.current.delete(key);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedRows]);

  // Copied row state for feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Keep filters in sync when props change
  useEffect(() => {
    if (globalSearch !== undefined && globalSearch !== tableSearch) {
      setTableSearch(globalSearch);
    }
  }, [globalSearch]);

  useEffect(() => {
    if (selectedNamespace) setFilterNs(selectedNamespace);
  }, [selectedNamespace]);

  useEffect(() => {
    if (selectedSeverity && selectedSeverity !== 'ALL') {
      setFilterSeverity(selectedSeverity as StatusFilter);
    } else if (selectedCategory && selectedCategory !== 'ALL') {
      if (selectedCategory === 'optimal') setFilterSeverity('OK');
      else if (selectedCategory === 'overprovisioned') setFilterSeverity('WARNING');
      else if (selectedCategory === 'attention') setFilterSeverity('CRITICAL');
      else setFilterSeverity('ALL');
    }
  }, [selectedSeverity, selectedCategory]);

  useEffect(() => {
    if (savingsOnly !== undefined) setOnlySavings(savingsOnly);
  }, [savingsOnly]);

  // Unique namespaces & kinds for dropdowns
  const availableNamespaces = useMemo(() => {
    const set = new Set(rows.map((r) => r.ns || 'default'));
    return Array.from(set).sort();
  }, [rows]);

  const emptyClusterNamespaces = useMemo(() => {
    const workloadNsSet = new Set(rows.map((r) => r.ns || 'default'));
    return (clusterNamespaces || [])
      .filter((ns) => !workloadNsSet.has(ns))
      .sort();
  }, [rows, clusterNamespaces]);

  const availableKinds = useMemo(() => {
    const set = new Set(rows.map((r) => r.kind || 'Deployment'));
    return Array.from(set).sort();
  }, [rows]);

  // Live status counts scoped to selected namespace & kind
  const statusCounts = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let ok = 0;
    let unknown = 0;

    const scopedRows = rows.filter((r) => {
      if (filterNs !== 'ALL' && r.ns !== filterNs) return false;
      if (filterKind !== 'ALL' && r.kind !== filterKind) return false;
      return true;
    });

    for (const r of scopedRows) {
      const sev = (r.severity || 'UNKNOWN').toUpperCase();
      if (sev === 'CRITICAL') critical++;
      else if (sev === 'WARNING') warning++;
      else if (sev === 'OK' || sev === 'GOOD') ok++;
      else unknown++;
    }

    return {
      all: scopedRows.length,
      critical,
      warning,
      ok,
      unknown,
    };
  }, [rows, filterNs, filterKind]);

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

  // Filtered data with multi-token search
  const filteredRows = useMemo(() => {
    const query = tableSearch.toLowerCase().trim();
    const terms = query ? query.split(/\s+/).filter(Boolean) : [];

    return rows.filter((r) => {
      // Search filter matching all tokens across workload, container, ns, kind
      if (terms.length > 0) {
        const name = (r.name || '').toLowerCase();
        const container = (r.container || '').toLowerCase();
        const ns = (r.ns || '').toLowerCase();
        const kind = (r.kind || '').toLowerCase();
        const matches = terms.every(
          (t) => name.includes(t) || container.includes(t) || ns.includes(t) || kind.includes(t)
        );
        if (!matches) return false;
      }

      // Namespace filter
      if (filterNs !== 'ALL' && r.ns !== filterNs) return false;

      // Kind filter
      if (filterKind !== 'ALL' && r.kind !== filterKind) return false;

      // Severity filter
      if (filterSeverity !== 'ALL') {
        const sev = (r.severity || 'UNKNOWN').toUpperCase();
        if (filterSeverity === 'CRITICAL' && sev !== 'CRITICAL') return false;
        if (filterSeverity === 'WARNING' && sev !== 'WARNING') return false;
        if (filterSeverity === 'OK' && sev !== 'OK' && sev !== 'GOOD') return false;
        if (filterSeverity === 'UNKNOWN' && (sev === 'CRITICAL' || sev === 'WARNING' || sev === 'OK' || sev === 'GOOD')) return false;
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
  }, [rows, tableSearch, filterNs, filterKind, filterSeverity, onlySavings]);

  // Sorted data with null-safe sorting (nulls always sort to bottom)
  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      let valA: any = null;
      let valB: any = null;

      switch (sortKey) {
        case 'name':
          valA = (a.name || '').toLowerCase();
          valB = (b.name || '').toLowerCase();
          break;
        case 'container':
          valA = (a.container || '').toLowerCase();
          valB = (b.container || '').toLowerCase();
          break;
        case 'pods':
          valA = a.pods || 1;
          valB = b.pods || 1;
          break;
        case 'dcpu':
          valA = calculateDelta(a, 'req_cpu');
          valB = calculateDelta(b, 'req_cpu');
          break;
        case 'dmem':
          valA = calculateDelta(a, 'req_mem');
          valB = calculateDelta(b, 'req_mem');
          break;
        case 'severity': {
          const order: Record<string, number> = { CRITICAL: 4, WARNING: 3, OK: 2, GOOD: 2, UNKNOWN: 1 };
          valA = order[(a.severity || '').toUpperCase()] || 0;
          valB = order[(b.severity || '').toUpperCase()] || 0;
          break;
        }
        default:
          valA = (a.name || '').toLowerCase();
          valB = (b.name || '').toLowerCase();
      }

      // Nulls always sort to bottom regardless of asc/desc
      const isNullA = valA === null || valA === undefined;
      const isNullB = valB === null || valB === undefined;
      if (isNullA && isNullB) return 0;
      if (isNullA) return 1;
      if (isNullB) return -1;

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

  // Helper: CPU request is controlled by an HPA when one exists and the engine
  // did not produce a CPU recommendation (KRR refuses: "HPA detected").
  const isHpaCpuRefused = (r: WorkloadRow) => r.hpa && !isNumeric(r.rec.req_cpu);

  // Helper: render Transition (cur -> rec)
  const renderTransition = (
    curVal: number | null | string,
    recVal: number | null | string,
    type: 'cpu' | 'mem'
  ) => {
    const formatFn = type === 'cpu' ? formatCpu : formatMem;
    const curFmt = formatFn(curVal);
    const recFmt = formatFn(recVal);
    const isCurUnset = curFmt === 'unset' || curVal === null || curVal === undefined;
    const isRecUnset = recFmt === 'unset' || recVal === null || recVal === undefined;

    return (
      <div className="flex items-center text-xs whitespace-nowrap">
        <span className={isCurUnset ? 'italic text-slate-400 font-normal' : 'text-slate-600 font-normal'}>
          {curFmt}
        </span>
        <span className="text-slate-400 mx-1 font-normal select-none">→</span>
        <span className={isRecUnset ? 'italic text-slate-400 font-normal' : 'font-bold text-slate-900'}>
          {recFmt}
        </span>
      </div>
    );
  };

  // Helper: render Delta Badge (soft rounded pill)
  const renderDeltaBadge = (delta: number | null, unitFormatter: (v: number) => string) => {
    if (delta === null || delta === undefined) {
      return <span className="text-slate-300 text-xs select-none pl-1">—</span>;
    }
    if (Math.abs(delta) < 1e-9) {
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
          0
        </span>
      );
    }
    if (delta > 0) {
      // Savings (green soft pill)
      return (
        <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
          -{unitFormatter(delta)}
        </span>
      );
    }
    // Deficit / Need increase (rose soft pill)
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
        +{unitFormatter(Math.abs(delta))}
      </span>
    );
  };

  // Helper: render Severity Badge
  const renderSeverityBadge = (severity: string) => {
    const norm = (severity || 'UNKNOWN').toUpperCase();
    switch (norm) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            CRITICAL
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            WARNING
          </span>
        );
      case 'OK':
      case 'GOOD':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            OK
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            UNKNOWN
          </span>
        );
    }
  };

  // Helper: render sortable column header (used on WORKLOAD, CONTAINER, PODS, CPU Δ, MEM Δ, SEVERITY)
  const renderSortHeader = (label: string, key: SortKey, align: 'left' | 'center' = 'left') => {
    const isSorted = sortKey === key;
    return (
      <th
        onClick={() => handleSort(key)}
        className={`py-2 px-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-900 whitespace-nowrap transition-colors ${
          align === 'center' ? 'text-center' : 'text-left'
        }`}
      >
        <div className={`flex items-center space-x-1 ${align === 'center' ? 'justify-center' : ''}`}>
          <span>{label}</span>
          {isSorted ? (
            sortDirection === 'asc' ? (
              <ChevronUp className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-slate-300 flex-shrink-0" />
          )}
        </div>
      </th>
    );
  };

  const isFiltered = filterNs !== 'ALL' || filterKind !== 'ALL' || filterSeverity !== 'ALL' || onlySavings || !!tableSearch;

  return (
    <div className="soft-card flex flex-col mb-8 overflow-hidden bg-white border border-slate-200 rounded-xl shadow-xs">
      {/* Card Header: Title & Subtitle on left, CSV/JSON on right (matching Image 3) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 pt-4 pb-2 bg-white gap-2">
        <div className="flex items-baseline space-x-2.5">
          <h3 className="text-base font-bold text-slate-900 tracking-tight">Containers</h3>
          <span className="text-xs text-slate-400 font-normal">Expand a row for the YAML snippet</span>
        </div>

        {/* CSV & JSON Export */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => exportToCsv(sortedRows)}
            disabled={sortedRows.length === 0}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition disabled:opacity-40 cursor-pointer shadow-2xs"
            title="Export filtered containers as CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>CSV</span>
          </button>
          <button
            onClick={() => exportToJson(sortedRows)}
            disabled={sortedRows.length === 0}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition disabled:opacity-40 cursor-pointer shadow-2xs"
            title="Export filtered containers as JSON"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* Unified Toolbar directly above the table header (matching Image 3) */}
      <div className="px-5 pt-2 pb-3.5 bg-white flex flex-wrap items-center gap-2.5">
        {/* 1. Namespace Filter Dropdown */}
        <div className="relative">
          <select
            value={filterNs}
            onChange={(e) => handleNamespaceChange(e.target.value)}
            className="appearance-none bg-white border border-slate-200 hover:border-slate-300 rounded-lg pl-3 pr-8 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition shadow-2xs"
          >
            <option value="ALL">
              All namespaces with workloads ({availableNamespaces.length})
            </option>
            {emptyClusterNamespaces.length > 0 ? (
              <>
                <optgroup label={`Namespaces with Workloads (${availableNamespaces.length})`}>
                  {availableNamespaces.map((ns) => (
                    <option key={ns} value={ns}>
                      {ns}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={`Other Cluster Namespaces (${emptyClusterNamespaces.length})`}>
                  {emptyClusterNamespaces.map((ns) => (
                    <option key={ns} value={ns}>
                      {ns} (0 workloads)
                    </option>
                  ))}
                </optgroup>
              </>
            ) : (
              availableNamespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))
            )}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* 2. Kind Filter Dropdown */}
        <div className="relative">
          <select
            value={filterKind}
            onChange={(e) => {
              setFilterKind(e.target.value);
              setCurrentPage(1);
            }}
            className="appearance-none bg-white border border-slate-200 hover:border-slate-300 rounded-lg pl-3 pr-8 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition shadow-2xs"
          >
            <option value="ALL">All kinds</option>
            {availableKinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* 3. Status Pills in a single segmented control (matching Image 3) */}
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/60 p-0.5 shadow-2xs max-w-full overflow-x-auto">
          {[
            { id: 'ALL', label: 'All', count: statusCounts.all },
            { id: 'CRITICAL', label: 'Critical', count: statusCounts.critical },
            { id: 'WARNING', label: 'Warning', count: statusCounts.warning },
            { id: 'OK', label: 'OK', count: statusCounts.ok },
            { id: 'UNKNOWN', label: 'Unknown', count: statusCounts.unknown },
          ].map((pill) => {
            const active = filterSeverity === pill.id;
            return (
              <button
                key={pill.id}
                onClick={() => {
                  setFilterSeverity(pill.id as StatusFilter);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer select-none inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <span>{pill.label}</span>
                <span className={active ? 'text-slate-300 text-[11px] font-normal' : 'text-slate-400 text-[11px] font-normal'}>
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 4. Inline Search Bar spanning available width (matching Image 3) */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={tableSearch}
            onChange={(e) => {
              setTableSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search workload or container"
            className="w-full pl-9 pr-7 py-1.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition shadow-2xs"
          />
          {tableSearch && (
            <button
              onClick={() => {
                setTableSearch('');
                setCurrentPage(1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 5. Live Container Counter & Reset Filter (matching Image 3) */}
        <div className="flex items-center space-x-2.5 select-none whitespace-nowrap ml-auto text-xs">
          <span className="text-slate-500 font-medium">
            {filteredRows.length} of {rows.length} containers
          </span>
          {isFiltered && (
            <button
              onClick={() => {
                setTableSearch('');
                setFilterNs('ALL');
                setFilterKind('ALL');
                setFilterSeverity('ALL');
                setOnlySavings(false);
                if (onClearFilters) onClearFilters();
              }}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer transition font-medium pl-1"
              title="Reset all filters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Table Content: 10 Explicit Columns matching Image 2 & Image 3 */}
      <div className="overflow-x-auto border-t border-slate-200">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50/80 border-b border-slate-200">
            <tr>
              <th className="w-7 pl-2 pr-1 py-2 text-center"></th>
              {renderSortHeader('WORKLOAD', 'name')}
              {renderSortHeader('CONTAINER', 'container')}
              {renderSortHeader('PODS', 'pods', 'center')}
              <th className="py-2 px-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                CPU REQUEST
              </th>
              <th className="py-2 px-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                CPU LIMIT
              </th>
              <th className="py-2 px-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                MEM REQUEST
              </th>
              <th className="py-2 px-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                MEM LIMIT
              </th>
              {renderSortHeader('CPU Δ', 'dcpu')}
              {renderSortHeader('MEM Δ', 'dmem')}
              {renderSortHeader('SEVERITY', 'severity')}
              <th className="py-2 px-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                DRIFT
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-14 text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Info className="w-6 h-6 text-slate-400" />
                    {filterNs !== 'ALL' && emptyClusterNamespaces.includes(filterNs) ? (
                      <>
                        <p className="text-sm font-semibold text-slate-700">
                          No workloads found in namespace "{filterNs}"
                        </p>
                        <p className="text-xs text-slate-400 max-w-md">
                          This cluster namespace exists in Kubernetes, but has no running Deployments, StatefulSets, or DaemonSets analyzed by KRR.
                        </p>
                        <button
                          onClick={() => {
                            handleNamespaceChange('ALL');
                            if (onClearFilters) onClearFilters();
                          }}
                          className="mt-2 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium transition"
                        >
                          Show all namespaces with workloads
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-slate-700">No matching containers found</p>
                        <p className="text-xs text-slate-400">Try adjusting your filters or search terms.</p>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedRows.map((r) => {
                const key = getRowKey(r);
                const isExpanded = expandedRows.has(key);
                const dCpu = calculateDelta(r, 'req_cpu');
                const dMem = calculateDelta(r, 'req_mem');

                return (
                  <React.Fragment key={key}>
                    <tr className={`hover:bg-slate-50/80 transition-colors ${isExpanded ? 'bg-slate-50/70' : 'bg-white'}`}>
                      {/* 1. Caret / Expand */}
                      <td className="w-7 pl-2 pr-1 py-2 text-center align-middle">
                        <button
                          onClick={() => toggleRow(key)}
                          className="p-0.5 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                          title={isExpanded ? 'Collapse row' : 'Expand row details'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-blue-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* 2. Workload: Bold name on top, ns · kind underneath */}
                      <td className="py-2 px-1.5 align-middle">
                        <div className="flex flex-col min-w-[95px] max-w-[135px] xl:max-w-[170px]">
                          <span className="font-semibold text-slate-900 text-xs truncate" title={r.name}>
                            {r.name}
                          </span>
                          <span className="text-[11px] text-slate-400 mt-0.5 truncate" title={`${r.ns} · ${r.kind}`}>
                            {r.ns} · {r.kind}
                          </span>
                        </div>
                      </td>

                      {/* 3. Container */}
                      <td className="py-2 px-1.5 align-middle">
                        <div className="flex flex-col min-w-[75px] max-w-[105px] xl:max-w-[135px]">
                          <span className="text-xs text-slate-700 truncate block" title={r.container}>
                            {r.container}
                          </span>
                          {r.sidecar && (
                            <span
                              className="text-[9px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1 rounded mt-0.5 self-start"
                              title="Sidecar container (usually injected by a service mesh or agent)"
                            >
                              sidecar
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Pods (centered) */}
                      <td className="py-2 px-1 align-middle text-center whitespace-nowrap">
                        <div className="flex flex-col items-center">
                          <span className="font-medium text-xs text-slate-800">{r.pods || 1}</span>
                          {r.hpa && (
                            <span className="text-[9px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 rounded mt-0.5" title="HPA active">
                              HPA
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. CPU Request (cur -> rec) */}
                      <td className="py-2 px-1.5 align-middle whitespace-nowrap">
                        {isHpaCpuRefused(r) ? (
                          <div className="flex items-center text-xs whitespace-nowrap">
                            <span className="text-slate-600 font-normal">{formatCpu(r.cur.req_cpu)}</span>
                            <span className="text-slate-400 mx-1 font-normal select-none">→</span>
                            <span
                              className="italic text-indigo-700 font-medium"
                              title="CPU requests are the HPA control input — the engine will not guess this value"
                            >
                              HPA-controlled
                            </span>
                          </div>
                        ) : (
                          renderTransition(r.cur.req_cpu, r.rec.req_cpu, 'cpu')
                        )}
                      </td>

                      {/* 6. CPU Limit (cur -> rec) */}
                      <td className="py-2 px-1.5 align-middle whitespace-nowrap">
                        {renderTransition(r.cur.lim_cpu, r.rec.lim_cpu, 'cpu')}
                      </td>

                      {/* 7. Mem Request (cur -> rec) */}
                      <td className="py-2 px-1.5 align-middle whitespace-nowrap">
                        {renderTransition(r.cur.req_mem, r.rec.req_mem, 'mem')}
                      </td>

                      {/* 8. Mem Limit (cur -> rec) */}
                      <td className="py-2 px-1.5 align-middle whitespace-nowrap">
                        {renderTransition(r.cur.lim_mem, r.rec.lim_mem, 'mem')}
                      </td>

                      {/* 9. CPU Delta */}
                      <td className="py-2 px-1.5 align-middle whitespace-nowrap">
                        {renderDeltaBadge(dCpu, formatCpu)}
                      </td>

                      {/* 10. Mem Delta */}
                      <td className="py-2 px-1.5 align-middle whitespace-nowrap">
                        {renderDeltaBadge(dMem, formatMem)}
                      </td>

                      {/* 11. Severity */}
                      <td className="py-2 px-1.5 align-middle whitespace-nowrap">
                        {renderSeverityBadge(r.severity)}
                      </td>

                      {/* 12. Drift vs previous scan */}
                      <td className="py-2 px-1.5 align-middle whitespace-nowrap">
                        {drift && drift[key] && <DriftBadge changes={drift[key]} />}
                      </td>
                    </tr>

                    {/* Expandable Details Row matching Image 1 (Low-profile 3-column layout) */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70 border-b border-slate-200">
                        <td colSpan={12} className="py-2.5 px-3 sm:px-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3.5 xl:gap-5 items-start w-full text-left">
                            {/* Column 1: CURRENT VS RECOMMENDED (PER POD) */}
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                CURRENT VS RECOMMENDED (PER POD)
                              </div>
                              <div className="bg-white rounded-lg border border-slate-200/90 overflow-hidden shadow-2xs">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-400">
                                      <th className="py-1.5 px-3 text-left font-medium w-1/3"></th>
                                      <th className="py-1.5 px-3 text-left font-semibold text-slate-500 uppercase tracking-wider w-1/3">CURRENT</th>
                                      <th className="py-1.5 px-3 text-left font-semibold text-slate-500 uppercase tracking-wider w-1/3">RECOMMENDED</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    <tr>
                                      <td className="py-1.5 px-3 text-left text-slate-500 font-medium whitespace-nowrap">CPU request</td>
                                      <td className="py-1.5 px-3 text-left text-slate-700 whitespace-nowrap">{formatCpu(r.cur.req_cpu)}</td>
                                      {isHpaCpuRefused(r) ? (
                                        <td className="py-1.5 px-3 text-left whitespace-nowrap">
                                          <span
                                            className="italic text-indigo-700 font-medium"
                                            title="CPU requests are the HPA control input — the engine will not guess this value"
                                          >
                                            HPA-controlled
                                          </span>
                                        </td>
                                      ) : (
                                        <td className={`py-1.5 px-3 text-left whitespace-nowrap ${formatCpu(r.rec.req_cpu) === 'unset' ? 'italic text-slate-400 font-normal' : 'font-bold text-slate-900'}`}>
                                          {formatCpu(r.rec.req_cpu)}
                                        </td>
                                      )}
                                    </tr>
                                    <tr>
                                      <td className="py-1.5 px-3 text-left text-slate-500 font-medium whitespace-nowrap">CPU limit</td>
                                      <td className="py-1.5 px-3 text-left text-slate-700 whitespace-nowrap">{formatCpu(r.cur.lim_cpu)}</td>
                                      <td className={`py-1.5 px-3 text-left whitespace-nowrap ${formatCpu(r.rec.lim_cpu) === 'unset' ? 'italic text-slate-400 font-normal' : 'font-bold text-slate-900'}`}>
                                        {formatCpu(r.rec.lim_cpu)}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td className="py-1.5 px-3 text-left text-slate-500 font-medium whitespace-nowrap">Memory request</td>
                                      <td className="py-1.5 px-3 text-left text-slate-700 whitespace-nowrap">{formatMem(r.cur.req_mem)}</td>
                                      <td className={`py-1.5 px-3 text-left whitespace-nowrap ${formatMem(r.rec.req_mem) === 'unset' ? 'italic text-slate-400 font-normal' : 'font-bold text-slate-900'}`}>
                                        {formatMem(r.rec.req_mem)}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td className="py-1.5 px-3 text-left text-slate-500 font-medium whitespace-nowrap">Memory limit</td>
                                      <td className="py-1.5 px-3 text-left text-slate-700 whitespace-nowrap">{formatMem(r.cur.lim_mem)}</td>
                                      <td className={`py-1.5 px-3 text-left whitespace-nowrap ${formatMem(r.rec.lim_mem) === 'unset' ? 'italic text-slate-400 font-normal' : 'font-bold text-slate-900'}`}>
                                        {formatMem(r.rec.lim_mem)}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1.5 pl-0.5">
                                Δ columns = per-pod change × {r.pods || 1} pod(s).
                              </p>
                            </div>

                            {/* Column 2: YAML FOR CONTAINER {CONTAINER_NAME} */}
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 truncate" title={`YAML FOR CONTAINER ${r.container.toUpperCase()}`}>
                                YAML FOR CONTAINER {r.container.toUpperCase()}
                              </div>
                              <div className="relative bg-[#0b132b] text-slate-200 rounded-lg p-3 text-xs font-mono shadow-2xs">
                                <button
                                  onClick={() => handleCopyYaml(r, key)}
                                  className="absolute top-2.5 right-2.5 inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-sans border border-slate-700/60 shadow-2xs transition cursor-pointer"
                                  title="Copy YAML snippet"
                                >
                                  {copiedKey === key ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3 text-slate-400" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                                <pre className="text-xs font-mono text-slate-100 overflow-x-auto leading-relaxed pr-20 pt-0.5">
                                  {generateResourceYaml(r)}
                                </pre>
                              </div>
                            </div>

                            {/* Column 3: NOTES */}
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                NOTES
                              </div>
                              <div className="space-y-2 text-xs">
                                {r.warnings && r.warnings.length > 0 ? (
                                  r.warnings.map((w, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-start space-x-2 text-xs bg-amber-50 border border-amber-200/80 px-2.5 py-1.5 rounded-md text-amber-800"
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                                      <span className="break-words">{w}</span>
                                    </div>
                                  ))
                                ) : null}

                                {r.hpa && (
                                  <div className="flex items-start space-x-2 text-xs bg-indigo-50 border border-indigo-200/80 px-2.5 py-1.5 rounded-md text-indigo-700">
                                    <Zap className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                                    <span className="break-words">HPA active: Recommended to only adjust memory or ensure CPU targets match percentile.</span>
                                  </div>
                                )}

                                {r.info && Object.keys(r.info).length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(r.info).map(([k, v]) => (
                                      <div
                                        key={k}
                                        className="inline-flex items-center space-x-1.5 text-xs bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600 shadow-2xs"
                                      >
                                        <Info className="w-3 h-3 text-blue-500 flex-shrink-0" />
                                        <span>
                                          <strong className="text-slate-700 capitalize">{k}:</strong> {String(v)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {(!r.warnings || r.warnings.length === 0) && !r.hpa && (!r.info || Object.keys(r.info).length === 0) && (
                                  <p className="text-xs text-slate-500 py-1">No warnings for this container.</p>
                                )}
                              </div>
                            </div>

                            {/* Column 4: TREND (recommendation history across scans) */}
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                RECOMMENDATION TREND
                              </div>
                              {history[key] === null ? (
                                <p className="text-xs text-slate-500 italic">History unavailable.</p>
                              ) : !history[key] ? (
                                <p className="text-xs text-slate-400 italic">Loading history…</p>
                              ) : (
                                <div className="bg-white rounded-lg border border-slate-200/90 p-2.5 shadow-2xs space-y-2">
                                  <div>
                                    <div className="text-[10px] font-semibold text-slate-500 mb-0.5">Recommended CPU</div>
                                    <Sparkline
                                      values={history[key]!.map((p) => (typeof p.rec.req_cpu === 'number' ? p.rec.req_cpu : null))}
                                      started={history[key]!.map((p) => p.started)}
                                      format={(v) => formatCpu(v)}
                                    />
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-semibold text-slate-500 mb-0.5">Recommended memory</div>
                                    <Sparkline
                                      values={history[key]!.map((p) => (typeof p.rec.req_mem === 'number' ? p.rec.req_mem : null))}
                                      started={history[key]!.map((p) => p.started)}
                                      format={(v) => formatMem(v)}
                                    />
                                  </div>
                                  <p className="text-[10px] text-slate-400">
                                    Across {history[key]!.length} scan{history[key]!.length === 1 ? '' : 's'}.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* EVIDENCE: measured usage behind the recommendation (v1.1.0) */}
                          <div className="mt-3 pt-3 border-t border-slate-200/80">
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                              EVIDENCE — MEASURED USAGE{scanParams ? ` (LAST ${scanParams.history_days} DAYS)` : ''}
                            </div>
                            {hasUsageData(r) ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-w-4xl">
                                <UsageStrip
                                  title="CPU usage"
                                  usage={r.usage?.cpu}
                                  currentValue={isNumeric(r.cur.req_cpu) ? (r.cur.req_cpu as number) : null}
                                  recommendedValue={isNumeric(r.rec.req_cpu) ? (r.rec.req_cpu as number) : null}
                                  highlightKey={scanParams ? `p${scanParams.cpu_percentile}` : 'p95'}
                                  format={formatCpu}
                                />
                                <UsageStrip
                                  title="Memory usage"
                                  usage={r.usage?.memory}
                                  currentValue={isNumeric(r.cur.req_mem) ? (r.cur.req_mem as number) : null}
                                  recommendedValue={isNumeric(r.rec.req_mem) ? (r.rec.req_mem as number) : null}
                                  format={formatMem}
                                />
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400 italic">
                                Raw usage data not captured in this scan (pre-v1.1.0) or no Prometheus data available. Run a new scan to see the evidence.
                              </p>
                            )}

                            {(() => {
                              const whyLines = buildWhyLines(r, scanParams);
                              if (whyLines.length === 0) return null;
                              return (
                                <div className="mt-2.5 space-y-1">
                                  {whyLines.map((l, idx) => (
                                    <div key={idx} className="flex items-start space-x-2 text-xs text-slate-600">
                                      <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                                      <span className="break-words">{l}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
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
          of <strong className="text-slate-700 font-semibold">{sortedRows.length}</strong> containers
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 focus:outline-none cursor-pointer"
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
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 transition cursor-pointer"
            >
              Previous
            </button>
            <span className="px-2 font-medium text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 transition cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
