import { describe, it, expect } from 'vitest';
import { evalLut, probe } from './eval/eval-lut';
import { LUT_CASES } from './eval/lut-cases';
import { oklchSrgb } from './luts';

// Characterization + ratchet for the adaptive (non-uniform) LUTs. Breakpoints are
// concentrated where the gamut boundary curves most, so over/undershoot are far
// smaller than the old uniform grid. These ceilings sit just above the worst
// values measured by `npm run eval:luts`; they can only ever be TIGHTENED — a
// failure means a change made a LUT (or the interpolation) less accurate.
const RATCHET: Record<string, { overshoot: number; undershoot: number }> = {
  // fractions of cmax (signed); measured at real cell interiors. undershoot is the
  // floor (most-negative allowed). OKLCH is adaptive; CIE LCH is uniform.
  //
  // oklchSrgb's −11% undershoot is the INTRINSIC blue non-convex corner (the sRGB
  // gamut is slightly non-convex there, so first-exit max chroma is near-
  // discontinuous) — uniform grids hit it too, and undershoot is the SAFE
  // direction for a gamut model. Its overshoot (the originally reported bug) fell
  // from ~8.4% to ~5.2% on cells / ~2.9% in practice.
  oklchSrgb: { overshoot: 0.053, undershoot: -0.115 },
  oklchP3: { overshoot: 0.036, undershoot: -0.024 },
  // CIE LCH stays uniform: its broadly-curved gamut suits a uniform grid (low rms);
  // the large cusp figures are the near-singular yellow-white tip no finite linear
  // LUT resolves. These match the long-standing uniform behavior.
  lchSrgb: { overshoot: 0.215, undershoot: -0.205 },
  lchP3: { overshoot: 0.228, undershoot: -0.302 },
  // LCHuv is uniform, like LCH, and the most accurate family measured (mean
  // error ~0.03%). Its worst undershoot sits at the yellow tip (L≈97, h≈82).
  lchuvSrgb: { overshoot: 0.0085, undershoot: -0.09 },
  lchuvP3: { overshoot: 0.007, undershoot: -0.057 },
  // HCT is adaptive, like OKLCH. Tone is CIE L*, so HCT inherits LCH's near-
  // singular yellow-white tip (tone ≈ 99, h ≈ 114) — that is where the maxima sit.
  // A uniform 65×256 grid was measured too: lower mean (0.11% vs 0.20%) but worse
  // worst-case overshoot (19.6% vs 13.6% on sRGB) at ~1.8× the size.
  hctSrgb: { overshoot: 0.137, undershoot: -0.129 },
  hctP3: { overshoot: 0.081, undershoot: -0.11 },
};

describe('LUT boundary accuracy (ratchet — only ever tighten)', () => {
  for (const { name, lut, family, gamut } of LUT_CASES) {
    it(`${name}: overshoot/undershoot stay within the recorded envelope`, () => {
      const r = evalLut(name, lut, family, gamut);
      const limit = RATCHET[name]!;
      expect(r.maxOvershoot.frac).toBeLessThanOrEqual(limit.overshoot);
      expect(r.maxUndershoot.frac).toBeGreaterThanOrEqual(limit.undershoot);
    });
  }
});

describe('blue-cusp fix (the originally reported defect)', () => {
  // The motivating case: oklch/sRGB blue, L≈0.45 H≈264. The old uniform LUT
  // bulged OUTWARD across the sharp gamut corner and claimed ~0.027 (8.4% of
  // cmax) more chroma than the true sRGB boundary. The adaptive grid lands a
  // breakpoint on the cusp, so the boundary is now reproduced essentially exactly.
  it('no longer overshoots — matches the true sRGB boundary at the cusp', () => {
    const p = probe(oklchSrgb, 'ok', 'srgb', 0.449, 264);
    expect(Math.abs(p.errAbs)).toBeLessThan(0.005); // was +0.0268 on the uniform LUT
    expect(p.truth).toBeCloseTo(0.26, 2); // the manually cross-checked boundary
  });
});
