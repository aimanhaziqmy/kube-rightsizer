import React from 'react';
import { 
  Menu, 
  Search, 
  Bell, 
  HelpCircle, 
  Settings, 
  Layers, 
  ChevronDown, 
  RefreshCw,
  Activity
} from 'lucide-react';
import { ClusterStatus, ScanMeta } from '../types';

interface NavbarProps {
  clusterStatus: ClusterStatus | null;
  activeScan: ScanMeta | null;
  scans: ScanMeta[];
  onSelectScan: (id: string) => void;
  onOpenScanModal: () => void;
  globalSearch: string;
  onGlobalSearchChange: (q: string) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onRefresh: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  clusterStatus,
  activeScan,
  scans,
  onSelectScan,
  onOpenScanModal,
  globalSearch,
  onGlobalSearchChange,
  isSidebarOpen,
  onToggleSidebar,
  onRefresh,
}) => {
  const isScanning = Boolean(clusterStatus?.running);

  return (
    <header className="h-14 bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between px-4 select-none">
      {/* Left: Hamburger & Brand */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
          title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-label="Toggle navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Project Brand */}
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <Layers className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-900 text-sm tracking-tight">kube-rightsizer</span>
            <span className="text-[11px] font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200/60">
              v1.31
            </span>
          </div>
        </div>

        {/* Cluster / Context Selector */}
        <div className="hidden md:flex items-center ml-4 pl-4 border-l border-slate-200 text-xs text-slate-600">
          <div className="flex items-center space-x-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-md cursor-pointer transition">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-medium text-slate-700">
              {clusterStatus?.cluster_name || "default-cluster"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Middle: Global Search */}
      <div className="flex-1 max-w-md mx-6 hidden sm:block">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => onGlobalSearchChange(e.target.value)}
            placeholder="Search in all environments..."
            className="w-full bg-slate-50 focus:bg-white text-xs text-slate-800 placeholder-slate-400 pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition shadow-inner"
          />
        </div>
      </div>

      {/* Right: Actions, Scan Pill, and Profile */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Active Scan Indicator / Selector */}
        {isScanning ? (
          <button
            onClick={onOpenScanModal}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium animate-pulse cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
            <span>Scanning ({clusterStatus?.elapsed || 0}s)</span>
          </button>
        ) : scans.length > 0 ? (
          <div className="hidden lg:flex items-center space-x-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={activeScan?.id || ''}
              onChange={(e) => onSelectScan(e.target.value)}
              className="bg-transparent text-slate-700 text-xs font-medium focus:outline-none cursor-pointer pr-1"
            >
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.started * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · p{s.params.cpu_percentile} ({s.containers ?? 0} ct)
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition"
          title="Refresh scan data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Notifications / Help */}
        <button
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition relative"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
        </button>

        <a
          href="https://github.com/robusta-dev/krr"
          target="_blank"
          rel="noreferrer"
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition"
          title="Documentation"
        >
          <HelpCircle className="w-4 h-4" />
        </a>

        {/* Profile Avatar Pill */}
        <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
          <div className="w-7 h-7 rounded-full bg-blue-700 text-white flex items-center justify-center font-medium text-xs shadow-sm">
            KS
          </div>
          <span className="hidden xl:inline text-xs font-medium text-slate-700">Admin</span>
        </div>
      </div>
    </header>
  );
};
