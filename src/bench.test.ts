import { describe, it, expect } from 'vitest';
import { clampChroma, converter } from 'culori';
import { maxChroma } from './interp';
import { relch } from './index';
import type { Lut } from './luts/decode';
import { oklchSrgb, oklchP3, lchSrgb, lchP3 } from './luts';

const toOklch = converter('oklch');

// Ottosson's lightness toe: feeding okhsl.l = toe(L) places OkHSL at OKLab
// lightness L, so its boundary is comparable to nutelch's at the same L.
function toe(x: number): number {
  const k1 = 0.206;
  const k2 = 0.03;
  const k3 = (1 + k1) / (1 + k2);
  return 0.5 * (k3 * x - k1 + Math.sqrt((k3 * x - k1) ** 2 + 4 * k2 * k3 * x));
}

// "Direct conversion": compute the gamut-boundary chroma live with culori, the
// same way the LUTs were generated. This is what nutelch's LUT + bilinear
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

// OkHSL is the closest sibling: its saturation is per-lightness-boundary
// normalized, like relC. Here we compare both as gamut-boundary approximations
// of sRGB (oklch family), and on speed, using culori's okhsl.
describe('nutelch vs OkHSL (culori)', () => {
  const ceiling = 0.5;

  it('characterizes boundary error vs OkHSL (both small; OkHSL is analytic, nutelch is a sampled LUT)', () => {
    const pts = sweep(1); // OKLab L 0.05..0.95
    let lutMax = 0;
    let lutSum = 0;
    let okMax = 0;
    let okSum = 0;
    for (const [l, h] of pts) {
      const actC = actualMax('oklch', l, h, 'rgb', ceiling);
      // nutelch LUT boundary
      const lutE = Math.abs(maxChroma(oklchSrgb, l, h) - actC);
      // OkHSL analytic boundary (s = 1) at the same OKLab lightness
      const ok = toOklch({ mode: 'okhsl', h, s: 1, l: toe(l) } as never) as { c?: number };
      const okE = Math.abs((ok.c ?? 0) - actC);
      lutSum += lutE;
      okSum += okE;
      if (lutE > lutMax) lutMax = lutE;
      if (okE > okMax) okMax = okE;
    }
    const n = pts.length;
    // eslint-disable-next-line no-console
    console.log(
      `boundary error vs true sRGB gamut — nutelch: mean=${(lutSum / n).toFixed(5)} max=${lutMax.toFixed(4)} | okhsl: mean=${(okSum / n).toFixed(5)} max=${okMax.toFixed(4)}`,
    );
    // Both track the true gamut closely. OkHSL's analytic boundary is the exact
    // form of the same sRGB cusp model, so it edges out nutelch's sampled LUT on
    // sRGB; nutelch trades that for generality (P3 + CIE) and speed.
    expect(lutSum / n).toBeLessThan(0.001);
    expect(okSum / n).toBeLessThan(0.001);
  });

  it('produces a boundary-relative color faster than an OkHSL conversion', () => {
    const pts = sweep(1);
    const ROUNDS = 30;

    for (const [l, h] of pts) relch({ lut: oklchSrgb, l, relC: 0.8, h });
    for (const [l, h] of pts) toOklch({ mode: 'okhsl', h, s: 0.8, l } as never);

    const t0 = performance.now();
    for (let r = 0; r < ROUNDS; r++) for (const [l, h] of pts) relch({ lut: oklchSrgb, l, relC: 0.8, h });
    const lutMs = performance.now() - t0;

    const t1 = performance.now();
    for (let r = 0; r < ROUNDS; r++)
      for (const [l, h] of pts) toOklch({ mode: 'okhsl', h, s: 0.8, l } as never);
    const okMs = performance.now() - t1;

    // eslint-disable-next-line no-console
    console.log(
      `speed (${ROUNDS * pts.length} colors): nutelch relch=${lutMs.toFixed(1)}ms  okhsl=${okMs.toFixed(1)}ms  speedup=${(okMs / lutMs).toFixed(0)}x`,
    );
    expect(lutMs).toBeLessThan(okMs);
  });
});
