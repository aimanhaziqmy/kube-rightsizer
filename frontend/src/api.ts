import { ClusterStatus, ScanDetail, ScanMeta, ScanParams } from './types';
import { ScanDiff, TrendsScan, HistoryPoint } from './utils/scanDiff';

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.error || `HTTP ${res.status}: ${res.statusText}`);
  }
  return data as T;
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch('/api/healthz');
  return handleResponse(res);
}

export async function fetchNamespaces(): Promise<string[]> {
  const res = await fetch('/api/namespaces');
  return handleResponse(res);
}

export async function fetchStatus(): Promise<ClusterStatus> {
  const res = await fetch('/api/status');
  return handleResponse(res);
}

export async function fetchScans(): Promise<ScanMeta[]> {
  const res = await fetch('/api/scans');
  return handleResponse(res);
}

export async function fetchScanDetail(id: string): Promise<ScanDetail> {
  const res = await fetch(`/api/scans/${encodeURIComponent(id)}`);
  return handleResponse(res);
}

export async function fetchTrends(): Promise<{ scans: TrendsScan[] }> {
  const res = await fetch('/api/scans/trends');
  return handleResponse(res);
}

export async function fetchScanDiff(scanId: string, compareTo?: string): Promise<ScanDiff> {
  const qs = compareTo ? `?compare_to=${encodeURIComponent(compareTo)}` : '';
  const res = await fetch(`/api/scans/${encodeURIComponent(scanId)}/diff${qs}`);
  return handleResponse(res);
}

export async function fetchWorkloadHistory(key: string): Promise<{ key: string; points: HistoryPoint[] }> {
  const res = await fetch(`/api/scans/history?key=${encodeURIComponent(key)}`);
  return handleResponse(res);
}

export async function triggerScan(params: ScanParams): Promise<ScanMeta> {
  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  return handleResponse(res);
}

export async function deleteScan(id: string): Promise<boolean> {
  const res = await fetch(`/api/scans/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to delete scan (${res.status})`);
  }
  return true;
}

export function subscribeLiveLogs(
  onLog: (line: string) => void,
  onStatusChange?: (status: string, error?: string) => void
): () => void {
  const eventSource = new EventSource('/api/scan/live');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'log' && data.line) {
        onLog(data.line);
      } else if (data.type === 'status') {
        if (onStatusChange) onStatusChange(data.status, data.error);
      }
    } catch {
      // Raw string fallback
      if (event.data) onLog(event.data);
    }
  };

  eventSource.onerror = () => {
    // EventSource will automatically retry connecting
  };

  return () => {
    eventSource.close();
  };
}
