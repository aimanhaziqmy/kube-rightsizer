export interface ScanParams {
  cpu_percentile: number;
  memory_buffer_percentage: number;
  history_days: number;
  namespaces: string[];
}

export interface ScanMeta {
  id: string;
  started: number;
  status: 'running' | 'done' | 'failed';
  params: ScanParams;
  finished?: number;
  duration?: number;
  containers?: number;
  error?: string;
}

export interface ResourceAllocation {
  req_cpu: number | null | string;
  req_mem: number | null | string;
  lim_cpu: number | null | string;
  lim_mem: number | null | string;
}

export interface WorkloadRow {
  ns: string;
  kind: string;
  name: string;
  container: string;
  pods: number;
  hpa: boolean;
  severity: 'CRITICAL' | 'WARNING' | 'OK' | 'GOOD' | 'UNKNOWN';
  cur: ResourceAllocation;
  rec: ResourceAllocation;
  info: Record<string, string>;
  warnings: string[];
}

export interface ScanDetail extends ScanMeta {
  rows: WorkloadRow[];
  score?: number;
  errors?: any[];
  cluster?: Record<string, any>;
}

export interface ClusterStatus {
  running: ScanMeta | null;
  elapsed: number | null;
  log: string[];
  cluster_name?: string;
  namespaces_count?: number;
  total_scans?: number;
}

export type ViewTab = 'overview' | 'workloads' | 'namespaces' | 'trends' | 'history' | 'settings';

export type StatusFilter = 'ALL' | 'CRITICAL' | 'WARNING' | 'OK' | 'UNKNOWN';

export type SortKey = 'name' | 'ns' | 'kind' | 'container' | 'pods' | 'req_cpu' | 'lim_cpu' | 'req_mem' | 'lim_mem' | 'dcpu' | 'dmem' | 'severity';
export type SortDirection = 'asc' | 'desc';
