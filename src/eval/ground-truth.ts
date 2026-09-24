// Ground truth for LUT accuracy work — the build (scripts/build-luts.ts), the
// report, and the regression tests all call trueMaxChroma, so they can never drift.
// It deliberately imports no LUT module (the shipped-LUT list is lut-cases.ts):
// the build must run even when a family's LUT files don't exist yet.
// OKLCH/LCH use culori; HCT uses nutelch's own conversion (culori has no CAM16).
// This module pulls in culori (a build/dev dependency) and is NOT reachable from
// src/index.ts, so it never lands in the shipped bundle.
import { clampChroma } from 'culori';
import type { Gamut, Mode } from '../luts/decode';
import { hctToXyz, xyzToLinearRgb } from '../hct/convert';

export type Family = 'ok' | 'cie' | 'luv' | 'hct';
export type { Gamut };

// The RGB space culori clamps into, per gamut.
export const RGB_GAMUT: Record<Gamut, string> = { srgb: 'rgb', 'display-p3': 'p3' };

// Per-family cylindrical space + lightness range + a chroma ceiling that sits
// above any achievable boundary chroma (so clampChroma always pulls inward).
export const FAMILY: Record<Family, { mode: Mode; lMax: number; ceiling: number }> = {
  ok: { mode: 'oklch', lMax: 1, ceiling: 0.5 },
  cie: { mode: 'lch', lMax: 100, ceiling: 160 },
  luv: { mode: 'lchuv', lMax: 100, ceiling: 260 }, // above any sRGB/P3 LCHuv chroma (~180/~200)
  hct: { mode: 'hct', lMax: 100, ceiling: 200 }, // above any sRGB/P3 HCT chroma
};

// HCT boundary: culori has no CAM16/HCT, so bisect chroma against our own HCT →
// linear RGB (src/hct/convert.ts, cross-checked against Material in convert.test.ts). Like
// clampChroma, this assumes the in-gamut chroma range at fixed (tone, hue) is
// [0, boundary]. A scan (tone step 2, hue step 3, chroma step 1 out to 200) found
// no in-gamut chroma past the bisected boundary for either sRGB or P3.
const IN_GAMUT_EPS = 1e-9;
function hctMaxChroma(gamut: Gamut, t: number, h: number): number {
  if (t <= 0 || t >= 100) return 0;
  const inside = (c: number) => {
    const rgb = xyzToLinearRgb(...hctToXyz(h, c, t), gamut);
    return rgb.every((v) => v >= -IN_GAMUT_EPS && v <= 1 + IN_GAMUT_EPS);
  };
  let lo = 0;
  let hi = FAMILY.hct.ceiling;
  while (hi - lo > 1e-7) {
    const mid = (lo + hi) / 2;
    if (inside(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

// The exact boundary chroma at (l, h): start at the ceiling and clamp into gamut.
// scripts/build-luts.ts samples its LUTs with this very function.
export function trueMaxChroma(family: Family, gamut: Gamut, l: number, h: number): number {
  if (family === 'hct') return hctMaxChroma(gamut, l, h);
  const { mode, ceiling } = FAMILY[family];
  const clamped = clampChroma({ mode, l, c: ceiling, h } as never, mode, RGB_GAMUT[gamut]);
  return (clamped as { c?: number }).c ?? 0;
}
