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

/** Measured usage percentiles per resource ("p50", "p90", ..., "max").
 * Extra keys (e.g. "p97") appear when a custom CPU percentile was configured. */
export interface UsagePercentiles {
  [key: string]: number | null | undefined;
}

export interface WorkloadUsage {
  cpu?: UsagePercentiles;
  memory?: UsagePercentiles;
}

export interface WorkloadRow {
  ns: string;
  kind: string;
  name: string;
  container: string;
  pods: number;
  hpa: boolean;
  sidecar?: boolean;
  severity: 'CRITICAL' | 'WARNING' | 'OK' | 'GOOD' | 'UNKNOWN';
  cur: ResourceAllocation;
  rec: ResourceAllocation;
  info: Record<string, string>;
  warnings: string[];
  /** Measured usage evidence; undefined for scans made before v1.1.0. */
  usage?: WorkloadUsage | null;
}

export interface CapacityResource {
  allocatable: number | null;
  usage_avg: number | null;
  requests: number | null;
  limits: number | null;
}

export interface ClusterCapacity {
  collected_at?: number;
  lookback_hours?: number;
  cpu?: CapacityResource;
  memory?: CapacityResource;
  warnings?: string[];
}

export interface ScanDetail extends ScanMeta {
  rows: WorkloadRow[];
  score?: number;
  errors?: any[];
  cluster?: Record<string, any>;
  /** Cluster-wide capacity snapshot; absent for scans created before v1.1.2. */
  capacity?: ClusterCapacity | null;
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
