import { describe, it, expect } from 'vitest';
import { toRect } from './coords';

describe('toRect', () => {
  it('maps hue 0 to +a axis', () => {
    const r = toRect(0.5, 0.1, 0);
    expect(r.l).toBe(0.5);
    expect(r.a).toBeCloseTo(0.1, 6);
    expect(r.b).toBeCloseTo(0, 6);
  });
  it('maps hue 90 to +b axis', () => {
    const r = toRect(0.5, 0.1, 90);
    expect(r.a).toBeCloseTo(0, 6);
    expect(r.b).toBeCloseTo(0.1, 6);
  });
});
