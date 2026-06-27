import { resolve, type Mode, type Gamut } from './registry';
import { maxChroma } from './interp';

export type { Mode, Gamut };
export { toLab } from './coords';

export interface CuspInput {
  mode?: Mode;
  l: number;
  h: number;
  gamut?: Gamut;
}
export interface RelchInput {
  mode?: Mode;
  l: number;
  relC: number;
  h: number;
  gamut?: Gamut;
}
export type Color = { mode: Mode; l: number; c: number; h: number };

// The color sitting on the gamut shell at (l, h). `.c` is the raw max chroma.
export function cusp(input: CuspInput): Color {
  const mode = input.mode ?? 'oklch';
  const gamut = input.gamut ?? 'srgb';
  const { lMax, lut } = resolve(mode, gamut);
  return { mode, l: input.l, c: maxChroma(lut, input.l, lMax, input.h), h: input.h };
}

// relC is 0..1 of the way to the shell (overshoot allowed) -> absolute color.
export function relch(input: RelchInput): Color {
  const mode = input.mode ?? 'oklch';
  const gamut = input.gamut ?? 'srgb';
  const { lMax, lut } = resolve(mode, gamut);
  return { mode, l: input.l, c: input.relC * maxChroma(lut, input.l, lMax, input.h), h: input.h };
}
