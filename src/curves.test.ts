import { describe, it, expect } from 'vitest';
import { smoothstep } from './curves';

describe('smoothstep', () => {
  it('fixes the endpoints', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
  });

  it('passes through 0.5 at the midpoint', () => {
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 9);
  });

  it('is symmetric: f(x) + f(1-x) = 1', () => {
    for (const x of [0.1, 0.25, 0.4, 0.8]) {
      expect(smoothstep(x) + smoothstep(1 - x)).toBeCloseTo(1, 9);
    }
  });

  it('clamps outside [0,1]', () => {
    expect(smoothstep(-2)).toBe(0);
    expect(smoothstep(3)).toBe(1);
  });

  it('is monotonic increasing', () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const y = smoothstep(i / 20);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });
});
