import { describe, it, expect } from 'vitest';
import { clampChroma } from 'culori';
import { cusp, relch } from './index';

// Ground-truth boundary chroma via culori, matching the build script.
function actualMax(mode: 'oklch' | 'lch', l: number, h: number, rgbGamut: string, ceiling: number) {
  const clamped = clampChroma({ mode, l, c: ceiling, h } as never, mode, rgbGamut);
  return (clamped as { c?: number }).c ?? 0;
}

describe('cusp', () => {
  it('defaults to oklch + srgb and returns a cylindrical color near culori truth', () => {
    const r = cusp({ l: 0.6, h: 30 }) as { mode: string; l: number; c: number; h: number };
    expect(r.mode).toBe('oklch');
    expect(r.l).toBe(0.6);
    expect(r.h).toBe(30);
    const truth = actualMax('oklch', 0.6, 30, 'rgb', 0.5);
    expect(r.c).toBeGreaterThan(0);
    expect(Math.abs(r.c - truth)).toBeLessThan(0.01); // LUT vs actual tolerance
  });

  it('returns {l,a,b} for oklab, equal magnitude to the oklch chroma', () => {
    const lch = cusp({ mode: 'oklch', l: 0.6, h: 30 }) as { c: number };
    const lab = cusp({ mode: 'oklab', l: 0.6, h: 30 }) as { mode: string; a: number; b: number };
    expect(lab.mode).toBe('oklab');
    expect(Math.hypot(lab.a, lab.b)).toBeCloseTo(lch.c, 6);
  });

  it('supports the cie family (lch) with L on 0..100', () => {
    const r = cusp({ mode: 'lch', l: 60, h: 30 }) as { c: number };
    const truth = actualMax('lch', 60, 30, 'rgb', 160);
    expect(Math.abs(r.c - truth)).toBeLessThan(2); // CIE chroma scale tolerance
  });
});

describe('relch', () => {
  it('relC 0 is achromatic', () => {
    const r = relch({ l: 0.6, relC: 0, h: 30 }) as { c: number };
    expect(r.c).toBe(0);
  });

  it('relC 1 equals the cusp chroma', () => {
    const peak = cusp({ l: 0.6, h: 30 }) as { c: number };
    const r = relch({ l: 0.6, relC: 1, h: 30 }) as { c: number };
    expect(r.c).toBeCloseTo(peak.c, 6);
  });

  it('relC 0.5 is half the cusp chroma (per-lightness normalization)', () => {
    const peak = cusp({ l: 0.6, h: 30 }) as { c: number };
    const r = relch({ l: 0.6, relC: 0.5, h: 30 }) as { c: number };
    expect(r.c).toBeCloseTo(peak.c * 0.5, 6);
  });

  it('allows overshoot beyond the boundary', () => {
    const peak = cusp({ l: 0.6, h: 30 }) as { c: number };
    const r = relch({ l: 0.6, relC: 1.5, h: 30 }) as { c: number };
    expect(r.c).toBeCloseTo(peak.c * 1.5, 6);
  });

  it('wraps hue and honors gamut option', () => {
    const a = relch({ l: 0.6, relC: 1, h: 390 }) as { c: number };
    const b = relch({ l: 0.6, relC: 1, h: 30 }) as { c: number };
    expect(a.c).toBeCloseTo(b.c, 6);
    const p3 = relch({ l: 0.6, relC: 1, h: 30, gamut: 'display-p3' }) as { c: number };
    expect(p3.c).toBeGreaterThanOrEqual(b.c - 1e-6); // P3 boundary >= sRGB
  });
});
