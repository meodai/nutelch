import { describe, it, expect } from 'vitest';
import { clampChroma } from 'culori';
import { maxChroma } from './interp';
import type { Lut } from './luts/decode';
import { oklchSrgb, oklchP3, lchSrgb, lchP3 } from './luts';

// "Direct conversion": compute the gamut-boundary chroma live with culori, the
// same way the LUTs were generated. This is what nutColor's LUT + bilinear
// interpolation approximates, so we can measure both accuracy and speed against it.
function actualMax(mode: 'oklch' | 'lch', l: number, h: number, rgbGamut: string, ceiling: number) {
  const clamped = clampChroma({ mode, l, c: ceiling, h } as never, mode, rgbGamut);
  return (clamped as { c?: number }).c ?? 0;
}

interface Case {
  name: string;
  lut: Lut;
  mode: 'oklch' | 'lch';
  rgb: string;
  ceiling: number;
  // accuracy bounds (abs chroma in the family's scale)
  meanMax: number;
  absMax: number;
}

const CASES: Case[] = [
  { name: 'oklch/srgb', lut: oklchSrgb, mode: 'oklch', rgb: 'rgb', ceiling: 0.5, meanMax: 0.002, absMax: 0.05 },
  { name: 'oklch/p3', lut: oklchP3, mode: 'oklch', rgb: 'p3', ceiling: 0.5, meanMax: 0.002, absMax: 0.05 },
  { name: 'lch/srgb', lut: lchSrgb, mode: 'lch', rgb: 'rgb', ceiling: 160, meanMax: 0.2, absMax: 60 },
  { name: 'lch/p3', lut: lchP3, mode: 'lch', rgb: 'p3', ceiling: 160, meanMax: 0.2, absMax: 60 },
];

// Interior lightness + hue sweep (extremes are 0 by construction).
function sweep(lMax: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let li = 1; li <= 19; li++) {
    const l = (li / 20) * lMax;
    for (let h = 0; h < 360; h += 5) pts.push([l, h]);
  }
  return pts;
}

describe('LUT + interpolation vs direct culori conversion', () => {
  it('matches the directly-computed cusp within bounds (and reports the envelope)', () => {
    for (const c of CASES) {
      const pts = sweep(c.lut.lMax);
      let absMax = 0;
      let sumAbs = 0;
      let relMax = 0;
      for (const [l, h] of pts) {
        const lutC = maxChroma(c.lut, l, h);
        const actC = actualMax(c.mode, l, h, c.rgb, c.ceiling);
        const e = Math.abs(lutC - actC);
        sumAbs += e;
        if (e > absMax) absMax = e;
        if (actC > 1e-6) relMax = Math.max(relMax, e / actC);
      }
      const mean = sumAbs / pts.length;
      // eslint-disable-next-line no-console
      console.log(
        `${c.name}: meanAbs=${mean.toFixed(5)} maxAbs=${absMax.toFixed(4)} maxRel=${(relMax * 100).toFixed(1)}%`,
      );
      expect(mean).toBeLessThan(c.meanMax);
      expect(absMax).toBeLessThan(c.absMax);
    }
  });

  it('is dramatically faster than direct culori conversion', () => {
    const { lut, mode, rgb, ceiling } = CASES[0]!;
    const pts = sweep(lut.lMax);
    const ROUNDS = 30;

    // warm up
    for (const [l, h] of pts) maxChroma(lut, l, h);
    for (const [l, h] of pts) actualMax(mode, l, h, rgb, ceiling);

    const t0 = performance.now();
    for (let r = 0; r < ROUNDS; r++) for (const [l, h] of pts) maxChroma(lut, l, h);
    const lutMs = performance.now() - t0;

    const t1 = performance.now();
    for (let r = 0; r < ROUNDS; r++) for (const [l, h] of pts) actualMax(mode, l, h, rgb, ceiling);
    const culoriMs = performance.now() - t1;

    const n = ROUNDS * pts.length;
    // eslint-disable-next-line no-console
    console.log(
      `speed (${n} lookups): LUT=${lutMs.toFixed(1)}ms  culori=${culoriMs.toFixed(1)}ms  speedup=${(culoriMs / lutMs).toFixed(0)}x`,
    );
    expect(lutMs).toBeLessThan(culoriMs);
  });
});
