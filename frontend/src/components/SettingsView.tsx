import React from 'react';
import { 
  Settings, 
  Server, 
  Database, 
  Shield, 
  Cpu, 
  ExternalLink, 
  Layers, 
  CheckCircle2, 
  Info,
  Clock,
  FolderTree
} from 'lucide-react';
import { ClusterStatus } from '../types';

interface SettingsViewProps {
  clusterStatus: ClusterStatus | null;
  activeNamespacesCount?: number;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ clusterStatus, activeNamespacesCount }) => {
  return (
    <div className="w-full space-y-6 mb-8">
      <div>
        <h2 className="text-base font-bold text-slate-800">Console Settings & Architecture</h2>
        <p className="text-xs text-slate-500">
          Environment configuration, engine details, and cluster connectivity status
        </p>
      </div>

      {/* Cluster & Engine Overview */}
      <div className="soft-card p-5 space-y-4">
        <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Cluster & Engine Details</h3>
            <p className="text-xs text-slate-500">Active deployment runtime environment</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <span className="text-slate-400 font-medium block mb-1">Target Cluster</span>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="font-semibold text-slate-800">
                {clusterStatus?.cluster_name || 'In-Cluster Kubernetes'}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <span className="text-slate-400 font-medium block mb-1">Underlying Engine</span>
            <div className="flex items-center space-x-2">
              <Cpu className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-semibold text-slate-800">
                Robusta KRR (Kubernetes Resource Recommender) v1.31
              </span>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <span className="text-slate-400 font-medium block mb-1">Discovered Namespaces</span>
            <div className="font-semibold text-slate-800">
              {clusterStatus?.namespaces_count ?? 0} Discovered Namespaces
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {activeNamespacesCount !== undefined && activeNamespacesCount > 0
                ? `${activeNamespacesCount} with analyzed workloads · ${(clusterStatus?.namespaces_count ?? 0) - activeNamespacesCount} system/empty namespaces`
                : 'Discovered via Kubernetes Core API core_v1.list_namespace()'}
            </p>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <span className="text-slate-400 font-medium block mb-1">Archived Scans Retention</span>
            <div className="font-semibold text-slate-800">
              {clusterStatus?.total_scans ?? 0} archived (auto-pruned after 30 scans)
            </div>
          </div>
        </div>
      </div>

      {/* Cluster Namespaces & Scope Architecture Note */}
      <div className="soft-card p-5 space-y-3">
        <div className="flex items-center space-x-2.5 pb-2 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <FolderTree className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Cluster Namespace Architecture</h3>
            <p className="text-xs text-slate-500">How discovered namespaces map to rightsizing recommendations</p>
          </div>
        </div>
        <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
          <p>
            • <strong>Discovered Namespaces ({clusterStatus?.namespaces_count ?? 0}):</strong> The backend queries the Kubernetes Core API (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">core_v1.list_namespace()</code>) to discover every real namespace in your cluster (including Rancher, Fleet, cert-manager, and system namespaces).
          </p>
          <p>
            • <strong>Namespaces with Analyzed Workloads ({activeNamespacesCount ?? 0}):</strong> Robusta KRR scans running Deployments, StatefulSets, and DaemonSets. Namespaces that only host custom resource definitions, static pods, or zero workloads appear in the Namespaces breakdown with 0 container allocations.
          </p>
          <p>
            • <strong>Production Guarantee:</strong> All scan results, namespaces, and resource metrics are queried live from your cluster and Prometheus. Zero synthetic, mock, or fake data is ever returned.
          </p>
        </div>
      </div>

      {/* Recommended Sizing Strategy */}
      <div className="soft-card p-5 space-y-4">
        <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Default Rightsizing Strategy</h3>
            <p className="text-xs text-slate-500">KRR statistical recommendation formulas</p>
          </div>
        </div>

        <div className="space-y-3 text-xs text-slate-600">
          <div className="flex items-start space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-slate-800">CPU Requests (Percentile Model):</strong>
              <p className="text-slate-500 mt-0.5">
                Calculates the 95th percentile of CPU usage over the specified history duration (default 14 days). This accommodates traffic spikes while eliminating idle headroom.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-slate-800">Memory Requests & Limits (Headroom Buffer):</strong>
              <p className="text-slate-500 mt-0.5">
                Takes the absolute maximum RSS memory observed over the lookback period and applies a safety buffer (default +15%) to avoid OOMKills.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            <div>
              <strong className="text-slate-800">HPA Awareness:</strong>
              <p className="text-slate-500 mt-0.5">
                Workloads governed by Horizontal Pod Autoscalers (HPA) are automatically flagged to ensure resource recommendations align with autoscaling metric thresholds.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Open Source Notice */}
      <div className="soft-card p-5 bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/30">
        <div className="flex items-center space-x-2 mb-2">
          <Shield className="w-4 h-4 text-blue-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Open Source & Community
          </h3>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed mb-3">
          <strong>kube-rightsizer</strong> is a modern open-source web console providing holistic Kubernetes resource recommendations. Powered by the open-source Robusta KRR project and Prometheus monitoring.
        </p>
        <div className="flex items-center space-x-4 text-xs font-medium text-blue-600">
          <a
            href="https://github.com/robusta-dev/krr"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1 hover:underline"
          >
            <span>Robusta KRR Engine</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href="https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1 hover:underline"
          >
            <span>Kubernetes Resource Management</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
