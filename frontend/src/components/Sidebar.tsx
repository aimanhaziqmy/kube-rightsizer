import React from 'react';
import { 
  LayoutDashboard, 
  Layers, 
  FolderTree, 
  History, 
  Settings, 
  Play, 
  RefreshCw,
  Activity,
  CheckCircle2,
  AlertCircle,
  Server,
  TrendingUp
} from 'lucide-react';
import { ViewTab, ClusterStatus } from '../types';

interface SidebarProps {
  currentTab: ViewTab;
  onSelectTab: (tab: ViewTab) => void;
  isOpen: boolean;
  clusterStatus: ClusterStatus | null;
  workloadCount: number;
  namespaceCount: number;
  activeNamespaceCount?: number;
  scanCount: number;
  isScanning: boolean;
  scanElapsed: number;
  onOpenScanModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpen,
  clusterStatus,
  workloadCount,
  namespaceCount,
  activeNamespaceCount,
  scanCount,
  isScanning,
  scanElapsed,
  onOpenScanModal,
}) => {
  const navItems = [
    {
      id: 'overview' as ViewTab,
      label: 'Overview',
      icon: LayoutDashboard,
      badge: null,
      tooltip: 'Executive Overview',
    },
    {
      id: 'workloads' as ViewTab,
      label: 'Workloads',
      icon: Layers,
      badge: workloadCount > 0 ? workloadCount : null,
      tooltip: `${workloadCount} analyzed container workloads`,
    },
    {
      id: 'namespaces' as ViewTab,
      label: 'Namespaces',
      icon: FolderTree,
      badge:
        namespaceCount > 0
          ? activeNamespaceCount !== undefined && activeNamespaceCount > 0 && activeNamespaceCount !== namespaceCount
            ? `${activeNamespaceCount} / ${namespaceCount}`
            : namespaceCount
          : null,
      tooltip:
        activeNamespaceCount !== undefined && activeNamespaceCount > 0
          ? `${namespaceCount} Cluster Namespaces (${activeNamespaceCount} with analyzed workloads)`
          : `${namespaceCount} cluster namespaces`,
    },
    {
      id: 'trends' as ViewTab,
      label: 'Trends',
      icon: TrendingUp,
      badge: scanCount >= 2 ? `${scanCount}` : null,
      tooltip: 'Cross-scan trends and drift detection',
    },
    {
      id: 'history' as ViewTab,
      label: 'Scan History',
      icon: History,
      badge: scanCount > 0 ? scanCount : null,
      tooltip: `${scanCount} historical scan reports`,
    },
    {
      id: 'settings' as ViewTab,
      label: 'Settings & Status',
      icon: Settings,
      badge: null,
      tooltip: 'Cluster Engine & Settings',
    },
  ];

  return (
    <aside
      className={`fixed lg:static top-14 left-0 bottom-0 z-20 flex flex-col bg-white border-r border-slate-200 transition-all duration-200 select-none ${
        isOpen ? 'w-64' : 'w-0 lg:w-16'
      } overflow-hidden`}
    >
      {/* Top Action: New Scan Button */}
      <div className="p-3">
        <button
          onClick={onOpenScanModal}
          className={`w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg font-medium text-xs transition shadow-sm ${
            isScanning
              ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
          title={isScanning ? "Scan in progress - click to view live logs" : "Trigger a new rightsizing scan"}
        >
          {isScanning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              {isOpen && <span>Scanning ({scanElapsed}s)...</span>}
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              {isOpen && <span>Start Scan</span>}
            </>
          )}
        </button>
      </div>

      {/* Main Navigation Items */}
      <div className="flex-1 px-3 py-1 space-y-1 overflow-y-auto">
        <div className="text-[11px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
          {isOpen ? 'Navigation' : ''}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title={item.tooltip || (!isOpen ? item.label : undefined)}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 flex-shrink-0 ${
                    isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                {isOpen && <span className="truncate">{item.label}</span>}
              </div>

              {isOpen && item.badge !== null && (
                <span
                  title={item.tooltip}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    isActive
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer / Cluster Status Card */}
      {isOpen ? (
        <div className="p-3 border-t border-slate-200">
          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Cluster Engine
              </span>
              <span className="flex items-center space-x-1 text-[11px] text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Active</span>
              </span>
            </div>
            <div className="text-slate-700 font-medium truncate flex items-center space-x-1.5">
              <Server className="w-3.5 h-3.5 text-slate-400" />
              <span>{clusterStatus?.cluster_name || 'Kubernetes'}</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500 flex justify-between">
              <span>Namespaces:</span>
              <span className="font-medium text-slate-700">{namespaceCount}</span>
            </div>
            <div className="text-[11px] text-slate-500 flex justify-between">
              <span>Scans Stored:</span>
              <span className="font-medium text-slate-700">{scanCount}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-2 border-t border-slate-200 flex justify-center">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="Cluster Connected" />
        </div>
      )}
    </aside>
  );
};
