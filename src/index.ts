import { maxChroma } from './interp';
import type { Lut, Mode } from './luts/decode';

export type { Lut, Mode };
export { toLab } from './coords';
// Re-export the self-describing gamut LUTs. Import only the ones you pass to
// cusp()/relch(); tree-shaking drops the rest (package is sideEffects-free and
// each LUT is a /*#__PURE__*/ initializer).
export { oklchSrgb, oklchP3, lchSrgb, lchP3 } from './luts';

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
