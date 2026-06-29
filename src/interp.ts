import type { Lut } from './luts/decode';

// Largest index `i` with `bp[i] <= x`, clamped to [0, bp.length - 2] so `i+1` is
// always a valid upper node. `bp` is ascending.
function lowerIndex(bp: Float64Array, x: number): number {
  let lo = 0;
  let hi = bp.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (bp[mid]! <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Bilinear lookup of the boundary chroma at (l, h). l is clamped to [0, lut.lMax];
// h wraps modulo 360 across the hue seam. When the LUT carries breakpoints
// (lbp/hbp) the grid is non-uniform and the enclosing cell is found by binary
// search; otherwise the grid is uniform and the index is computed directly.
export function maxChroma(lut: Lut, l: number, h: number): number {
  const { data, cmax, lSteps, hSteps, lMax, lbp, hbp } = lut;
  const at = (li: number, hi: number) => (data[li * hSteps + hi]! / 65535) * cmax;

  // ── L axis: locate row pair (l0, l1) and blend tl ─────────────────────────────
  let l0: number;
  let l1: number;
  let tl: number;
  const lc = Math.min(Math.max(l, 0), lMax);
  if (lbp) {
    l0 = lowerIndex(lbp, lc);
    l1 = l0 + 1;
    tl = (lc - lbp[l0]!) / (lbp[l1]! - lbp[l0]! || 1);
  } else {
    const lf = (lc / lMax) * (lSteps - 1);
    l0 = Math.floor(lf);
    l1 = Math.min(l0 + 1, lSteps - 1);
    tl = lf - l0;
  }

  // ── H axis: locate column pair (h0, h1) and blend th, wrapping the seam ────────
  let h0: number;
  let h1: number;
  let th: number;
  const hue = (((h % 360) + 360) % 360);
  if (hbp) {
    const last = hSteps - 1;
    if (hue < hbp[0]! || hue >= hbp[last]!) {
      // wrap cell: between the last node and the first (at hbp[0] + 360)
      h0 = last;
      h1 = 0;
      const span = hbp[0]! + 360 - hbp[last]!;
      const pos = hue < hbp[0]! ? hue + 360 : hue;
      th = (pos - hbp[last]!) / (span || 1);
    } else {
      h0 = lowerIndex(hbp, hue);
      h1 = h0 + 1;
      th = (hue - hbp[h0]!) / (hbp[h1]! - hbp[h0]! || 1);
    }
  } else {
    const hf = (hue / 360) * hSteps;
    const hBase = Math.floor(hf);
    h0 = hBase % hSteps;
    h1 = (h0 + 1) % hSteps;
    th = hf - hBase;
  }

  const top = at(l0, h0) + (at(l0, h1) - at(l0, h0)) * th;
  const bot = at(l1, h0) + (at(l1, h1) - at(l1, h0)) * th;
  return top + (bot - top) * tl;
}
