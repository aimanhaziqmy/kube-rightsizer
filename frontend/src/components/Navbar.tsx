import React from 'react';
import { 
  Menu, 
  Search, 
  Bell, 
  HelpCircle, 
  Layers, 
  ChevronDown, 
  RefreshCw,
  Activity,
  Play
} from 'lucide-react';
import { ClusterStatus, ScanMeta } from '../types';

interface NavbarProps {
  clusterStatus: ClusterStatus | null;
  activeScan: ScanMeta | null;
  scans: ScanMeta[];
  isScanning: boolean;
  scanElapsed: number;
  onSelectScan: (id: string) => void;
  onOpenScanModal: () => void;
  globalSearch?: string;
  onGlobalSearchChange?: (q: string) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onRefresh: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  clusterStatus,
  activeScan,
  scans,
  isScanning,
  scanElapsed,
  onSelectScan,
  onOpenScanModal,
  globalSearch,
  onGlobalSearchChange,
  isSidebarOpen,
  onToggleSidebar,
  onRefresh,
}) => {
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
            <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200/60">
              v{__APP_VERSION__}
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

      {/* Middle: Flexible spacer */}
      <div className="flex-1" />

      {/* Right: Actions, Scan Pill, and Profile */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Active Scan Indicator or Past Scan Selector */}
        {isScanning ? (
          <button
            onClick={onOpenScanModal}
            className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold animate-pulse cursor-pointer shadow-2xs transition"
            title="Scan in progress - Click to view live logs"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
            <span>Scan Active ({scanElapsed}s)</span>
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

        {/* Scan Button in Navbar */}
        {isScanning ? (
          <button
            disabled
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 text-xs font-semibold cursor-not-allowed select-none shadow-2xs"
            title="Scan is currently running in background"
          >
            <Play className="w-3.5 h-3.5 fill-slate-300 text-slate-300" />
            <span>Scan Cluster</span>
          </button>
        ) : (
          <button
            onClick={onOpenScanModal}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
            title="Trigger rightsizing scan"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Scan Cluster</span>
          </button>
        )}

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition"
          title="Refresh scan data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Documentation */}
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
