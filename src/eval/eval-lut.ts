import type { Lut } from '../luts/decode';
import { maxChroma } from '../interp';
import { trueMaxChroma, FAMILY, type Family, type Gamut } from './ground-truth';

// A single probe of the boundary: where it was taken, and the signed error
// (LUT minus truth) in both absolute chroma and as a fraction of cmax.
export interface Probe {
  l: number;
  h: number;
  lut: number;
  truth: number;
  errAbs: number; // lut - truth; >0 = overshoot (claims more chroma than real)
  errFrac: number; // errAbs / cmax
}

export interface Extreme {
  frac: number; // signed fraction of cmax
  abs: number; // signed absolute chroma
  l: number;
  h: number;
}

export interface EvalResult {
  name: string;
  cmax: number;
  samples: number;
  maxOvershoot: Extreme; // most positive error (LUT > truth) — the harmful direction
  maxUndershoot: Extreme; // most negative error (LUT < truth)
  meanAbsFrac: number; // mean |error| / cmax
  p99AbsFrac: number; // 99th percentile |error| / cmax
  rmsFrac: number;
  perHueMaxOvershoot: Float64Array; // [hSteps] worst overshoot frac at each hue column
  perLMaxOvershoot: Float64Array; // [lSteps] worst overshoot frac at each L row
}

// How an arbitrary (l, h) lookup resolves against truth, used by both the sweep
// and by spot checks (e.g. the blue-cusp pin test).
export function probe(
  lut: Lut,
  family: Family,
  gamut: Gamut,
  l: number,
  h: number,
  lookup: (lut: Lut, l: number, h: number) => number = maxChroma,
): Probe {
  const lutC = lookup(lut, l, h);
  const truth = trueMaxChroma(family, gamut, l, h);
  const errAbs = lutC - truth;
  return { l, h, lut: lutC, truth, errAbs, errFrac: errAbs / lut.cmax };
}

// Interior offsets within each grid cell. On-node samples (offset 0) are exact by
// construction, so we probe strictly between nodes — the midpoint (0.5) is the
// worst case for bilinear over a curved surface; the quarter points catch
// asymmetric ridges.
const OFFSETS = [0.25, 0.5, 0.75];

export interface EvalOptions {
  // Override the lookup under test (defaults to the shipped bilinear maxChroma) so
  // a candidate adaptive representation can be measured on the identical sweep.
  lookup?: (lut: Lut, l: number, h: number) => number;
  offsets?: number[];
}

// Sweep the (L, H) domain at off-grid points and summarize the signed error of a
// LUT lookup against culori ground truth. Pure and deterministic.
export function evalLut(
  name: string,
  lut: Lut,
  family: Family,
  gamut: Gamut,
  opts: EvalOptions = {},
): EvalResult {
  const lookup = opts.lookup ?? maxChroma;
  const offsets = opts.offsets ?? OFFSETS;
  const { lSteps, hSteps, cmax } = lut;
  const { lMax } = FAMILY[family];

  const perHueMaxOvershoot = new Float64Array(hSteps);
  const perLMaxOvershoot = new Float64Array(lSteps);
  const absFracs: number[] = [];

  let maxOver: Extreme = { frac: -Infinity, abs: -Infinity, l: 0, h: 0 };
  let maxUnder: Extreme = { frac: Infinity, abs: Infinity, l: 0, h: 0 };
  let sumSqFrac = 0;
  let sumAbsFrac = 0;
  let n = 0;

  // Sample strictly inside each grid cell. For a non-uniform LUT the cell bounds
  // are the actual breakpoints (lbp/hbp); otherwise they are evenly spaced. Hue
  // wraps so the last column pairs with column 0 across the seam. Sampling the
  // real cell interiors is essential — uniform-position sampling would probe the
  // wrong points on a non-uniform grid and miss where the error actually lives.
  const { lbp, hbp } = lut;
  for (let li = 0; li < lSteps - 1; li++) {
    const lA = lbp ? lbp[li]! : (li / (lSteps - 1)) * lMax;
    const lB = lbp ? lbp[li + 1]! : ((li + 1) / (lSteps - 1)) * lMax;
    for (const ol of offsets) {
      const l = lA + ol * (lB - lA);
      for (let hi = 0; hi < hSteps; hi++) {
        const hA = hbp ? hbp[hi]! : (hi / hSteps) * 360;
        const hB = hbp ? (hi + 1 < hSteps ? hbp[hi + 1]! : hbp[0]! + 360) : ((hi + 1) / hSteps) * 360;
        for (const oh of offsets) {
          const h = hA + oh * (hB - hA);
          const p = probe(lut, family, gamut, l, h, lookup);
          const af = Math.abs(p.errFrac);
          absFracs.push(af);
          sumAbsFrac += af;
          sumSqFrac += p.errFrac * p.errFrac;
          n++;
          if (p.errFrac > maxOver.frac) maxOver = { frac: p.errFrac, abs: p.errAbs, l, h };
          if (p.errFrac < maxUnder.frac) maxUnder = { frac: p.errFrac, abs: p.errAbs, l, h };
          if (p.errFrac > perHueMaxOvershoot[hi]!) perHueMaxOvershoot[hi] = p.errFrac;
          if (p.errFrac > perLMaxOvershoot[li]!) perLMaxOvershoot[li] = p.errFrac;
        }
      }
    }
  }

  absFracs.sort((a, b) => a - b);
  const p99AbsFrac = absFracs[Math.min(absFracs.length - 1, Math.floor(absFracs.length * 0.99))] ?? 0;

  return {
    name,
    cmax,
    samples: n,
    maxOvershoot: maxOver,
    maxUndershoot: maxUnder,
    meanAbsFrac: sumAbsFrac / n,
    p99AbsFrac,
    rmsFrac: Math.sqrt(sumSqFrac / n),
    perHueMaxOvershoot,
    perLMaxOvershoot,
  };
}
