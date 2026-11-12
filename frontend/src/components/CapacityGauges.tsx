import React from 'react';
import { Info } from 'lucide-react';
import { ClusterCapacity, ScanMeta } from '../types';
import {
  buildCapacityGauge,
  CapacityKind,
  CapacityMetric,
  formatCapacityCpu,
  formatCapacityMem,
} from '../utils/capacity';
import { formatTimestamp } from '../utils/formatters';

interface CapacityGaugesProps {
  capacity?: ClusterCapacity | null;
  scan?: ScanMeta | null;
}

const RING_COLORS = {
  usage: '#f59e0b',
  request: '#0d9488',
  limit: '#334155',
};

const LEGEND_ORDER: Array<{ key: 'usage' | 'request' | 'limit'; label: string }> = [
  { key: 'usage', label: 'Usage' },
  { key: 'request', label: 'Request' },
  { key: 'limit', label: 'Limit' },
];

function formatValue(kind: CapacityKind, value: number | null): string {
  return kind === 'cpu' ? formatCapacityCpu(value) : formatCapacityMem(value);
}

function percentClass(metric: CapacityMetric): string {
  if (metric.percent === null) return 'text-slate-400';
  if (metric.percent > 100) return 'text-rose-600';
  return 'text-emerald-600';
}

const CapacityCard: React.FC<{
  kind: CapacityKind;
  capacity: ClusterCapacity;
  scan?: ScanMeta | null;
}> = ({ kind, capacity, scan }) => {
  const gauge = buildCapacityGauge(capacity, kind);
  const title = kind === 'cpu' ? 'Cluster CPU' : 'Cluster Memory';
  const hasAllocatable = gauge.allocatable !== null && gauge.allocatable > 0;

  const rings = [
    { key: 'limit' as const, radius: 70, color: RING_COLORS.limit, metric: gauge.limit },
    { key: 'request' as const, radius: 57, color: RING_COLORS.request, metric: gauge.request },
    { key: 'usage' as const, radius: 44, color: RING_COLORS.usage, metric: gauge.usage },
  ];

  const timestamp = capacity.collected_at || scan?.finished || scan?.started;
  const lookbackDays =
    capacity.lookback_hours && capacity.lookback_hours > 0
      ? Math.round(capacity.lookback_hours / 24)
      : null;
  const metaParts = [
    timestamp ? `as of ${formatTimestamp(timestamp)}` : null,
    lookbackDays ? `usage avg over last ${lookbackDays}d` : null,
  ].filter(Boolean);

  const ariaParts = LEGEND_ORDER.map(({ key, label }) => {
    const metric = gauge[key];
    return `${label} ${formatValue(kind, metric.value)} ${
      metric.percent === null ? 'unavailable' : `${Math.round(metric.percent)} percent`
    }`;
  });

  return (
    <div className="soft-card p-5" data-testid={`capacity-card-${kind}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Usage, request and limit vs allocatable
          </p>
          {metaParts.length > 0 && (
            <p className="text-[11px] text-slate-400 mt-1">{metaParts.join(' · ')}</p>
          )}
        </div>
        <Info
          className="w-4 h-4 text-slate-300 flex-shrink-0"
          aria-label={`${title} capacity snapshot details`}
        />
      </div>

      <div className="mt-3">
        <svg
          viewBox="0 0 180 180"
          className="w-full max-w-[220px] mx-auto"
          role="img"
          aria-label={`${title}: ${ariaParts.join(', ')}`}
        >
          <title>
            {title}: {ariaParts.join(', ')}
          </title>
          {rings.map((ring) => {
            const circumference = 2 * Math.PI * ring.radius;
            return (
              <g key={ring.key}>
                <circle
                  cx="90"
                  cy="90"
                  r={ring.radius}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="9"
                />
                {ring.metric.percent !== null && ring.metric.percent > 0 && (
                  <circle
                    cx="90"
                    cy="90"
                    r={ring.radius}
                    fill="none"
                    stroke={ring.color}
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={`${
                      (ring.metric.cappedPercent / 100) * circumference
                    } ${circumference}`}
                    transform="rotate(-90 90 90)"
                    data-testid={`capacity-${kind}-${ring.key}-arc`}
                  />
                )}
              </g>
            );
          })}
          <text
            x="90"
            y="86"
            textAnchor="middle"
            className="fill-slate-800"
            style={{
              fontSize: gauge.centerLabel.length > 9 ? 15 : gauge.centerLabel.length > 6 ? 18 : 22,
              fontWeight: 700,
            }}
            data-testid={`capacity-${kind}-center`}
          >
            {hasAllocatable ? gauge.centerLabel : 'unavailable'}
          </text>
          <text x="90" y="104" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9 }}>
            allocatable
          </text>
        </svg>
      </div>

      <div className="mt-3 space-y-2">
        {LEGEND_ORDER.map(({ key, label }) => {
          const metric = gauge[key];
          return (
            <div key={key} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: RING_COLORS[key] }}
                />
                <span className="text-slate-500">{label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="font-medium text-slate-700"
                  data-testid={`capacity-${kind}-${key}-value`}
                >
                  {formatValue(kind, metric.value)}
                </span>
                <span
                  className={`font-semibold ${percentClass(metric)}`}
                  data-testid={`capacity-${kind}-${key}-percent`}
                >
                  {metric.percent === null ? '—' : `${Math.round(metric.percent)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const CapacityGauges: React.FC<CapacityGaugesProps> = ({ capacity, scan }) => {
  if (!capacity || (!capacity.cpu && !capacity.memory)) {
    return (
      <div className="soft-card p-6 text-center" data-testid="capacity-empty">
        <h3 className="text-sm font-bold text-slate-800">Cluster Capacity</h3>
        <p className="text-xs text-slate-500 mt-1">
          Capacity data unavailable. Run a new scan to populate cluster capacity.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="capacity-gauges">
      <CapacityCard kind="cpu" capacity={capacity} scan={scan} />
      <CapacityCard kind="memory" capacity={capacity} scan={scan} />
    </div>
  );
};
