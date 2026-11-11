import React from 'react';
import { UsagePercentiles } from '../types';
import { isNumeric } from '../utils/formatters';

interface UsageStripProps {
  /** Resource label, e.g. "CPU" or "Memory". */
  title: string;
  /** Measured percentiles; undefined/empty for pre-v1.1.0 scans or no data. */
  usage?: UsagePercentiles | null;
  /** Current allocation value (marker on the bar), raw units. */
  currentValue?: number | null;
  /** Recommended value (marker on the bar), raw units. */
  recommendedValue?: number | null;
  /** Percentile key the engine's CPU basis is configured at ("p95"). */
  highlightKey?: string;
  format: (v: number) => string;
}

const TICK_KEYS = ['p50', 'p90', 'p95', 'p99'];

const pct = (v: number, max: number) => Math.max(0, Math.min(100, (v / max) * 100));

/**
 * Horizontal strip visualizing measured usage distribution vs current and
 * recommended allocation. Pure evidence display — no invented numbers.
 */
export const UsageStrip: React.FC<UsageStripProps> = ({
  title,
  usage,
  currentValue,
  recommendedValue,
  highlightKey,
  format,
}) => {
  const values = usage ? Object.values(usage).filter(isNumeric) : [];
  const extras = [currentValue, recommendedValue].filter(isNumeric) as number[];
  const maxVal = Math.max(...values, ...extras, 0);

  if (!usage || values.length === 0 || maxVal <= 0) {
    return (
      <div data-testid="usage-strip-empty">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{title}</div>
        <p className="text-xs text-slate-400 italic">
          Raw usage data not captured in this scan (pre-v1.1.0) or no Prometheus data. Run a new scan to see the evidence.
        </p>
      </div>
    );
  }

  const ticks = TICK_KEYS.filter((k) => isNumeric(usage[k])).map((k) => ({ key: k, value: usage[k] as number }));
  const highlight = highlightKey && isNumeric(usage[highlightKey]) ? { key: highlightKey, value: usage[highlightKey] as number } : null;

  return (
    <div data-testid="usage-strip">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{title}</div>
        <div className="text-[10px] text-slate-400">
          max {format(maxVal)}
        </div>
      </div>

      <div className="relative h-5 rounded bg-slate-100 border border-slate-200 overflow-visible" title="Measured usage distribution (max across pods)">
        {/* Measured p50→p99 band */}
        {ticks.length >= 2 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-blue-200"
            style={{ left: `${pct(ticks[0].value, maxVal)}%`, width: `${pct(ticks[ticks.length - 1].value, maxVal) - pct(ticks[0].value, maxVal)}%` }}
          />
        )}

        {/* Percentile ticks */}
        {ticks.map((t) => (
          <div
            key={t.key}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-px h-3.5 bg-blue-400"
            style={{ left: `${pct(t.value, maxVal)}%` }}
            title={`${t.key}: ${format(t.value)}`}
          />
        ))}

        {/* Highlighted engine basis percentile */}
        {highlight && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1 h-4 rounded-full bg-blue-600"
            style={{ left: `${pct(highlight.value, maxVal)}%` }}
            title={`${highlight.key} (engine basis): ${format(highlight.value)}`}
          />
        )}

        {/* Current allocation marker */}
        {isNumeric(currentValue) && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-slate-500 border border-white"
            style={{ left: `${pct(currentValue as number, maxVal)}%` }}
            title={`Current: ${format(currentValue as number)}`}
          />
        )}

        {/* Recommended marker */}
        {isNumeric(recommendedValue) && (
          <div
            className="absolute top-0 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-600 border border-white"
            style={{ left: `${pct(recommendedValue as number, maxVal)}%` }}
            title={`Recommended: ${format(recommendedValue as number)}`}
          />
        )}
      </div>

      <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-1 h-2.5 bg-blue-400 rounded-full" /> measured percentiles
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rotate-45 bg-slate-500" /> current
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" /> recommended
        </span>
      </div>
    </div>
  );
};
