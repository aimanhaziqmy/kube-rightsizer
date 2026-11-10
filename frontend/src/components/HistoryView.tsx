import React, { useState } from 'react';
import { 
  History, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Activity, 
  Clock, 
  Sliders, 
  ArrowRight,
  Eye
} from 'lucide-react';
import { ScanMeta } from '../types';
import { formatTimestamp, formatDuration } from '../utils/formatters';

interface HistoryViewProps {
  scans: ScanMeta[];
  activeScanId: string | null;
  onSelectScan: (id: string) => void;
  onDeleteScan: (id: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  scans,
  activeScanId,
  onSelectScan,
  onDeleteScan,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">Scan Execution History</h2>
          <p className="text-xs text-slate-500">
            Historical records of resource optimization scans and benchmark results
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
          {scans.length} Scans Archived
        </span>
      </div>

      <div className="soft-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse soft-table">
          <thead>
            <tr>
              <th>Scan ID / Time</th>
              <th>Status</th>
              <th>Containers</th>
              <th>Duration</th>
              <th>Tuning Parameters</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {scans.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-1.5">
                    <History className="w-6 h-6 text-slate-400" />
                    <p className="text-xs font-medium text-slate-600">No scans recorded yet</p>
                    <p className="text-[11px] text-slate-400">Trigger a new scan to get started.</p>
                  </div>
                </td>
              </tr>
            ) : (
              scans.map((s) => {
                const isActive = s.id === activeScanId;
                const isRunning = s.status === 'running';
                const isFailed = s.status === 'failed';

                return (
                  <tr key={s.id} className={isActive ? 'bg-blue-50/40' : ''}>
                    {/* ID & Timestamp */}
                    <td>
                      <div className="flex flex-col">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-semibold text-slate-800">
                            {s.id}
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 mt-0.5">
                          {formatTimestamp(s.started)}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      {isRunning ? (
                        <span className="inline-flex items-center space-x-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium animate-pulse">
                          <Activity className="w-3 h-3 animate-spin text-amber-600" />
                          <span>Running</span>
                        </span>
                      ) : isFailed ? (
                        <span className="inline-flex items-center space-x-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-medium">
                          <AlertCircle className="w-3 h-3 text-rose-500" />
                          <span>Failed</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span>Done</span>
                        </span>
                      )}
                    </td>

                    {/* Containers */}
                    <td>
                      <span className="font-semibold text-xs text-slate-700">
                        {s.containers ?? 0}
                      </span>
                    </td>

                    {/* Duration */}
                    <td>
                      <span className="text-xs text-slate-600 font-mono">
                        {formatDuration(s.duration)}
                      </span>
                    </td>

                    {/* Tuning Parameters */}
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                          CPU: p{s.params?.cpu_percentile ?? 95}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                          Mem: +{s.params?.memory_buffer_percentage ?? 15}%
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                          Days: {s.params?.history_days ?? 14}d
                        </span>
                        {s.params?.namespaces && s.params.namespaces.length > 0 && (
                          <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                            {s.params.namespaces.length} namespaces
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="text-right pr-4">
                      <div className="flex items-center justify-end space-x-2">
                        {!isActive && (
                          <button
                            onClick={() => onSelectScan(s.id)}
                            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-xs font-medium text-slate-700 hover:text-blue-700 transition"
                            title="Load scan results"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                        )}

                        {confirmDeleteId === s.id ? (
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => {
                                onDeleteScan(s.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-0.5 bg-rose-600 text-white rounded text-[11px] font-medium hover:bg-rose-700 transition"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] hover:bg-slate-200 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(s.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition"
                            title="Delete scan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};
