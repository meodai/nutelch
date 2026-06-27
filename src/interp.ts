import type { Lut } from './luts/decode';

// Bilinear lookup of the boundary chroma at (l, h). l is clamped to [0, lut.lMax];
// h wraps modulo 360 across the hue seam.
export function maxChroma(lut: Lut, l: number, h: number): number {
  const { data, cmax, lSteps, hSteps, lMax } = lut;

  const lf = Math.min(Math.max(l / lMax, 0), 1) * (lSteps - 1);
  const l0 = Math.floor(lf);
  const l1 = Math.min(l0 + 1, lSteps - 1);
  const tl = lf - l0;

  const hue = (((h % 360) + 360) % 360) / 360 * hSteps;
  const hBase = Math.floor(hue);
  const h0 = hBase % hSteps;
  const h1 = (h0 + 1) % hSteps;
  const th = hue - hBase;

  const at = (li: number, hi: number) => (data[li * hSteps + hi]! / 65535) * cmax;

  const top = at(l0, h0) + (at(l0, h1) - at(l0, h0)) * th;
  const bot = at(l1, h0) + (at(l1, h1) - at(l1, h0)) * th;
  return top + (bot - top) * tl;
}
