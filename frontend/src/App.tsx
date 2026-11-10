import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  fetchStatus, 
  fetchNamespaces, 
  fetchScans, 
  fetchScanDetail, 
  deleteScan,
  triggerScan,
  subscribeLiveLogs
} from './api';
import { 
  ClusterStatus, 
  ScanDetail, 
  ScanMeta, 
  ViewTab,
  ScanParams
} from './types';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { OverviewView } from './components/OverviewView';
import { WorkloadsTable } from './components/WorkloadsTable';
import { NamespacesView } from './components/NamespacesView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { ScanModal } from './components/ScanModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { Play, AlertCircle, RefreshCw, Terminal, Layers } from 'lucide-react';

export const App: React.FC = () => {
  // Navigation State
  const [currentTab, setCurrentTab] = useState<ViewTab>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);

  // Search & Filter sharing
  const [globalSearch, setGlobalSearch] = useState('');
  const [tableNamespaceFilter, setTableNamespaceFilter] = useState('ALL');
  const [tableSeverityFilter, setTableSeverityFilter] = useState('ALL');
  const [tableCategoryFilter, setTableCategoryFilter] = useState('ALL');
  const [tableSavingsOnly, setTableSavingsOnly] = useState(false);

  // Backend Data
  const [clusterStatus, setClusterStatus] = useState<ClusterStatus | null>(null);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [scans, setScans] = useState<ScanMeta[]>([]);
  const [activeScan, setActiveScan] = useState<ScanDetail | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scan & Live Feedback State
  const [isScanning, setIsScanning] = useState(false);
  const [scanElapsed, setScanElapsed] = useState(0);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const isScanningRef = useRef(false);
  isScanningRef.current = isScanning;

  // Toast Notifications State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: 'success' | 'error' | 'info', title: string, message: string) => {
    const newToast: ToastMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      title,
      message,
    };
    setToasts((prev) => [...prev, newToast]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Load initial status and scan list
  const loadInitialData = useCallback(async () => {
    try {
      const [statusData, nsData, scansData] = await Promise.all([
        fetchStatus().catch(() => null),
        fetchNamespaces().catch(() => []),
        fetchScans().catch(() => []),
      ]);

      if (statusData) {
        setClusterStatus(statusData);
        if (statusData.running) {
          setIsScanning(true);
          setScanElapsed(statusData.elapsed || 0);
          if (statusData.log && statusData.log.length > 0) {
            setScanLogs(statusData.log);
          }
        }
      }
      setNamespaces(nsData);
      setScans(scansData);

      // If there are scans and no active scan, load the most recent scan
      if (scansData.length > 0 && !activeScan) {
        const latestDetail = await fetchScanDetail(scansData[0].id).catch(() => null);
        if (latestDetail) setActiveScan(latestDetail);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to cluster backend');
    } finally {
      setLoading(false);
    }
  }, [activeScan]);

  useEffect(() => {
    loadInitialData();
  }, []);

  // Elapsed seconds timer when scanning
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isScanning) {
      timer = setInterval(() => {
        setScanElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isScanning]);

  // Handle Scan Completion
  const handleScanCompleted = useCallback(async (success: boolean, errMsg?: string) => {
    if (!isScanningRef.current) return;
    setIsScanning(false);

    try {
      const [updatedScans, st] = await Promise.all([
        fetchScans().catch(() => []),
        fetchStatus().catch(() => null),
      ]);

      setScans(updatedScans);
      if (st) setClusterStatus(st);

      if (success && updatedScans.length > 0) {
        const latestDetail = await fetchScanDetail(updatedScans[0].id).catch(() => null);
        if (latestDetail) {
          setActiveScan(latestDetail);
        }
        addToast(
          'success',
          'Rightsizing Scan Completed',
          `Scan finished successfully! Analyzed ${latestDetail?.rows?.length ?? updatedScans[0].containers ?? 0} workloads with updated recommendations.`
        );
      } else if (!success) {
        addToast(
          'error',
          'Rightsizing Scan Failed',
          errMsg || 'The scan encountered an error during execution. Check live logs for details.'
        );
      }
    } catch (e: any) {
      console.error('Error handling scan completion:', e);
      addToast('error', 'Sync Warning', 'Scan finished but failed to load the latest result automatically.');
    }
  }, [addToast]);

  // Real-time SSE Live Logs and Status subscription
  useEffect(() => {
    if (!isScanning) return;

    const unsubscribe = subscribeLiveLogs(
      (line) => {
        setScanLogs((prev) => [...prev, line]);
      },
      (status, errMsg) => {
        if (status === 'done') {
          handleScanCompleted(true);
        } else if (status === 'failed') {
          handleScanCompleted(false, errMsg);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isScanning, handleScanCompleted]);

  // Active status polling as fallback
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (isScanning) {
      timer = setInterval(async () => {
        try {
          const st = await fetchStatus();
          setClusterStatus(st);

          if (st.elapsed !== null && st.elapsed !== undefined) {
            setScanElapsed(st.elapsed);
          }

          // If backend reports no scan running, scan has finished
          if (!st.running && isScanningRef.current) {
            handleScanCompleted(true);
          }
        } catch (e) {
          console.error('Failed to poll status', e);
        }
      }, 1500);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isScanning, handleScanCompleted]);

  // Trigger a scan immediately
  const handleTriggerScan = async (params: ScanParams) => {
    // Immediately update UI to clear "Scanning..." state
    setIsScanning(true);
    setScanElapsed(0);
    setScanLogs([`Starting analysis with CPU percentile ${params.cpu_percentile}%, memory buffer +${params.memory_buffer_percentage}%...`]);

    // Optimistically update clusterStatus to running
    setClusterStatus((prev) => ({
      running: {
        id: 'new',
        started: Date.now() / 1000,
        status: 'running',
        params,
      },
      elapsed: 0,
      log: ['Initializing scan process...'],
      cluster_name: prev?.cluster_name,
      namespaces_count: prev?.namespaces_count,
      total_scans: prev?.total_scans,
    }));

    try {
      await triggerScan(params);
    } catch (err: any) {
      setIsScanning(false);
      addToast('error', 'Failed to Start Scan', err.message || 'Could not initiate scan on backend.');
      throw err;
    }
  };

  const handleSelectScan = async (id: string) => {
    setLoading(true);
    try {
      const detail = await fetchScanDetail(id);
      setActiveScan(detail);
      setCurrentTab('workloads');
    } catch (err: any) {
      setError(`Failed to load scan ${id}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteScan = async (id: string) => {
    try {
      await deleteScan(id);
      const updatedScans = scans.filter((s) => s.id !== id);
      setScans(updatedScans);
      if (activeScan?.id === id) {
        if (updatedScans.length > 0) {
          const next = await fetchScanDetail(updatedScans[0].id);
          setActiveScan(next);
        } else {
          setActiveScan(null);
        }
      }
      addToast('info', 'Scan Deleted', `Scan ${id} removed from history.`);
    } catch (err: any) {
      setError(`Failed to delete scan: ${err.message}`);
      addToast('error', 'Delete Failed', err.message);
    }
  };

  const handleNavigateToWorkloads = (filters?: {
    namespace?: string;
    search?: string;
    severity?: string;
    category?: string;
    savingsOnly?: boolean;
  }) => {
    if (filters?.namespace !== undefined) setTableNamespaceFilter(filters.namespace);
    if (filters?.search !== undefined) setGlobalSearch(filters.search);
    if (filters?.severity !== undefined) setTableSeverityFilter(filters.severity);
    if (filters?.category !== undefined) setTableCategoryFilter(filters.category);
    if (filters?.savingsOnly !== undefined) setTableSavingsOnly(filters.savingsOnly);
    setCurrentTab('workloads');
  };

  const handleSelectNamespaceFromSummary = (ns: string) => {
    setTableNamespaceFilter(ns);
    setTableCategoryFilter('ALL');
    setCurrentTab('workloads');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased">
      {/* Top Navbar */}
      <Navbar
        clusterStatus={clusterStatus}
        activeScan={activeScan}
        scans={scans}
        isScanning={isScanning}
        scanElapsed={scanElapsed}
        onSelectScan={handleSelectScan}
        onOpenScanModal={() => setIsScanModalOpen(true)}
        globalSearch={globalSearch}
        onGlobalSearchChange={setGlobalSearch}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onRefresh={loadInitialData}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          isOpen={isSidebarOpen}
          clusterStatus={clusterStatus}
          workloadCount={activeScan?.rows?.length ?? 0}
          namespaceCount={namespaces.length}
          scanCount={scans.length}
          isScanning={isScanning}
          scanElapsed={scanElapsed}
          onOpenScanModal={() => setIsScanModalOpen(true)}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-6 py-6 w-full">
          {error && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Prominent Persistent Scan Banner */}
          {isScanning && (
            <div className="mb-6 p-4 rounded-xl border border-blue-200/90 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-blue-50/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
              <div className="flex items-center space-x-3.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm animate-pulse flex-shrink-0">
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-800 tracking-tight">
                      Cluster Rightsizing Scan in Progress
                    </span>
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                      <span>{scanElapsed}s elapsed</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Analyzing Prometheus metric trends and calculating CPU/Memory recommendations across cluster workloads...
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 self-end sm:self-center flex-shrink-0">
                <button
                  onClick={() => setIsScanModalOpen(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold shadow-2xs transition"
                >
                  <Terminal className="w-3.5 h-3.5 text-blue-600" />
                  <span>View Live Logs</span>
                </button>
              </div>
            </div>
          )}

          {/* Initial Loading Screen */}
          {loading && !activeScan && (
            <div className="flex flex-col items-center justify-center py-28 space-y-4 animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              </div>
              <div className="text-center">
                <h3 className="text-sm font-bold text-slate-800">Loading Cluster Rightsizing Data</h3>
                <p className="text-xs text-slate-500 mt-1">Connecting to cluster and loading recommendations...</p>
              </div>
            </div>
          )}

          {/* Empty State when no scans have been performed yet */}
          {!loading && scans.length === 0 && !isScanning && (
            <div className="soft-card p-8 sm:p-12 text-center max-w-xl mx-auto mt-8 space-y-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto shadow-sm">
                <Play className="w-6 h-6 fill-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">No Cluster Scans Yet</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Run your first rightsizing analysis to discover cluster overprovisioning, potential CPU/RAM savings, and Kubernetes container recommendations.
                </p>
              </div>
              <button
                onClick={() => setIsScanModalOpen(true)}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Trigger First Rightsizing Scan</span>
              </button>
            </div>
          )}

          {/* Empty State when scans exist but none is currently selected */}
          {!loading && !activeScan && scans.length > 0 && !isScanning && (
            <div className="soft-card p-8 sm:p-12 text-center max-w-xl mx-auto mt-8 space-y-4 animate-fade-in">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mx-auto shadow-sm">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">No Scan Selected</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Select a past scan from the history or trigger a new rightsizing analysis.
                </p>
              </div>
              <button
                onClick={() => handleSelectScan(scans[0].id)}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
              >
                <RefreshCw className="w-4 h-4 text-white" />
                <span>Load Most Recent Scan</span>
              </button>
            </div>
          )}

          {/* Scanning empty-state placeholder when first scan is running and no data exists yet */}
          {!loading && scans.length === 0 && isScanning && (
            <div className="soft-card p-8 sm:p-12 text-center max-w-xl mx-auto mt-8 space-y-4 animate-fade-in">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mx-auto shadow-sm">
                <RefreshCw className="w-6 h-6 animate-spin text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Analyzing Cluster Workloads</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Your first rightsizing scan is actively running ({scanElapsed}s elapsed). Results will display automatically once completed.
                </p>
              </div>
              <button
                onClick={() => setIsScanModalOpen(true)}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition"
              >
                <Terminal className="w-4 h-4 text-blue-600" />
                <span>Open Execution Terminal</span>
              </button>
            </div>
          )}

          {/* Active Scan Fail Alert */}
          {activeScan?.status === 'failed' && (
            <div className="mb-5 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs space-y-1">
              <div className="flex items-center space-x-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>Scan {activeScan.id} failed during execution</span>
              </div>
              {activeScan.error && (
                <p className="mt-1 font-mono text-[11px] text-rose-700 bg-rose-100/60 p-2.5 rounded-lg overflow-x-auto">
                  {activeScan.error}
                </p>
              )}
            </div>
          )}

          {/* TAB 1: OVERVIEW PAGE (Executive Dashboard) */}
          {currentTab === 'overview' && activeScan && (
            <OverviewView
              rows={activeScan.rows || []}
              score={activeScan.score}
              namespaces={namespaces}
              isScanning={isScanning}
              scanElapsed={scanElapsed}
              onNavigateToWorkloads={handleNavigateToWorkloads}
              onNavigateToNamespaces={() => setCurrentTab('namespaces')}
            />
          )}

          {/* TAB 2: WORKLOADS PAGE (Deep Workload Explorer & Table) */}
          {currentTab === 'workloads' && activeScan && (
            <div className="space-y-4 animate-fade-in">
              <WorkloadsTable
                rows={activeScan.rows || []}
                globalSearch={globalSearch}
                selectedNamespace={tableNamespaceFilter}
                selectedSeverity={tableSeverityFilter}
                selectedCategory={tableCategoryFilter}
                savingsOnly={tableSavingsOnly}
                onClearFilters={() => {
                  setGlobalSearch('');
                  setTableNamespaceFilter('ALL');
                  setTableSeverityFilter('ALL');
                  setTableCategoryFilter('ALL');
                  setTableSavingsOnly(false);
                }}
              />
            </div>
          )}

          {/* TAB 3: NAMESPACES PAGE */}
          {currentTab === 'namespaces' && (
            <NamespacesView
              rows={activeScan?.rows || []}
              onSelectNamespace={handleSelectNamespaceFromSummary}
            />
          )}

          {/* TAB 4: SCAN HISTORY PAGE */}
          {currentTab === 'history' && (
            <HistoryView
              scans={scans}
              activeScanId={activeScan?.id || null}
              onSelectScan={handleSelectScan}
              onDeleteScan={handleDeleteScan}
            />
          )}

          {/* TAB 5: SETTINGS & STATUS PAGE */}
          {currentTab === 'settings' && (
            <SettingsView clusterStatus={clusterStatus} />
          )}
        </main>
      </div>

      {/* Rightsizing Scan Modal / Terminal Drawer */}
      <ScanModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        isScanning={isScanning}
        scanElapsed={scanElapsed}
        logs={scanLogs}
        namespaces={namespaces}
        onTriggerScan={handleTriggerScan}
      />

      {/* Floating Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
