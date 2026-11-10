import React, { useState, useMemo, useEffect } from 'react';
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
import { formatCpu, formatMem } from '../utils/formatters';
import { calculateDelta, generateResourceYaml } from '../utils/krrCalculations';
import { exportToCsv, exportToJson } from '../utils/exportUtils';

interface WorkloadsTableProps {
  rows: WorkloadRow[];
  globalSearch?: string;
  selectedNamespace?: string;
  selectedSeverity?: string;
  selectedCategory?: string;
  savingsOnly?: boolean;
  onClearFilters?: () => void;
}

export const WorkloadsTable: React.FC<WorkloadsTableProps> = ({
  rows,
  globalSearch = '',
  selectedNamespace = 'ALL',
  selectedSeverity = 'ALL',
  selectedCategory = 'ALL',
  savingsOnly = false,
  onClearFilters,
}) => {
  // Local filter states
  const [tableSearch, setTableSearch] = useState(globalSearch || '');
  const [filterNs, setFilterNs] = useState<string>(selectedNamespace);
  const [filterKind, setFilterKind] = useState<string>('ALL');
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
        <span className="text-slate-400 mx-1.5 font-normal select-none">→</span>
        <span className={isRecUnset ? 'italic text-slate-400 font-normal' : 'font-bold text-slate-900'}>
          {recFmt}
        </span>
      </div>
    );
  };

  // Helper: render Delta Badge (soft rounded pill)
  const renderDeltaBadge = (delta: number | null, unitFormatter: (v: number) => string) => {
    if (delta === null || delta === undefined) {
      return <span className="text-slate-300 text-xs select-none pl-2">—</span>;
    }
    if (Math.abs(delta) < 1e-9) {
      return (
        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
          0
        </span>
      );
    }
    if (delta > 0) {
      // Savings (green soft pill)
      return (
        <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
          -{unitFormatter(delta)}
        </span>
      );
    }
    // Deficit / Need increase (rose soft pill)
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            CRITICAL
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            WARNING
          </span>
        );
      case 'OK':
      case 'GOOD':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            OK
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-slate-100 text-slate-600 border border-slate-200">
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
        className={`py-3 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-900 whitespace-nowrap transition-colors ${
          align === 'center' ? 'text-center' : 'text-left'
        }`}
      >
        <div className={`flex items-center space-x-1 ${align === 'center' ? 'justify-center' : ''}`}>
          <span>{label}</span>
          {isSorted ? (
            sortDirection === 'asc' ? (
              <ChevronUp className="w-3.5 h-3.5 text-blue-600" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-slate-300" />
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
            onChange={(e) => {
              setFilterNs(e.target.value);
              setCurrentPage(1);
            }}
            className="appearance-none bg-white border border-slate-200 hover:border-slate-300 rounded-lg pl-3 pr-8 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition shadow-2xs"
          >
            <option value="ALL">All namespaces ({availableNamespaces.length})</option>
            {availableNamespaces.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
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
        <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/60 p-0.5 shadow-2xs">
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
              <th className="w-8 pl-3 pr-1 py-3"></th>
              {renderSortHeader('WORKLOAD', 'name')}
              {renderSortHeader('CONTAINER', 'container')}
              {renderSortHeader('PODS', 'pods', 'center')}
              <th className="py-3 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                CPU REQUEST
              </th>
              <th className="py-3 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                CPU LIMIT
              </th>
              <th className="py-3 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                MEM REQUEST
              </th>
              <th className="py-3 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                MEM LIMIT
              </th>
              {renderSortHeader('CPU Δ', 'dcpu')}
              {renderSortHeader('MEM Δ', 'dmem')}
              {renderSortHeader('SEVERITY', 'severity')}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-14 text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Info className="w-6 h-6 text-slate-400" />
                    <p className="text-sm font-semibold text-slate-700">No matching containers found</p>
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

                return (
                  <React.Fragment key={key}>
                    <tr className={`hover:bg-slate-50/80 transition-colors ${isExpanded ? 'bg-slate-50/70' : 'bg-white'}`}>
                      {/* 1. Caret / Expand */}
                      <td className="text-center pl-3 pr-1 py-3 align-middle">
                        <button
                          onClick={() => toggleRow(key)}
                          className="p-1 text-slate-400 hover:text-slate-700 transition cursor-pointer"
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
                      <td className="py-3 px-3 align-middle">
                        <div className="flex flex-col min-w-[170px] max-w-[340px]">
                          <span className="font-semibold text-slate-900 text-xs truncate" title={r.name}>
                            {r.name}
                          </span>
                          <span className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {r.ns} · {r.kind}
                          </span>
                        </div>
                      </td>

                      {/* 3. Container */}
                      <td className="py-3 px-3 align-middle">
                        <span className="text-xs text-slate-700 truncate block max-w-[180px]" title={r.container}>
                          {r.container}
                        </span>
                      </td>

                      {/* 4. Pods (centered) */}
                      <td className="py-3 px-3 align-middle text-center">
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
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        {renderTransition(r.cur.req_cpu, r.rec.req_cpu, 'cpu')}
                      </td>

                      {/* 6. CPU Limit (cur -> rec) */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        {renderTransition(r.cur.lim_cpu, r.rec.lim_cpu, 'cpu')}
                      </td>

                      {/* 7. Mem Request (cur -> rec) */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        {renderTransition(r.cur.req_mem, r.rec.req_mem, 'mem')}
                      </td>

                      {/* 8. Mem Limit (cur -> rec) */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        {renderTransition(r.cur.lim_mem, r.rec.lim_mem, 'mem')}
                      </td>

                      {/* 9. CPU Delta */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        {renderDeltaBadge(dCpu, formatCpu)}
                      </td>

                      {/* 10. Mem Delta */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        {renderDeltaBadge(dMem, formatMem)}
                      </td>

                      {/* 11. Severity */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        {renderSeverityBadge(r.severity)}
                      </td>
                    </tr>

                    {/* Expandable Details Row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={11} className="p-4 border-b border-slate-200">
                          <div className="space-y-4 max-w-5xl mx-auto">
                            {/* Comparison Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* CPU Allocation Detail */}
                              <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                    CPU Allocations (Cores)
                                  </span>
                                  <span className="text-[11px] text-slate-400">Total Pods: {r.pods || 1}</span>
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
                                    <div className="font-semibold mt-0.5">
                                      {renderDeltaBadge(dCpu, formatCpu)}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-1">
                                      {dCpu && dCpu > 0 ? 'Savings' : dCpu && dCpu < 0 ? 'Deficit' : 'Balanced'}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Memory Allocation Detail */}
                              <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                    Memory Allocations (RAM)
                                  </span>
                                  <span className="text-[11px] text-slate-400">Total Pods: {r.pods || 1}</span>
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
                                    <div className="font-semibold mt-0.5">
                                      {renderDeltaBadge(dMem, formatMem)}
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
                                  className="flex items-center space-x-1 text-slate-300 hover:text-white transition cursor-pointer"
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
