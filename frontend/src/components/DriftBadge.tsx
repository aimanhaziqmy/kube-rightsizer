import React from 'react';
import { DiffChanges } from '../utils/scanDiff';
import { TrendingUp, TrendingDown, RefreshCcw, ArrowUpRight } from 'lucide-react';

interface DriftBadgeProps {
  changes: DiffChanges;
}

const pill =
  'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border whitespace-nowrap';

/**
 * Compact drift indicators for the Workloads table, comparing the active
 * scan against a baseline scan (default: the previous scan).
 */
export const DriftBadge: React.FC<DriftBadgeProps> = ({ changes }) => {
  const pills: React.ReactNode[] = [];

  if (changes.current_toward_recommended) {
    pills.push(
      <span key="toward" className={`${pill} bg-emerald-50 text-emerald-700 border-emerald-200`} title="Current requests moved toward the recommended values since the previous scan">
        <TrendingDown className="w-2.5 h-2.5" />
        Moved toward rec
      </span>
    );
  } else if (changes.current) {
    pills.push(
      <span key="away" className={`${pill} bg-amber-50 text-amber-800 border-amber-200`} title="Current requests moved away from the recommended values since the previous scan">
        <TrendingUp className="w-2.5 h-2.5" />
        Moved away
      </span>
    );
  }

  if (changes.recommendation) {
    pills.push(
      <span key="rec" className={`${pill} bg-blue-50 text-blue-700 border-blue-200`} title="KRR recommendation changed since the previous scan">
        <RefreshCcw className="w-2.5 h-2.5" />
        Rec changed
      </span>
    );
  }

  if (changes.severity) {
    pills.push(
      <span key="sev" className={`${pill} bg-violet-50 text-violet-700 border-violet-200`} title="Severity changed since the previous scan">
        <ArrowUpRight className="w-2.5 h-2.5" />
        Severity
      </span>
    );
  }

  if (pills.length === 0) return null;

  return <div className="flex flex-wrap items-center gap-1">{pills}</div>;
};
