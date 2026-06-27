import type { Lut } from './luts/decode';
import { okSrgb } from './luts/ok.srgb';
import { okP3 } from './luts/ok.display-p3';
import { cieSrgb } from './luts/cie.srgb';
import { cieP3 } from './luts/cie.display-p3';

export type Mode = 'oklch' | 'oklab' | 'lch' | 'lab';
export type Gamut = 'srgb' | 'display-p3';
type Family = 'ok' | 'cie';

const FAMILY: Record<Mode, Family> = { oklch: 'ok', oklab: 'ok', lch: 'cie', lab: 'cie' };
const CYLINDRICAL: Record<Mode, boolean> = { oklch: true, oklab: false, lch: true, lab: false };
const L_MAX: Record<Family, number> = { ok: 1, cie: 100 };
const LUTS: Record<Family, Record<Gamut, Lut>> = {
  ok: { srgb: okSrgb, 'display-p3': okP3 },
  cie: { srgb: cieSrgb, 'display-p3': cieP3 },
};

export function resolve(
  mode: Mode,
  gamut: Gamut,
): { family: Family; lMax: number; cylindrical: boolean; lut: Lut } {
  const family = FAMILY[mode];
  return { family, lMax: L_MAX[family], cylindrical: CYLINDRICAL[mode], lut: LUTS[family][gamut] };
}
