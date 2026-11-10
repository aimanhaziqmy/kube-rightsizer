import React, { useState, useEffect, useCallback } from 'react';
import { 
  fetchStatus, 
  fetchNamespaces, 
  fetchScans, 
  fetchScanDetail, 
  deleteScan 
} from './api';
import { 
  ClusterStatus, 
  ScanDetail, 
  ScanMeta, 
  ViewTab 
} from './types';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { OverviewCards } from './components/OverviewCards';
import { WorkloadsTable } from './components/WorkloadsTable';
import { NamespacesView } from './components/NamespacesView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { ScanModal } from './components/ScanModal';
import { Play, Activity, AlertCircle, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  // State
  const [currentTab, setCurrentTab] = useState<ViewTab>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);

  // Search & Filter sharing
  const [globalSearch, setGlobalSearch] = useState('');
  const [tableNamespaceFilter, setTableNamespaceFilter] = useState('ALL');
  const [tableSeverityFilter, setTableSeverityFilter] = useState('ALL');

  // Backend Data
  const [clusterStatus, setClusterStatus] = useState<ClusterStatus | null>(null);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [scans, setScans] = useState<ScanMeta[]>([]);
  const [activeScan, setActiveScan] = useState<ScanDetail | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial status and scan list
  const loadInitialData = useCallback(async () => {
    try {
      const [statusData, nsData, scansData] = await Promise.all([
        fetchStatus().catch(() => null),
        fetchNamespaces().catch(() => []),
        fetchScans().catch(() => []),
      ]);

      if (statusData) setClusterStatus(statusData);
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

  // Poll status while scan is running
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const st = await fetchStatus();
        setClusterStatus(st);

        // If scan finished running
        if (!st.running && clusterStatus?.running) {
          // Scan just completed
          const updatedScans = await fetchScans();
          setScans(updatedScans);
          if (updatedScans.length > 0) {
            const latest = await fetchScanDetail(updatedScans[0].id);
            setActiveScan(latest);
          }
        }
      } catch (e) {
        console.error('Failed to poll status', e);
      }
    };

    if (clusterStatus?.running) {
      timer = setInterval(poll, 3000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [clusterStatus?.running]);

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
    } catch (err: any) {
      setError(`Failed to delete scan: ${err.message}`);
    }
  };

  const handleScanCompleted = async () => {
    try {
      const updatedScans = await fetchScans();
      setScans(updatedScans);
      if (updatedScans.length > 0) {
        const detail = await fetchScanDetail(updatedScans[0].id);
        setActiveScan(detail);
      }
      const st = await fetchStatus();
      setClusterStatus(st);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectNamespaceFromSummary = (ns: string) => {
    setTableNamespaceFilter(ns);
    setCurrentTab('workloads');
  };

  const handleFilterSeverityFromCard = (sev: string) => {
    setTableSeverityFilter(sev);
    setCurrentTab('workloads');
  };

  const isScanning = Boolean(clusterStatus?.running);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased">
      {/* Top Navbar */}
      <Navbar
        clusterStatus={clusterStatus}
        activeScan={activeScan}
        scans={scans}
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
          onOpenScanModal={() => setIsScanModalOpen(true)}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
          {error && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between">
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

          {/* Empty State when no scans have been performed yet */}
          {!loading && scans.length === 0 && (
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

          {/* Active Views */}
          {(currentTab === 'overview' || currentTab === 'workloads') && activeScan && (
            <div>
              {activeScan.status === 'failed' && (
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

              {/* Overview Summary Cards */}
              <OverviewCards
                rows={activeScan.rows || []}
                score={activeScan.score}
                onFilterSeverity={handleFilterSeverityFromCard}
              />

              {/* Main Workloads & Recommendations Data Table */}
              <WorkloadsTable
                rows={activeScan.rows || []}
                globalSearch={globalSearch}
                selectedNamespace={tableNamespaceFilter}
                selectedSeverity={tableSeverityFilter}
                onClearFilters={() => {
                  setTableNamespaceFilter('ALL');
                  setTableSeverityFilter('ALL');
                }}
              />
            </div>
          )}

          {currentTab === 'namespaces' && (
            <NamespacesView
              rows={activeScan?.rows || []}
              onSelectNamespace={handleSelectNamespaceFromSummary}
            />
          )}

          {currentTab === 'history' && (
            <HistoryView
              scans={scans}
              activeScanId={activeScan?.id || null}
              onSelectScan={handleSelectScan}
              onDeleteScan={handleDeleteScan}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView clusterStatus={clusterStatus} />
          )}
        </main>
      </div>

      {/* Rightsizing Scan Modal / Terminal Drawer */}
      <ScanModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        clusterStatus={clusterStatus}
        namespaces={namespaces}
        onScanCompleted={handleScanCompleted}
      />
    </div>
  );
};
