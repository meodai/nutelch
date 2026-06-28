import { describe, it, expect } from 'vitest';
import { toe, toeInv } from './toe';

describe('toe / toeInv', () => {
  it('both fix the endpoints 0 and 1', () => {
    expect(toe(0)).toBeCloseTo(0, 9);
    expect(toe(1)).toBeCloseTo(1, 9);
    expect(toeInv(0)).toBeCloseTo(0, 9);
    expect(toeInv(1)).toBeCloseTo(1, 9);
  });

  it('are exact inverses across the range', () => {
    for (const x of [0.05, 0.2, 0.4, 0.5, 0.6, 0.8, 0.95]) {
      expect(toe(toeInv(x))).toBeCloseTo(x, 9);
      expect(toeInv(toe(x))).toBeCloseTo(x, 9);
    }
  });

  it('toe lowers midtones (toe(x) < x), toeInv raises them', () => {
    expect(toe(0.5)).toBeLessThan(0.5);
    expect(toeInv(0.5)).toBeGreaterThan(0.5);
  });
});
