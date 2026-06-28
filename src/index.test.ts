import { describe, it, expect } from 'vitest';
import { clampChroma } from 'culori';
import { cusp, relch, peak, reach, toLab, oklchSrgb, oklchP3, lchSrgb, lchP3 } from './index';

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

describe('peak', () => {
  it('returns {mode,l,c,h}, the most chromatic color of the hue', () => {
    const p = peak({ lut: oklchSrgb, h: 30 });
    expect(p.mode).toBe('oklch');
    expect(p.h).toBe(30);
    expect(p.c).toBeGreaterThan(0);
    expect(p.l).toBeGreaterThan(0);
    expect(p.l).toBeLessThan(oklchSrgb.lMax);
  });

  it('is the max chroma over all lightness (>= the per-L cusp anywhere)', () => {
    const p = peak({ lut: oklchSrgb, h: 30 });
    for (const l of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(p.c).toBeGreaterThanOrEqual(cusp({ lut: oklchSrgb, l, h: 30 }).c - 1e-9);
    }
  });

  it('matches a fine scan of the boundary', () => {
    let best = 0;
    for (let i = 0; i <= 2000; i++) best = Math.max(best, cusp({ lut: oklchSrgb, l: i / 2000, h: 30 }).c);
    expect(peak({ lut: oklchSrgb, h: 30 }).c).toBeCloseTo(best, 6);
  });

  it('uses the LUT scale (lch L on 0..100) and tracks the wider P3 gamut', () => {
    expect(peak({ lut: lchSrgb, h: 30 }).l).toBeGreaterThan(1);
    expect(peak({ lut: oklchP3, h: 30 }).c).toBeGreaterThanOrEqual(peak({ lut: oklchSrgb, h: 30 }).c - 1e-6);
  });
});

describe('reach', () => {
  it('reach 0 is the achromatic anchor (c=0 at the given lightness)', () => {
    const r = reach({ lut: oklchSrgb, l: 0.3, reach: 0, h: 142 });
    expect(r.c).toBe(0);
    expect(r.l).toBeCloseTo(0.3, 9);
  });

  it('reach 1 lands exactly on the cusp', () => {
    const tip = peak({ lut: oklchSrgb, h: 142 });
    const r = reach({ lut: oklchSrgb, l: 0.3, reach: 1, h: 142 });
    expect(r.l).toBeCloseTo(tip.l, 9);
    expect(r.c).toBeCloseTo(tip.c, 9);
  });

  it('reach 0.5 is the midpoint of the anchor→cusp ray', () => {
    const tip = peak({ lut: oklchSrgb, h: 142 });
    const r = reach({ lut: oklchSrgb, l: 0.3, reach: 0.5, h: 142 });
    expect(r.l).toBeCloseTo(0.3 + 0.5 * (tip.l - 0.3), 9);
    expect(r.c).toBeCloseTo(0.5 * tip.c, 9);
  });

  it('allows overshoot past the cusp (like relch)', () => {
    const tip = peak({ lut: oklchSrgb, h: 142 });
    expect(reach({ lut: oklchSrgb, l: 0.3, reach: 1.2, h: 142 }).c).toBeCloseTo(1.2 * tip.c, 9);
  });

  it('carries the LUT mode', () => {
    expect(reach({ lut: lchSrgb, l: 30, reach: 0.5, h: 142 }).mode).toBe('lch');
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
