import { maxChroma } from './interp';
import type { Gamut, Lut, Mode } from './luts/decode';
import { lchuvToLch } from './luv';

export type { Gamut, Lut, Mode };
export { toLab } from './coords';
// Ottosson's lightness toe + inverse — the OkHSL Lr remap, as opt-in utilities.
export { toe, toeInv } from './toe';
// A single general-purpose easing curve (apply your own for anything richer).
export { smoothstep } from './curves';
// Re-export the self-describing gamut LUTs. Import only the ones you pass to
// cusp()/relch(); tree-shaking drops the rest (package is sideEffects-free and
// each LUT is a /*#__PURE__*/ initializer).
export { oklchSrgb, oklchP3, lchSrgb, lchP3, lchuvSrgb, lchuvP3 } from './luts';

export interface CuspInput {
  lut: Lut;
  l: number;
  h: number;
}
export interface RelchInput {
  lut: Lut;
  l: number;
  relC: number;
  h: number;
}
export interface PeakInput {
  lut: Lut;
  h: number;
}
export interface ReachInput {
  lut: Lut;
  l: number; // achromatic anchor lightness (native scale)
  reach: number; // 0 = the gray at l, 1 = the cusp (overshoot allowed)
  h: number;
}
// l/c/h are the LUT's own space: OKLab L (0..1) for oklch, CIE L* (0..100) for
// lch and lchuv (LCHuv chroma/hue are CIELUV's, not CIELAB's). (HCT colors — tone in `l`, CAM16 chroma/hue — come from 'nutelch/hct'.)
export type Color = { mode: Mode; l: number; c: number; h: number };

// The color sitting on the gamut shell at (l, h). `.c` is the raw max chroma.
// The mode + lightness range come from the LUT you pass in.
export function cusp({ lut, l, h }: CuspInput): Color {
  return { mode: lut.mode, l, c: maxChroma(lut, l, h), h };
}

// relC is 0..1 of the way to the shell (overshoot allowed) -> absolute color.
// Want a non-linear response on any axis? Transform the input yourself before
// calling — e.g. relch({ lut, l: ease(t) * lut.lMax, relC: ease(x), h }).
export function relch({ lut, l, relC, h }: RelchInput): Color {
  return { mode: lut.mode, l, c: relC * maxChroma(lut, l, h), h };
}

// Format a Color (the shape cusp/relch/peak/reach return) as a CSS color string
// in its own space. Trailing float noise is trimmed; oklch L is 0..1, lch L is a
// percentage. CSS has no luv syntax, so an lchuv color is converted exactly to
// the equivalent lch() (both are D50 and share L*). HCT has no CSS syntax and its conversion lives in the separate
// 'nutelch/hct' entry (so OKLCH/LCH users don't ship it) — use toCss from there.
export function toCss({ mode, l, c, h }: Color): string {
  const n = (v: number, d: number) => String(+v.toFixed(d));
  if (mode === 'hct') {
    throw new Error("nutelch: hct colors have no CSS syntax — use toCss from 'nutelch/hct'");
  }
  if (mode === 'lchuv') return toCss({ mode: 'lch', ...lchuvToLch({ l, c, h }) });
  return mode === 'oklch'
    ? `oklch(${n(l, 4)} ${n(c, 4)} ${n(h, 2)})`
    : `lch(${n(l, 2)}% ${n(c, 2)} ${n(h, 2)})`;
}

// The cusp: the most chromatic color of a hue — the peak of the gamut shell over
// ALL lightness (unlike cusp(), which is the max chroma at one given lightness).
// The boundary is piecewise-linear in L between LUT rows, so its maximum lands on
// a row node — scanning the rows finds it exactly. With a non-uniform LUT the rows
// sit at `lbp`; otherwise they are evenly spaced.
export function peak({ lut, h }: PeakInput): Color {
  let bestL = 0;
  let bestC = -1;
  for (let i = 0; i < lut.lSteps; i++) {
    const l = lut.lbp ? lut.lbp[i]! : (i / (lut.lSteps - 1)) * lut.lMax;
    const c = maxChroma(lut, l, h);
    if (c > bestC) {
      bestC = c;
      bestL = l;
    }
  }
  return { mode: lut.mode, l: bestL, c: bestC, h };
}

// Saturation along the ray from an achromatic anchor to the hue's cusp — the
// complement to relch. relch holds lightness and scales chroma to the shell AT
// that L; reach slides L and C together toward the cusp (a shade line). `l` is
// the gray you land on at reach 0; reach 1 is the cusp. The path is a straight
// ray and constant-hue slices aren't perfectly convex, so reach in [0,1] is NOT
// a hard gamut guarantee; reach > 1 overshoots past the cusp, as relch overshoots.
export function reach({ lut, l, reach, h }: ReachInput): Color {
  const tip = peak({ lut, h });
  return { mode: lut.mode, l: l + reach * (tip.l - l), c: reach * tip.c, h };
}
