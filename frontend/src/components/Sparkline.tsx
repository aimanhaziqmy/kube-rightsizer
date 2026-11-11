import React from 'react';
import { isNumeric } from '../utils/formatters';

interface SparklineProps {
  values: (number | null)[];
  started: number[];
  /** Optional value formatter for dot titles. */
  format?: (v: number) => string;
  width?: number;
  height?: number;
}

/**
 * Tiny hand-rolled SVG sparkline (no chart library). Null values create
 * gaps: the line connects only consecutive non-null points.
 */
export const Sparkline: React.FC<SparklineProps> = ({
  values,
  started,
  format = (v) => String(v),
  width = 120,
  height = 28,
}) => {
  const idxs = values
    .map((v, i) => (isNumeric(v) ? i : -1))
    .filter((i) => i >= 0);

  if (idxs.length === 0) {
    return <span className="text-[10px] text-slate-400 italic">No data yet</span>;
  }

  if (idxs.length < 2) {
    return (
      <span className="text-[10px] text-slate-400 italic">
        1 scan — keep scanning to see a trend
      </span>
    );
  }

  const nums = idxs.map((i) => values[i] as number);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const pad = 3;

  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  // Connect consecutive non-null indices only (gaps split the line)
  const segments: string[] = [];
  let current: string[] = [];
  for (let k = 0; k < idxs.length; k++) {
    if (k > 0 && idxs[k] - idxs[k - 1] > 1) {
      segments.push(current.join(' '));
      current = [];
    }
    current.push(`${x(idxs[k]).toFixed(1)},${y(nums[k]).toFixed(1)}`);
  }
  segments.push(current.join(' '));

  return (
    <svg width={width} height={height} className="overflow-visible" role="img">
      {segments.map((pts, si) => (
        <polyline
          key={si}
          points={pts}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-blue-500"
        />
      ))}
      {idxs.map((i, k) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(nums[k])}
          r="2"
          className="fill-blue-600"
        >
          <title>{`Scan ${new Date((started[i] ?? 0) * 1000).toLocaleString()} — ${format(nums[k])}`}</title>
        </circle>
      ))}
    </svg>
  );
};
