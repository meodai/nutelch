import { resolve, type Mode, type Gamut } from './registry';
import { maxChroma } from './interp';
import { toRect } from './coords';

export type { Mode, Gamut };

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
export type ColorLCH = { mode: Mode; l: number; c: number; h: number };
export type ColorLab = { mode: Mode; l: number; a: number; b: number };

function build(mode: Mode, cylindrical: boolean, l: number, c: number, h: number): ColorLCH | ColorLab {
  return cylindrical ? { mode, l, c, h } : { mode, ...toRect(l, c, h) };
}

// The color sitting on the gamut shell at (l, h). `.c` is the raw max chroma.
export function cusp(input: CuspInput): ColorLCH | ColorLab {
  const mode = input.mode ?? 'oklch';
  const gamut = input.gamut ?? 'srgb';
  const { lMax, cylindrical, lut } = resolve(mode, gamut);
  const c = maxChroma(lut, input.l, lMax, input.h);
  return build(mode, cylindrical, input.l, c, input.h);
}

// relC is 0..1 of the way to the shell (overshoot allowed) -> absolute color.
export function relch(input: RelchInput): ColorLCH | ColorLab {
  const mode = input.mode ?? 'oklch';
  const gamut = input.gamut ?? 'srgb';
  const { lMax, cylindrical, lut } = resolve(mode, gamut);
  const c = input.relC * maxChroma(lut, input.l, lMax, input.h);
  return build(mode, cylindrical, input.l, c, input.h);
}
