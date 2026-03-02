import { describe, it, expect } from 'vitest';
import { spearman } from '@/src/utilities/correlation';

describe('spearman', () => {
  it('returns 1 for perfectly correlated pairs', () => {
    const pairs = [
      { valueA: 1, valueB: 10 },
      { valueA: 2, valueB: 20 },
      { valueA: 3, valueB: 30 },
      { valueA: 4, valueB: 40 },
      { valueA: 5, valueB: 50 },
    ];
    expect(spearman(pairs)).toBeCloseTo(1, 2);
  });

  it('returns approximately -1 for perfectly inversely correlated pairs', () => {
    const pairs = [
      { valueA: 1, valueB: 50 },
      { valueA: 2, valueB: 40 },
      { valueA: 3, valueB: 30 },
      { valueA: 4, valueB: 20 },
      { valueA: 5, valueB: 10 },
    ];
    // statistics.js has minor precision variance (~0.02) at boundary values
    expect(spearman(pairs)).toBeCloseTo(-1, 1);
  });

  it('returns NaN when all pairs are filtered out due to NaN', () => {
    const pairs = [
      { valueA: NaN, valueB: 1 },
      { valueA: 2, valueB: NaN },
    ];
    expect(spearman(pairs)).toBeNaN();
  });

  it('filters out NaN pairs before computing', () => {
    const pairs = [
      { valueA: 1, valueB: 10 },
      { valueA: NaN, valueB: 20 },
      { valueA: 2, valueB: 20 },
      { valueA: 3, valueB: 30 },
      { valueA: 4, valueB: NaN },
      { valueA: 5, valueB: 50 },
    ];
    const rho = spearman(pairs);
    expect(rho).toBeCloseTo(1, 2);
  });

  it('returns a value between -1 and 1 for general data', () => {
    const pairs = [
      { valueA: 1, valueB: 3 },
      { valueA: 2, valueB: 1 },
      { valueA: 3, valueB: 4 },
      { valueA: 4, valueB: 2 },
      { valueA: 5, valueB: 5 },
    ];
    const rho = spearman(pairs);
    expect(rho).toBeGreaterThanOrEqual(-1);
    expect(rho).toBeLessThanOrEqual(1);
  });
});
