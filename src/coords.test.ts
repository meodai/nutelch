import { describe, it, expect } from 'vitest';
import { toLab } from './coords';

describe('toLab', () => {
  it('maps hue 0 to the +a axis', () => {
    const r = toLab({ l: 0.5, c: 0.1, h: 0 });
    expect(r.l).toBe(0.5);
    expect(r.a).toBeCloseTo(0.1, 6);
    expect(r.b).toBeCloseTo(0, 6);
  });
  it('maps hue 90 to the +b axis', () => {
    const r = toLab({ l: 0.5, c: 0.1, h: 90 });
    expect(r.a).toBeCloseTo(0, 6);
    expect(r.b).toBeCloseTo(0.1, 6);
  });
  it('preserves chroma magnitude (a² + b² = c²)', () => {
    const r = toLab({ l: 0.5, c: 0.13, h: 200 });
    expect(Math.hypot(r.a, r.b)).toBeCloseTo(0.13, 6);
  });
});
