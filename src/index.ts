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
  // Optional response curve applied to relC before scaling by the cusp.
  // Default is identity (linear). A well-behaved ease maps 0→0 and 1→1 so
  // relC: 1 still lands exactly on the shell.
  ease?: (relC: number) => number;
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
// An optional `ease` reshapes relC first; default is linear.
export function relch(input: RelchInput): Color {
  const mode = input.mode ?? 'oklch';
  const gamut = input.gamut ?? 'srgb';
  const { lMax, lut } = resolve(mode, gamut);
  const t = input.ease ? input.ease(input.relC) : input.relC;
  return { mode, l: input.l, c: t * maxChroma(lut, input.l, lMax, input.h), h: input.h };
}
