// Every shipped LUT paired with the (family, gamut) that generated it, so the
// report and the regression tests can iterate "each LUT and its ground truth".
// Kept apart from ground-truth.ts, which the LUT build imports: the build must not
// depend on the LUT files it is about to write.
import type { Gamut, Lut } from '../luts/decode';
import type { Family } from './ground-truth';
import { oklchSrgb, oklchP3, lchSrgb, lchP3, lchuvSrgb, lchuvP3 } from '../luts';
import { hctSrgb, hctP3 } from '../hct';

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
  { name: 'lchuvSrgb', lut: lchuvSrgb, family: 'luv', gamut: 'srgb' },
  { name: 'lchuvP3', lut: lchuvP3, family: 'luv', gamut: 'display-p3' },
  { name: 'hctSrgb', lut: hctSrgb, family: 'hct', gamut: 'srgb' },
  { name: 'hctP3', lut: hctP3, family: 'hct', gamut: 'display-p3' },
];
