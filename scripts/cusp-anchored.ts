// Focused test of the CUSP-ANCHORED representation: per hue store the cusp
// (Lc, Cc) EXACTLY, plus a few chroma knots along each edge (positions relative
// to the cusp, dense near it). Because a node lands on the cusp, the slope
// discontinuity that makes bilinear bulge is gone by construction.
//   npx tsx scripts/cusp-anchored.ts
import { FAMILY, trueMaxChroma, type Family, type Gamut } from '../src/eval/ground-truth';
import { oklchSrgb, lchSrgb } from '../src/luts';
import type { Lut } from '../src/luts/decode';
import { maxChroma } from '../src/interp';

const REF_L = 400;
const REF_H = 1440;
type Lookup = (l: number, h: number) => number;

function buildRef(family: Family, gamut: Gamut) {
  const lMax = FAMILY[family].lMax;
  const l = new Float64Array(REF_L);
  const h = new Float64Array(REF_H);
  for (let i = 0; i < REF_L; i++) l[i] = ((i + 0.5) / REF_L) * lMax;
  for (let j = 0; j < REF_H; j++) h[j] = (j / REF_H) * 360;
  const truth = new Float64Array(REF_L * REF_H);
  for (let i = 0; i < REF_L; i++) for (let j = 0; j < REF_H; j++) truth[i * REF_H + j] = trueMaxChroma(family, gamut, l[i]!, h[j]!);
  return { l, h, truth };
}
function measure(ref: ReturnType<typeof buildRef>, cmax: number, lookup: Lookup) {
  let over = -Infinity;
  let under = Infinity;
  let oL = 0;
  let oH = 0;
  let sumSq = 0;
  for (let i = 0; i < REF_L; i++)
    for (let j = 0; j < REF_H; j++) {
      const e = (lookup(ref.l[i]!, ref.h[j]!) - ref.truth[i * REF_H + j]!) / cmax;
      if (e > over) {
        over = e;
        oL = ref.l[i]!;
        oH = ref.h[j]!;
      }
      if (e < under) under = e;
      sumSq += e * e;
    }
  return { over, under, rms: Math.sqrt(sumSq / (REF_L * REF_H)), oL, oH };
}
function bench(lookup: Lookup, lMax: number, iters = 3_000_000) {
  let acc = 0;
  let x = 12345;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    acc += lookup((((x >>> 8) & 0xffff) / 0xffff) * lMax, (x & 0x1ff) * (360 / 512));
  }
  const t1 = process.hrtime.bigint();
  if (acc < 0) console.log('x');
  return Number(t1 - t0) / 1e6 / (iters / 1e6);
}

function buildCuspAnchored(family: Family, gamut: Gamut, hSteps: number, lowFr: number[], highFr: number[]) {
  const lMax = FAMILY[family].lMax;
  const cuspL = new Float64Array(hSteps);
  const cuspC = new Float64Array(hSteps);
  const low = new Float64Array(hSteps * lowFr.length);
  const high = new Float64Array(hSteps * highFr.length);
  for (let hi = 0; hi < hSteps; hi++) {
    const h = (hi / hSteps) * 360;
    // find cusp by fine scan + refine
    let bL = 0;
    let bC = -1;
    const N = 2048;
    for (let i = 1; i < N; i++) {
      const l = (i / N) * lMax;
      const c = trueMaxChroma(family, gamut, l, h);
      if (c > bC) {
        bC = c;
        bL = l;
      }
    }
    for (let i = -16; i <= 16; i++) {
      const l = bL + (i / 16) * (lMax / N);
      if (l <= 0 || l >= lMax) continue;
      const c = trueMaxChroma(family, gamut, l, h);
      if (c > bC) {
        bC = c;
        bL = l;
      }
    }
    cuspL[hi] = bL;
    cuspC[hi] = bC;
    for (let k = 0; k < lowFr.length; k++) low[hi * lowFr.length + k] = trueMaxChroma(family, gamut, lowFr[k]! * bL, h);
    for (let k = 0; k < highFr.length; k++) high[hi * highFr.length + k] = trueMaxChroma(family, gamut, bL + highFr[k]! * (lMax - bL), h);
  }
  return { lMax, hSteps, cuspL, cuspC, lowFr, highFr, low, high };
}
function cuspAnchoredLookup(m: ReturnType<typeof buildCuspAnchored>): Lookup {
  const { lMax, hSteps, cuspL, cuspC, lowFr, highFr, low, high } = m;
  const nl = lowFr.length;
  const nh = highFr.length;
  const lowPos = [0, ...lowFr, 1];
  const highPos = [0, ...highFr, 1];
  return (l, h) => {
    if (l <= 0 || l >= lMax) return 0;
    const hue = ((((h % 360) + 360) % 360) / 360) * hSteps;
    const hb = Math.floor(hue);
    const h0 = hb % hSteps;
    const h1 = (h0 + 1) % hSteps;
    const th = hue - hb;
    const Lc = cuspL[h0]! + (cuspL[h1]! - cuspL[h0]!) * th;
    const lerpHue = (arr: Float64Array, n: number, k: number) => arr[h0 * n + k]! + (arr[h1 * n + k]! - arr[h0 * n + k]!) * th;
    const Cc = cuspC[h0]! + (cuspC[h1]! - cuspC[h0]!) * th;
    let frac: number;
    let pos: number[];
    let lo: Float64Array;
    let n: number;
    let isLow: boolean;
    if (l <= Lc) {
      frac = Lc > 0 ? l / Lc : 0;
      pos = lowPos;
      lo = low;
      n = nl;
      isLow = true;
    } else {
      frac = (l - Lc) / (lMax - Lc);
      pos = highPos;
      lo = high;
      n = nh;
      isLow = false;
    }
    const valAt = (idx: number): number => {
      if (isLow) {
        if (idx === 0) return 0;
        if (idx === n + 1) return Cc;
        return lerpHue(lo, n, idx - 1);
      } else {
        if (idx === 0) return Cc;
        if (idx === n + 1) return 0;
        return lerpHue(lo, n, idx - 1);
      }
    };
    let s = 0;
    while (s < pos.length - 2 && frac > pos[s + 1]!) s++;
    const t = (frac - pos[s]!) / (pos[s + 1]! - pos[s]! || 1);
    return valAt(s) + (valAt(s + 1) - valAt(s)) * t;
  };
}

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;
const CASES: { name: string; lut: Lut; family: Family; gamut: Gamut }[] = [
  { name: 'oklchSrgb', lut: oklchSrgb, family: 'ok', gamut: 'srgb' },
  { name: 'lchSrgb', lut: lchSrgb, family: 'cie', gamut: 'srgb' },
];

for (const { name, lut, family, gamut } of CASES) {
  console.log(`\n══════ ${name} ══════`);
  const ref = buildRef(family, gamut);
  const baseBytes = lut.lSteps * lut.hSteps * 2;
  const baseSpeed = bench((l, h) => maxChroma(lut, l, h), lut.lMax);
  const b = measure(ref, lut.cmax, (l, h) => maxChroma(lut, l, h));
  console.log(`  baseline 65×256          over ${pct(b.over).padStart(8)}  under ${pct(b.under).padStart(9)}  rms ${pct(b.rms).padStart(7)} | ${baseBytes}B 1.00× | ${baseSpeed.toFixed(0)}ms/M 1.00×`);

  const configs: { hS: number; lowFr: number[]; highFr: number[] }[] = [
    { hS: 256, lowFr: [0.5, 0.85], highFr: [0.15, 0.5] },
    { hS: 512, lowFr: [0.4, 0.7, 0.9], highFr: [0.1, 0.3, 0.6] },
    { hS: 720, lowFr: [0.4, 0.7, 0.9], highFr: [0.1, 0.3, 0.6] },
  ];
  for (const cfg of configs) {
    const m = buildCuspAnchored(family, gamut, cfg.hS, cfg.lowFr, cfg.highFr);
    const lk = cuspAnchoredLookup(m);
    const r = measure(ref, lut.cmax, lk);
    const perHue = 2 + cfg.lowFr.length + cfg.highFr.length;
    const bytes = cfg.hS * perHue * 2;
    console.log(
      `  cusp h=${cfg.hS} +${cfg.lowFr.length}/${cfg.highFr.length}knots    over ${pct(r.over).padStart(8)} (@L${r.oL.toFixed(2)} H${r.oH.toFixed(0)})  under ${pct(r.under).padStart(9)}  rms ${pct(r.rms).padStart(7)} | ${bytes}B ${(bytes / baseBytes).toFixed(2)}× | ${bench(lk, lut.lMax).toFixed(0)}ms/M ${(bench(lk, lut.lMax) / baseSpeed).toFixed(2)}×`,
    );
  }
}
