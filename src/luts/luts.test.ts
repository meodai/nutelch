import { describe, it, expect } from 'vitest';
import { oklchSrgb } from './oklch-srgb';
import { lchSrgb } from './lch-srgb';

// OKLCH ships an adaptive (non-uniform) grid; CIE LCH ships a uniform grid.
const OK_L = 49;
const OK_H = 192;
const CIE_L = 65;
const CIE_H = 256;

describe('generated LUTs', () => {
  it('oklchSrgb is self-describing, adaptive, with zeroed L extremes', () => {
    expect(oklchSrgb.mode).toBe('oklch');
    expect(oklchSrgb.lMax).toBe(1);
    expect(oklchSrgb.data.length).toBe(OK_L * OK_H);
    expect(oklchSrgb.cmax).toBeGreaterThan(0);
    // non-uniform breakpoints: ascending, anchored at the axis ends / hue origin
    expect(oklchSrgb.lbp?.length).toBe(OK_L);
    expect(oklchSrgb.hbp?.length).toBe(OK_H);
    expect(oklchSrgb.lbp![0]).toBe(0);
    expect(oklchSrgb.lbp![OK_L - 1]).toBeCloseTo(1, 4);
    expect(oklchSrgb.hbp![0]).toBe(0);
    for (let i = 1; i < OK_L; i++) expect(oklchSrgb.lbp![i]!).toBeGreaterThan(oklchSrgb.lbp![i - 1]!);
    for (let i = 1; i < OK_H; i++) expect(oklchSrgb.hbp![i]!).toBeGreaterThan(oklchSrgb.hbp![i - 1]!);
    // first row (L=0) and last row (L=1) are all zero
    for (let hi = 0; hi < OK_H; hi++) {
      expect(oklchSrgb.data[hi]).toBe(0);
      expect(oklchSrgb.data[(OK_L - 1) * OK_H + hi]).toBe(0);
    }
    // a mid-lightness cell is non-zero
    expect(oklchSrgb.data[Math.floor(OK_L / 2) * OK_H]).toBeGreaterThan(0);
  });

  it('lchSrgb carries the CIE scale (mode lch, lMax 100) on a uniform grid', () => {
    expect(lchSrgb.mode).toBe('lch');
    expect(lchSrgb.lMax).toBe(100);
    expect(lchSrgb.data.length).toBe(CIE_L * CIE_H);
    expect(lchSrgb.cmax).toBeGreaterThan(50); // CIE LCH chroma is in the tens-to-100s
    expect(lchSrgb.lbp).toBeUndefined(); // uniform: no breakpoints
    expect(lchSrgb.hbp).toBeUndefined();
  });
});
