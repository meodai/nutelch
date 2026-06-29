// Fair apples-to-apples: the OLD uniform 65×256 vs the shipped adaptive 49×192,
// each measured on its OWN real cell interiors (the corrected evalLut), against
// culori truth. Also a practical fixed-grid worst-case (0.25° hue) that steps over
// the sub-0.02° non-convex blue/yellow corner singularity, to separate "intrinsic
// gamut singularity" from "representation error a user actually meets".
import type { Lut } from '../src/luts/decode';
import { maxChroma } from '../src/interp';
import { evalLut } from '../src/eval/eval-lut';
import { LUT_CASES, FAMILY, trueMaxChroma, type Family, type Gamut } from '../src/eval/ground-truth';

function buildUniform(family: Family, gamut: Gamut, lSteps: number, hSteps: number): Lut {
  const lMax = FAMILY[family].lMax;
  const raw = new Float64Array(lSteps * hSteps);
  let cmax = 0;
  for (let li = 0; li < lSteps; li++)
    for (let hi = 0; hi < hSteps; hi++) {
      const c = li > 0 && li < lSteps - 1 ? trueMaxChroma(family, gamut, (li / (lSteps - 1)) * lMax, (hi / hSteps) * 360) : 0;
      raw[li * hSteps + hi] = c;
      if (c > cmax) cmax = c;
    }
  const data = new Uint16Array(lSteps * hSteps);
  for (let i = 0; i < raw.length; i++) data[i] = Math.round((raw[i]! / cmax) * 65535);
  return { mode: FAMILY[family].mode, lMax, cmax, lSteps, hSteps, data };
}

// practical worst-case on a fixed 0.25°/0.0025-L grid (misses the singular sliver)
function practical(lut: Lut, family: Family, gamut: Gamut) {
  const lMax = FAMILY[family].lMax;
  let over = 0;
  let under = 0;
  for (let i = 1; i < 400; i++) {
    const l = (i / 400) * lMax;
    for (let j = 0; j < 1440; j++) {
      const h = (j / 1440) * 360;
      const e = (maxChroma(lut, l, h) - trueMaxChroma(family, gamut, l, h)) / lut.cmax;
      if (e > over) over = e;
      if (e < under) under = e;
    }
  }
  return { over, under };
}

const pct = (f: number) => `${(f * 100).toFixed(2)}%`;

console.log('representation        | cell-interior worst (over/under) | rms    p99   | practical worst (over/under)');
for (const { name, lut, family, gamut } of LUT_CASES) {
  const uni = buildUniform(family, gamut, 65, 256);
  const eu = evalLut(name, uni, family, gamut);
  const ea = evalLut(name, lut, family, gamut);
  const pu = practical(uni, family, gamut);
  const pa = practical(lut, family, gamut);
  console.log(`\n${name}`);
  console.log(`  uniform 65×256      | ${pct(eu.maxOvershoot.frac).padStart(7)} / ${pct(eu.maxUndershoot.frac).padStart(8)}        | ${pct(eu.rmsFrac).padStart(6)} ${pct(eu.p99AbsFrac).padStart(6)} | ${pct(pu.over).padStart(7)} / ${pct(pu.under).padStart(8)}`);
  console.log(`  adaptive 49×192     | ${pct(ea.maxOvershoot.frac).padStart(7)} / ${pct(ea.maxUndershoot.frac).padStart(8)}        | ${pct(ea.rmsFrac).padStart(6)} ${pct(ea.p99AbsFrac).padStart(6)} | ${pct(pa.over).padStart(7)} / ${pct(pa.under).padStart(8)}`);
}
