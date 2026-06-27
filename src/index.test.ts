import { describe, it, expect } from 'vitest';
import { clampChroma } from 'culori';
import { cusp, relch, toLab, oklchSrgb, oklchP3, lchSrgb, lchP3 } from './index';

// Ground-truth boundary chroma via culori, matching the build script.
function actualMax(mode: 'oklch' | 'lch', l: number, h: number, rgbGamut: string, ceiling: number) {
  const clamped = clampChroma({ mode, l, c: ceiling, h } as never, mode, rgbGamut);
  return (clamped as { c?: number }).c ?? 0;
}

describe('cusp', () => {
  it('returns {mode,l,c,h} from the passed LUT, near culori truth', () => {
    const r = cusp({ lut: oklchSrgb, l: 0.6, h: 30 });
    expect(r.mode).toBe('oklch');
    expect(r.l).toBe(0.6);
    expect(r.h).toBe(30);
    const truth = actualMax('oklch', 0.6, 30, 'rgb', 0.5);
    expect(r.c).toBeGreaterThan(0);
    expect(Math.abs(r.c - truth)).toBeLessThan(0.01); // LUT vs actual tolerance
  });

  it('uses the LUT to set mode + lightness scale (lch, L on 0..100)', () => {
    const r = cusp({ lut: lchSrgb, l: 60, h: 30 });
    expect(r.mode).toBe('lch');
    const truth = actualMax('lch', 60, 30, 'rgb', 160);
    expect(Math.abs(r.c - truth)).toBeLessThan(2); // CIE chroma scale tolerance
  });

  it('tracks the display-p3 boundary in both families', () => {
    const ok = cusp({ lut: oklchP3, l: 0.6, h: 150 });
    expect(Math.abs(ok.c - actualMax('oklch', 0.6, 150, 'p3', 0.5))).toBeLessThan(0.012);
    const cie = cusp({ lut: lchP3, l: 60, h: 150 });
    expect(Math.abs(cie.c - actualMax('lch', 60, 150, 'p3', 160))).toBeLessThan(3);
  });
});

describe('relch', () => {
  it('relC 0 is achromatic', () => {
    expect(relch({ lut: oklchSrgb, l: 0.6, relC: 0, h: 30 }).c).toBe(0);
  });

  it('relC 1 equals the cusp chroma', () => {
    const peak = cusp({ lut: oklchSrgb, l: 0.6, h: 30 });
    expect(relch({ lut: oklchSrgb, l: 0.6, relC: 1, h: 30 }).c).toBeCloseTo(peak.c, 6);
  });

  it('relC 0.5 is half the cusp chroma (per-lightness normalization)', () => {
    const peak = cusp({ lut: oklchSrgb, l: 0.6, h: 30 });
    expect(relch({ lut: oklchSrgb, l: 0.6, relC: 0.5, h: 30 }).c).toBeCloseTo(peak.c * 0.5, 6);
  });

  it('allows overshoot beyond the boundary', () => {
    const peak = cusp({ lut: oklchSrgb, l: 0.6, h: 30 });
    expect(relch({ lut: oklchSrgb, l: 0.6, relC: 1.5, h: 30 }).c).toBeCloseTo(peak.c * 1.5, 6);
  });

  it('wraps hue and honors the gamut via the chosen LUT', () => {
    const a = relch({ lut: oklchSrgb, l: 0.6, relC: 1, h: 390 });
    const b = relch({ lut: oklchSrgb, l: 0.6, relC: 1, h: 30 });
    expect(a.c).toBeCloseTo(b.c, 6);
    const p3 = relch({ lut: oklchP3, l: 0.6, relC: 1, h: 30 });
    expect(p3.c).toBeGreaterThanOrEqual(b.c - 1e-6); // P3 boundary >= sRGB
  });
});

describe('toLab', () => {
  it('converts a relch result to rectangular a/b preserving chroma', () => {
    const col = relch({ lut: oklchSrgb, l: 0.6, relC: 0.8, h: 30 });
    const lab = toLab(col);
    expect(lab.l).toBe(col.l);
    expect(Math.hypot(lab.a, lab.b)).toBeCloseTo(col.c, 6);
  });
});
