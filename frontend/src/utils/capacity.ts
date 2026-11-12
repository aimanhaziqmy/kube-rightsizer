import { CapacityResource, ClusterCapacity } from '../types';

const MI = 2 ** 20;
const GI = 2 ** 30;

export type CapacityKind = 'cpu' | 'memory';

export interface CapacityMetric {
  value: number | null;
  percent: number | null;
  /** Percentage clamped to the 0-100 arc range; text still uses `percent`. */
  cappedPercent: number;
}

export interface CapacityGauge {
  kind: CapacityKind;
  allocatable: number | null;
  usage: CapacityMetric;
  request: CapacityMetric;
  limit: CapacityMetric;
  centerLabel: string;
}

export function formatCapacityCpu(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1e-9) return '0 core';
  if (Math.abs(value) < 1) return `${Math.round(value * 1000)}m`;
  return `${Number(value.toFixed(2))} core`;
}

export function formatCapacityMem(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1e-9) return '0 B';
  if (Math.abs(value) >= GI) return `${(value / GI).toFixed(2)} GiB`;
  if (Math.abs(value) >= MI) return `${Math.round(value / MI)} MiB`;
  return `${Math.round(value)} B`;
}

function toMetric(value: number | null, allocatable: number | null): CapacityMetric {
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  const hasTotal =
    typeof allocatable === 'number' && Number.isFinite(allocatable) && allocatable > 0;
  const percent = hasValue && hasTotal ? (value / allocatable) * 100 : null;
  return {
    value: hasValue ? value : null,
    percent,
    cappedPercent: percent === null ? 0 : Math.min(100, Math.max(0, percent)),
  };
}

export function buildCapacityGauge(
  capacity: ClusterCapacity | null | undefined,
  kind: CapacityKind,
): CapacityGauge {
  const resource: Partial<CapacityResource> = capacity?.[kind] ?? {};
  const allocatable =
    typeof resource.allocatable === 'number' && Number.isFinite(resource.allocatable)
      ? resource.allocatable
      : null;

  return {
    kind,
    allocatable,
    usage: toMetric(resource.usage_avg ?? null, allocatable),
    request: toMetric(resource.requests ?? null, allocatable),
    limit: toMetric(resource.limits ?? null, allocatable),
    centerLabel:
      kind === 'cpu' ? formatCapacityCpu(allocatable) : formatCapacityMem(allocatable),
  };
}
