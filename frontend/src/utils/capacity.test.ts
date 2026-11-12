import { describe, expect, it } from 'vitest';
import {
  buildCapacityGauge,
  formatCapacityCpu,
  formatCapacityMem,
} from './capacity';

const GI = 1024 ** 3;

describe('buildCapacityGauge', () => {
  it('computes percentages and caps the visual arc at 100', () => {
    const gauge = buildCapacityGauge(
      {
        cpu: { allocatable: 40, usage_avg: 3.2, requests: 36, limits: 98.8 },
      },
      'cpu',
    );

    expect(gauge.centerLabel).toBe('40 core');
    expect(gauge.usage.percent).toBeCloseTo(8);
    expect(gauge.request.percent).toBeCloseTo(90);
    expect(gauge.limit.percent).toBeCloseTo(247);
    expect(gauge.limit.cappedPercent).toBe(100);
  });

  it('returns null percentages when allocatable is missing or zero', () => {
    const missing = buildCapacityGauge({ cpu: { allocatable: null } as any }, 'cpu');
    expect(missing.usage.percent).toBeNull();
    expect(missing.request.percent).toBeNull();
    expect(missing.limit.percent).toBeNull();
    expect(missing.usage.cappedPercent).toBe(0);

    const zero = buildCapacityGauge({ cpu: { allocatable: 0, requests: 1 } as any }, 'cpu');
    expect(zero.request.percent).toBeNull();
  });

  it('formats memory in GiB and MiB', () => {
    const gauge = buildCapacityGauge(
      {
        memory: {
          allocatable: 125.06 * GI,
          usage_avg: 58.8 * GI,
          requests: 97.5 * GI,
          limits: 195 * GI,
        },
      },
      'memory',
    );

    expect(gauge.centerLabel).toBe('125.06 GiB');
    expect(gauge.usage.percent).toBeCloseTo(47, 0);
    expect(gauge.request.percent).toBeCloseTo(78, 0);
    expect(gauge.limit.percent).toBeCloseTo(156, 0);
    expect(gauge.limit.cappedPercent).toBe(100);
  });
});

describe('capacity formatters', () => {
  it('formats CPU cores and millicores', () => {
    expect(formatCapacityCpu(40)).toBe('40 core');
    expect(formatCapacityCpu(0.85)).toBe('850m');
    expect(formatCapacityCpu(null)).toBe('—');
  });

  it('formats memory values', () => {
    expect(formatCapacityMem(125.06 * GI)).toBe('125.06 GiB');
    expect(formatCapacityMem(512 * 1024 ** 2)).toBe('512 MiB');
    expect(formatCapacityMem(null)).toBe('—');
  });
});
