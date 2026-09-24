// nutelch/hct — the HCT add-on entry. Kept separate from the core ('nutelch') so
// OKLCH/LCH users never ship the CAM16 conversion.
//
// HCT is Google Material's color space: CAM16 hue and chroma, and tone = CIE L*.
// This entry gives HCT-flavored versions of the core functions: lightness may be
// passed as `t` (tone, Material's name) or `l`, and toCss understands hct colors.
// Returned Colors keep the core shape, so tone comes back as `.l`.
import * as core from '../index';
import type { Color, Lut } from '../index';
import { hctToOklch } from './convert';

export type { Color, Gamut, Lut, Mode } from '../index';
export { hctSrgb } from '../luts/hct-srgb';
export { hctP3 } from '../luts/hct-display-p3';
export { hctToRgb, type HctInput } from './convert';
// peak() takes no lightness, so the core one serves as is.
export { peak } from '../index';

// Lightness as `t` (tone) or `l` — the same value on the LUT's native scale
// (0..100 for HCT). Give exactly one.
export type Tone = { t: number; l?: never } | { l: number; t?: never };
const tone = (i: Tone): number => (i.t ?? i.l)!;

export type CuspInput = { lut: Lut; h: number } & Tone;
export type RelchInput = { lut: Lut; relC: number; h: number } & Tone;
export type ReachInput = { lut: Lut; reach: number; h: number } & Tone;

export function cusp(input: CuspInput): Color {
  return core.cusp({ lut: input.lut, l: tone(input), h: input.h });
}

export function relch(input: RelchInput): Color {
  return core.relch({ lut: input.lut, l: tone(input), relC: input.relC, h: input.h });
}

export function reach(input: ReachInput): Color {
  return core.reach({ lut: input.lut, l: tone(input), reach: input.reach, h: input.h });
}

// Like the core toCss, plus hct: CSS has no HCT syntax, so an hct Color is
// converted exactly (no gamut clipping) and emitted as oklch(). Other modes are
// formatted by the core. Returns an oklch() with NaN if the (h, c, tone) cannot
// exist — see hctToRgb.
export function toCss(color: Color): string {
  if (color.mode !== 'hct') return core.toCss(color);
  const ok = hctToOklch(color);
  return core.toCss({ mode: 'oklch', l: ok.l, c: ok.c, h: ok.h });
}
