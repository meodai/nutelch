import { describe, it, expect } from 'vitest';
import type { Lut } from '../luts/decode';
import { oklchSrgb } from '../luts';
import { evalLut, probe } from './eval-lut';
import { trueMaxChroma } from './ground-truth';

// We validate the evaluator (the "ruler") by feeding it lookups whose error
// against culori ground truth is known by construction, and checking it reports
// the right sign and magnitude. Ground truth is the real culori call, so this
// also proves the sweep actually exercises off-grid points.

const exactTruth = (_lut: Lut, l: number, h: number) => trueMaxChroma('ok', 'srgb', l, h);

describe('evalLut (the ruler itself)', () => {
  it('reports ~zero error when the lookup IS the ground truth', () => {
    const r = evalLut('exact', oklchSrgb, 'ok', 'srgb', { lookup: exactTruth });
    expect(Math.abs(r.maxOvershoot.frac)).toBeLessThan(1e-12);
    expect(Math.abs(r.maxUndershoot.frac)).toBeLessThan(1e-12);
    expect(r.meanAbsFrac).toBeLessThan(1e-12);
  });

  it('reports overshoot of the right magnitude when the lookup inflates truth', () => {
    // truth * 1.1 → error = 0.1*truth; worst frac ≈ 0.1*maxTruth/cmax, and since
    // maxTruth == cmax, that worst overshoot frac ≈ 0.1.
    const r = evalLut('inflated', oklchSrgb, 'ok', 'srgb', {
      lookup: (_l, l, h) => exactTruth(_l, l, h) * 1.1,
    });
    expect(r.maxOvershoot.frac).toBeCloseTo(0.1, 2);
    expect(r.maxUndershoot.frac).toBeGreaterThanOrEqual(0); // never negative when inflating
  });

  it('reports undershoot (negative) when the lookup deflates truth', () => {
    const r = evalLut('deflated', oklchSrgb, 'ok', 'srgb', {
      lookup: (_l, l, h) => exactTruth(_l, l, h) * 0.9,
    });
    expect(r.maxUndershoot.frac).toBeCloseTo(-0.1, 2);
    expect(r.maxOvershoot.frac).toBeLessThanOrEqual(1e-12);
  });

  it('exposes per-hue / per-L overshoot profiles sized to the grid', () => {
    const r = evalLut('shape', oklchSrgb, 'ok', 'srgb');
    expect(r.perHueMaxOvershoot.length).toBe(oklchSrgb.hSteps);
    expect(r.perLMaxOvershoot.length).toBe(oklchSrgb.lSteps);
    expect(r.samples).toBe((oklchSrgb.lSteps - 1) * oklchSrgb.hSteps * 3 * 3);
  });

  it('probe carries both absolute and cmax-relative signed error', () => {
    const p = probe(oklchSrgb, 'ok', 'srgb', 0.45, 264);
    expect(p.errAbs).toBeCloseTo(p.lut - p.truth, 12);
    expect(p.errFrac).toBeCloseTo(p.errAbs / oklchSrgb.cmax, 12);
  });
});
