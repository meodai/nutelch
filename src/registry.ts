import type { Lut } from './luts/decode';
import { okSrgb } from './luts/ok.srgb';
import { okP3 } from './luts/ok.display-p3';
import { cieSrgb } from './luts/cie.srgb';
import { cieP3 } from './luts/cie.display-p3';

// Only the two cusp-native (cylindrical) CSS spaces. Lab/OKLab are just a
// rectangular skin on these — use the exported `toLab` helper if you need a/b.
export type Mode = 'oklch' | 'lch';
export type Gamut = 'srgb' | 'display-p3';
type Family = 'ok' | 'cie';

const FAMILY: Record<Mode, Family> = { oklch: 'ok', lch: 'cie' };
const L_MAX: Record<Family, number> = { ok: 1, cie: 100 };
const LUTS: Record<Family, Record<Gamut, Lut>> = {
  ok: { srgb: okSrgb, 'display-p3': okP3 },
  cie: { srgb: cieSrgb, 'display-p3': cieP3 },
};

export function resolve(mode: Mode, gamut: Gamut): { family: Family; lMax: number; lut: Lut } {
  const family = FAMILY[mode];
  return { family, lMax: L_MAX[family], lut: LUTS[family][gamut] };
}
