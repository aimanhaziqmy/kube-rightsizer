import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Play, 
  Terminal, 
  Sliders, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Copy, 
  Check, 
  FolderTree,
  Activity,
  Layers
} from 'lucide-react';
import { ClusterStatus, ScanParams } from '../types';
import { triggerScan, subscribeLiveLogs } from '../api';

interface ScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  clusterStatus: ClusterStatus | null;
  namespaces: string[];
  onScanCompleted: () => void;
}

export const ScanModal: React.FC<ScanModalProps> = ({
  isOpen,
  onClose,
  clusterStatus,
  namespaces,
  onScanCompleted,
}) => {
  const isScanning = Boolean(clusterStatus?.running);

  // Form states
  const [cpuPercentile, setCpuPercentile] = useState<number>(95);
  const [memoryBuffer, setMemoryBuffer] = useState<number>(15);
  const [historyDays, setHistoryDays] = useState<number>(14);
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([]);
  const [allNamespacesChecked, setAllNamespacesChecked] = useState(true);

  // SSE Live Logs
  const [logs, setLogs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedLogs, setCopiedLogs] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to live SSE logs when scanning
  useEffect(() => {
    if (!isOpen) return;

    // Load any initial backlog from clusterStatus if available
    if (clusterStatus?.log && clusterStatus.log.length > 0) {
      setLogs((prev) => (prev.length === 0 ? clusterStatus.log : prev));
    }

    const unsubscribe = subscribeLiveLogs(
      (line) => {
        setLogs((prev) => [...prev, line]);
      },
      (status) => {
        if (status === 'done' || status === 'failed') {
          onScanCompleted();
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isOpen, isScanning, onScanCompleted]);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  if (!isOpen) return null;

  const handleStartScan = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    setLogs([]);

    const params: ScanParams = {
      cpu_percentile: cpuPercentile,
      memory_buffer_percentage: memoryBuffer,
      history_days: historyDays,
      namespaces: allNamespacesChecked ? [] : selectedNamespaces,
    };

    try {
      await triggerScan(params);
      // Wait for SSE streaming
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start scan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n')).then(() => {
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    });
  };

  const toggleNamespace = (ns: string) => {
    setSelectedNamespaces((prev) =>
      prev.includes(ns) ? prev.filter((item) => item !== ns) : [...prev, ns]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-soft-lg border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                {isScanning ? 'Scan in Progress' : 'Start Rightsizing Scan'}
              </h2>
              <p className="text-[11px] text-slate-500">
                Tune resource percentile parameters and inspect live execution logs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form settings */}
          <div className="space-y-4">
            {/* Grid of parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* CPU Percentile */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CPU Percentile: <span className="text-blue-600">{cpuPercentile}%</span>
                </label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="1"
                  disabled={isScanning}
                  value={cpuPercentile}
                  onChange={(e) => setCpuPercentile(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer disabled:opacity-50"
                />
                <span className="block text-[10px] text-slate-400 mt-1">
                  Standard recommendation is 95th percentile.
                </span>
              </div>

              {/* Memory Buffer */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Memory Buffer: <span className="text-blue-600">+{memoryBuffer}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  disabled={isScanning}
                  value={memoryBuffer}
                  onChange={(e) => setMemoryBuffer(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer disabled:opacity-50"
                />
                <span className="block text-[10px] text-slate-400 mt-1">
                  Safety headroom above historical peak.
                </span>
              </div>

              {/* History Duration */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  History Window
                </label>
                <select
                  disabled={isScanning}
                  value={historyDays}
                  onChange={(e) => setHistoryDays(Number(e.target.value))}
                  className="w-full text-xs bg-white border border-slate-200 rounded-md py-1.5 px-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value={1}>1 Day (Quick check)</option>
                  <option value={7}>7 Days (1 Week)</option>
                  <option value={14}>14 Days (Standard)</option>
                  <option value={30}>30 Days (Comprehensive)</option>
                </select>
                <span className="block text-[10px] text-slate-400 mt-1">
                  Prometheus metrics lookback range.
                </span>
              </div>
            </div>

            {/* Namespaces selector */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700">Target Namespaces</label>
                <label className="flex items-center space-x-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allNamespacesChecked}
                    disabled={isScanning}
                    onChange={(e) => setAllNamespacesChecked(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 disabled:opacity-50"
                  />
                  <span>Scan entire cluster</span>
                </label>
              </div>

              {!allNamespacesChecked && (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                  {namespaces.map((ns) => {
                    const isChecked = selectedNamespaces.includes(ns);
                    return (
                      <button
                        key={ns}
                        type="button"
                        disabled={isScanning}
                        onClick={() => toggleNamespace(ns)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition ${
                          isChecked
                            ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {ns}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Terminal / SSE Stream View */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center space-x-1.5 font-medium">
                <Terminal className="w-3.5 h-3.5 text-slate-500" />
                <span>Live Execution Terminal</span>
                {isScanning && (
                  <span className="flex items-center space-x-1 text-amber-600 text-[11px] font-semibold animate-pulse ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>Streaming ({clusterStatus?.elapsed ?? 0}s)</span>
                  </span>
                )}
              </div>
              {logs.length > 0 && (
                <button
                  onClick={handleCopyLogs}
                  className="flex items-center space-x-1 text-[11px] text-slate-500 hover:text-slate-800 transition"
                >
                  {copiedLogs ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span className="text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Output</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="bg-slate-900 text-slate-200 rounded-lg p-3 font-mono text-[11px] h-48 overflow-y-auto leading-relaxed border border-slate-800 shadow-inner">
              {logs.length === 0 ? (
                <div className="text-slate-500 italic py-8 text-center">
                  Terminal idle. Click "Trigger Rightsizing Scan" to execute analysis.
                </div>
              ) : (
                logs.map((line, idx) => (
                  <div key={idx} className="whitespace-pre-wrap break-all hover:bg-slate-800/40 px-1 rounded">
                    <span className="text-slate-500 select-none mr-2">›</span>
                    <span>{line}</span>
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            {isScanning ? 'Scan running in background...' : 'Ready to analyze cluster resource utilization.'}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              {isScanning ? 'Run in Background' : 'Close'}
            </button>

            {!isScanning && (
              <button
                onClick={handleStartScan}
                disabled={submitting}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition shadow-sm disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{submitting ? 'Initializing...' : 'Trigger Scan'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
