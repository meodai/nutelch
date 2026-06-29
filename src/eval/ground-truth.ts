// Ground truth for LUT accuracy work — the same culori call the build uses, in
// one place so the build, the report, and the regression tests can never drift.
// This module pulls in culori (a build/dev dependency) and is NOT reachable from
// src/index.ts, so it never lands in the shipped bundle.
import { clampChroma } from 'culori';
import type { Lut } from '../luts/decode';
import { oklchSrgb, oklchP3, lchSrgb, lchP3 } from '../luts';

export type Family = 'ok' | 'cie';
export type Gamut = 'srgb' | 'display-p3';

// The RGB space culori clamps into, per gamut.
export const RGB_GAMUT: Record<Gamut, string> = { srgb: 'rgb', 'display-p3': 'p3' };

// Per-family cylindrical space + lightness range + a chroma ceiling that sits
// above any achievable boundary chroma (so clampChroma always pulls inward).
export const FAMILY: Record<Family, { mode: 'oklch' | 'lch'; lMax: number; ceiling: number }> = {
  ok: { mode: 'oklch', lMax: 1, ceiling: 0.5 },
  cie: { mode: 'lch', lMax: 100, ceiling: 160 },
};

// The exact boundary chroma at (l, h): start at the ceiling and clamp into gamut.
// Identical to scripts/build-luts.ts, by construction (same helper).
export function trueMaxChroma(family: Family, gamut: Gamut, l: number, h: number): number {
  const { mode, ceiling } = FAMILY[family];
  const clamped = clampChroma({ mode, l, c: ceiling, h } as never, mode, RGB_GAMUT[gamut]);
  return (clamped as { c?: number }).c ?? 0;
}

// Pairs each shipped LUT with the (family, gamut) that generated it, so callers
// can iterate "every LUT and its ground truth" without re-deriving the mapping.
export interface LutCase {
  name: string;
  lut: Lut;
  family: Family;
  gamut: Gamut;
}

export const LUT_CASES: LutCase[] = [
  { name: 'oklchSrgb', lut: oklchSrgb, family: 'ok', gamut: 'srgb' },
  { name: 'oklchP3', lut: oklchP3, family: 'ok', gamut: 'display-p3' },
  { name: 'lchSrgb', lut: lchSrgb, family: 'cie', gamut: 'srgb' },
  { name: 'lchP3', lut: lchP3, family: 'cie', gamut: 'display-p3' },
];
