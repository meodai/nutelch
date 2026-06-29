// Accuracy report for the shipped LUTs vs culori ground truth.
//   npm run eval:luts
// Prints, per LUT: worst overshoot/undershoot (as % of cmax and where), mean/p99/
// rms error, a hue sparkline of the overshoot ridge, and the top offending points.
import type { Lut } from '../src/luts/decode';
import { evalLut } from '../src/eval/eval-lut';
import { LUT_CASES, FAMILY, trueMaxChroma, type Family, type Gamut } from '../src/eval/ground-truth';
import { maxChroma } from '../src/interp';

const BARS = ' ▁▂▃▄▅▆▇█';
const OFFSETS = [0.25, 0.5, 0.75];

function sparkline(values: Float64Array): string {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  if (max <= 0) return ' '.repeat(values.length);
  let out = '';
  for (const v of values) {
    const idx = Math.min(BARS.length - 1, Math.max(0, Math.round((v / max) * (BARS.length - 1))));
    out += BARS[idx];
  }
  return out;
}

const pct = (frac: number) => `${(frac * 100).toFixed(3)}%`;

function topOffenders(lut: Lut, family: Family, gamut: Gamut, n: number) {
  const { lSteps, hSteps, lbp, hbp } = lut;
  const lMax = FAMILY[family].lMax;
  const pts: { l: number; h: number; over: number }[] = [];
  for (let li = 0; li < lSteps - 1; li++) {
    const lA = lbp ? lbp[li]! : (li / (lSteps - 1)) * lMax;
    const lB = lbp ? lbp[li + 1]! : ((li + 1) / (lSteps - 1)) * lMax;
    for (const ol of OFFSETS) {
      const l = lA + ol * (lB - lA);
      for (let hi = 0; hi < hSteps; hi++) {
        const hA = hbp ? hbp[hi]! : (hi / hSteps) * 360;
        const hB = hbp ? (hi + 1 < hSteps ? hbp[hi + 1]! : hbp[0]! + 360) : ((hi + 1) / hSteps) * 360;
        for (const oh of OFFSETS) {
          const h = hA + oh * (hB - hA);
          pts.push({ l, h, over: maxChroma(lut, l, h) - trueMaxChroma(family, gamut, l, h) });
        }
      }
    }
  }
  pts.sort((a, b) => b.over - a.over);
  return pts.slice(0, n);
}

console.log('LUT accuracy vs culori ground truth (error = LUT − truth, + = overshoot)\n');

for (const { name, lut, family, gamut } of LUT_CASES) {
  const r = evalLut(name, lut, family, gamut);
  const o = r.maxOvershoot;
  const u = r.maxUndershoot;
  console.log(`── ${name}  (${lut.lSteps}×${lut.hSteps}, cmax=${lut.cmax.toFixed(4)}, ${r.samples} probes)`);
  console.log(`   max overshoot : ${pct(o.frac).padStart(8)}  (Δ${o.abs.toFixed(4)})  @ L=${o.l.toFixed(3)} H=${o.h.toFixed(1)}`);
  console.log(`   max undershoot: ${pct(u.frac).padStart(8)}  (Δ${u.abs.toFixed(4)})  @ L=${u.l.toFixed(3)} H=${u.h.toFixed(1)}`);
  console.log(`   mean |err|    : ${pct(r.meanAbsFrac).padStart(8)}    p99: ${pct(r.p99AbsFrac)}    rms: ${pct(r.rmsFrac)}`);
  console.log(`   overshoot by hue (0°→360°):`);
  console.log(`   |${sparkline(r.perHueMaxOvershoot)}|`);
  console.log(`   worst points:`);
  for (const p of topOffenders(lut, family, gamut, 6)) {
    console.log(`     L=${p.l.toFixed(3)} H=${p.h.toFixed(1)}  Δ${p.over.toFixed(4)} (${pct(p.over / lut.cmax)})`);
  }
  console.log();
}
