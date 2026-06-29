// Experiment: compare candidate boundary representations on three axes —
// precision, serialized size, and per-lookup execution speed.
//   npx tsx scripts/adaptive-explore.ts
//
// Precision is measured at a FIXED dense reference grid (identical physical (L,H)
// points for every candidate) against culori ground truth, normalized to cmax —
// so candidates of different resolutions are directly comparable. This is the fix
// for the earlier flaw where each candidate was sampled on its own grid.
import type { Lut } from '../src/luts/decode';
import { maxChroma } from '../src/interp';
import { FAMILY, trueMaxChroma, LUT_CASES, type Family, type Gamut } from '../src/eval/ground-truth';

type Lookup = (l: number, h: number) => number;

// ── fixed reference grid (candidate-independent) ────────────────────────────────
const REF_L = 400; // interior L samples (exclude 0 and lMax)
const REF_H = 1440; // hue samples (0.25°)

interface Ref {
  l: Float64Array;
  h: Float64Array;
  truth: Float64Array; // REF_L * REF_H
}
function buildRef(family: Family, gamut: Gamut): Ref {
  const lMax = FAMILY[family].lMax;
  const l = new Float64Array(REF_L);
  const h = new Float64Array(REF_H);
  for (let i = 0; i < REF_L; i++) l[i] = ((i + 0.5) / REF_L) * lMax;
  for (let j = 0; j < REF_H; j++) h[j] = (j / REF_H) * 360;
  const truth = new Float64Array(REF_L * REF_H);
  for (let i = 0; i < REF_L; i++) for (let j = 0; j < REF_H; j++) truth[i * REF_H + j] = trueMaxChroma(family, gamut, l[i]!, h[j]!);
  return { l, h, truth };
}

interface Metrics {
  over: number;
  under: number;
  rms: number;
  overL: number;
  overH: number;
}
function measure(ref: Ref, cmax: number, lookup: Lookup): Metrics {
  let over = -Infinity;
  let under = Infinity;
  let overL = 0;
  let overH = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = 0; i < REF_L; i++) {
    for (let j = 0; j < REF_H; j++) {
      const e = (lookup(ref.l[i]!, ref.h[j]!) - ref.truth[i * REF_H + j]!) / cmax;
      if (e > over) {
        over = e;
        overL = ref.l[i]!;
        overH = ref.h[j]!;
      }
      if (e < under) under = e;
      sumSq += e * e;
      n++;
    }
  }
  return { over, under, rms: Math.sqrt(sumSq / n), overL, overH };
}

// ── candidate builders ──────────────────────────────────────────────────────────
function buildUniform(family: Family, gamut: Gamut, lSteps: number, hSteps: number): Lut {
  const lMax = FAMILY[family].lMax;
  const raw = new Float64Array(lSteps * hSteps);
  let cmax = 0;
  for (let li = 0; li < lSteps; li++) {
    const l = (li / (lSteps - 1)) * lMax;
    for (let hi = 0; hi < hSteps; hi++) {
      const c = li > 0 && li < lSteps - 1 ? trueMaxChroma(family, gamut, l, (hi / hSteps) * 360) : 0;
      raw[li * hSteps + hi] = c;
      if (c > cmax) cmax = c;
    }
  }
  const data = new Uint16Array(lSteps * hSteps);
  for (let i = 0; i < raw.length; i++) data[i] = Math.round((raw[i]! / cmax) * 65535);
  return { mode: FAMILY[family].mode, lMax, cmax, lSteps, hSteps, data };
}

// Non-uniform grid: breakpoints concentrated where the boundary curves most.
// Importance(axis) = summed |2nd difference| of the boundary along that axis on a
// fine probe grid; breakpoints placed by equal-cumulative-importance (inverse CDF),
// blended with a uniform floor so no region is starved.
interface NonUniform {
  lMax: number;
  cmax: number;
  lbp: Float64Array; // sorted L breakpoints (includes 0 and lMax)
  hbp: Float64Array; // sorted H breakpoints (includes 0; wraps at 360)
  data: Float64Array; // [lbp.length * hbp.length] chroma
}
function placeBreakpoints(importance: Float64Array, axisMax: number, count: number, floor: number, wrap: boolean): Float64Array {
  const n = importance.length;
  const w = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    w[i] = importance[i]! + floor;
    total += w[i]!;
  }
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i]! + w[i]!;
  const segs = wrap ? count : count - 1;
  const bps: number[] = [];
  for (let k = 0; k < (wrap ? count : count); k++) {
    const target = (k / segs) * total;
    // find position where cum crosses target
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < target) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const frac = (target - cum[i - 1]!) / (cum[i]! - cum[i - 1]! || 1);
    bps.push(((i - 1 + frac) / n) * axisMax);
  }
  if (!wrap) bps.push(axisMax);
  bps[0] = 0;
  return Float64Array.from(bps);
}
function buildNonUniform(family: Family, gamut: Gamut, nL: number, nH: number): NonUniform {
  const lMax = FAMILY[family].lMax;
  const PL = 600;
  const PH = 1440;
  // importance along H: max over L of |2nd diff in h|
  const impH = new Float64Array(PH);
  const impL = new Float64Array(PL);
  const probe = (li: number, hi: number) => trueMaxChroma(family, gamut, ((li + 0.5) / PL) * lMax, (hi / PH) * 360);
  for (let hi = 0; hi < PH; hi++) {
    let mx = 0;
    for (let li = 0; li < PL; li++) {
      const a = probe(li, (hi - 1 + PH) % PH);
      const b = probe(li, hi);
      const c = probe(li, (hi + 1) % PH);
      mx = Math.max(mx, Math.abs(a - 2 * b + c));
    }
    impH[hi] = mx;
  }
  for (let li = 0; li < PL; li++) {
    let mx = 0;
    for (let hi = 0; hi < PH; hi++) {
      const a = li > 0 ? probe(li - 1, hi) : 0;
      const b = probe(li, hi);
      const c = li < PL - 1 ? probe(li + 1, hi) : 0;
      mx = Math.max(mx, Math.abs(a - 2 * b + c));
    }
    impL[li] = mx;
  }
  const lbp = placeBreakpoints(impL, lMax, nL, (impLavg(impL)) * 0.15, false);
  const hbp = placeBreakpoints(impH, 360, nH, (impLavg(impH)) * 0.15, true);
  const data = new Float64Array(lbp.length * hbp.length);
  let cmax = 0;
  for (let i = 0; i < lbp.length; i++) {
    const atEdge = i === 0 || i === lbp.length - 1;
    for (let j = 0; j < hbp.length; j++) {
      const c = atEdge ? 0 : trueMaxChroma(family, gamut, lbp[i]!, hbp[j]!);
      data[i * hbp.length + j] = c;
      if (c > cmax) cmax = c;
    }
  }
  return { lMax, cmax, lbp, hbp, data };
}
function impLavg(a: Float64Array): number {
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}
function nonUniformLookup(nu: NonUniform): Lookup {
  const { lbp, hbp, data, lMax } = nu;
  const nH = hbp.length;
  const findL = (l: number) => {
    let lo = 0;
    let hi = lbp.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (lbp[mid]! <= l) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const findH = (h: number) => {
    let lo = 0;
    let hi = nH; // breakpoints + virtual wrap point at 360
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if ((mid < nH ? hbp[mid]! : 360) <= h) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  return (l, h) => {
    l = Math.min(Math.max(l, 0), lMax);
    h = ((h % 360) + 360) % 360;
    const li = findL(l);
    const l0 = lbp[li]!;
    const l1 = lbp[li + 1]!;
    const tl = (l - l0) / (l1 - l0 || 1);
    const hi = findH(h);
    const h0v = hbp[hi]!;
    const h1i = (hi + 1) % nH;
    const h1v = hi + 1 < nH ? hbp[hi + 1]! : 360;
    const th = (h - h0v) / (h1v - h0v || 1);
    const at = (a: number, b: number) => data[a * nH + b]!;
    const top = at(li, hi) + (at(li, h1i) - at(li, hi)) * th;
    const bot = at(li + 1, hi) + (at(li + 1, h1i) - at(li + 1, hi)) * th;
    return top + (bot - top) * tl;
  };
}

// ── speed ────────────────────────────────────────────────────────────────────────
function bench(lookup: Lookup, lMax: number, iters = 3_000_000): number {
  let acc = 0;
  let x = 12345;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const l = (((x >>> 8) & 0xffff) / 0xffff) * lMax;
    const h = (x & 0x1ff) * (360 / 512);
    acc += lookup(l, h);
  }
  const t1 = process.hrtime.bigint();
  if (acc < 0) console.log('x');
  return Number(t1 - t0) / 1e6 / (iters / 1e6);
}

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;

for (const { name, lut, family, gamut } of LUT_CASES) {
  console.log(`\n══════ ${name}  (fixed ref grid ${REF_L}×${REF_H}) ══════`);
  const ref = buildRef(family, gamut);
  const baseBytes = lut.lSteps * lut.hSteps * 2;
  const baseSpeed = bench((l, h) => maxChroma(lut, l, h), lut.lMax);
  const row = (label: string, m: Metrics, bytes: number, speed: number) =>
    console.log(
      `  ${label.padEnd(24)} over ${pct(m.over).padStart(8)} (@L${m.overL.toFixed(2)} H${m.overH.toFixed(0)})  under ${pct(m.under).padStart(9)}  rms ${pct(m.rms).padStart(7)} | ${String(bytes).padStart(6)}B ${(bytes / baseBytes).toFixed(2)}× | ${speed.toFixed(0)}ms/M ${(speed / baseSpeed).toFixed(2)}×`,
    );

  row('baseline 65×256', measure(ref, lut.cmax, (l, h) => maxChroma(lut, l, h)), baseBytes, baseSpeed);

  for (const [lS, hS] of [[65, 512], [129, 512], [129, 1024]] as [number, number][]) {
    const u = buildUniform(family, gamut, lS, hS);
    row(`uniform ${lS}×${hS}`, measure(ref, u.cmax, (l, h) => maxChroma(u, l, h)), lS * hS * 2, bench((l, h) => maxChroma(u, l, h), u.lMax));
  }

  for (const [nL, nH] of [[48, 192], [64, 320], [96, 512]] as [number, number][]) {
    const nu = buildNonUniform(family, gamut, nL, nH);
    const lk = nonUniformLookup(nu);
    // size: data (uint16) + breakpoints (uint16 each axis)
    const bytes = nu.lbp.length * nu.hbp.length * 2 + nu.lbp.length * 2 + nu.hbp.length * 2;
    row(`adaptive ${nu.lbp.length}×${nu.hbp.length}`, measure(ref, nu.cmax, lk), bytes, bench(lk, nu.lMax));
  }
}
