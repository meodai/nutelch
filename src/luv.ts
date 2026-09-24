// LCHuv → CIE LCH, so toCss can emit an lchuv color as a native lch().
//
// LCHuv is the polar form of CIELUV (CIE 1976 L*u*v*). CSS has no luv()/lchuv()
// syntax, but CSS lch() is CIELAB relative to D50 — and nutelch's LCHuv is D50 as
// well (the white culori uses, which generates the LUTs). Both share the same L*,
// so the conversion is exact and closed-form: LCHuv → Luv → XYZ (D50) → Lab → LCH,
// with no chromatic adaptation.
//
// Sources:
//  • CIELUV and CIELAB definitions: CIE 15:2004 "Colorimetry", §8.1–8.2;
//    summarized at https://en.wikipedia.org/wiki/CIELUV
//  • D50 white and the CIE ε/κ constants as used by CSS Color Module Level 4
//    (https://www.w3.org/TR/css-color-4/#color-conversion-code) and by culori
//    4.0.2 (MIT), src/constants.js and src/luv/convertLuvToXyz50.js, so results
//    match the culori ground truth the LUTs are built from.

const D50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585] as const;
const KAPPA = 24389 / 27; // (29/3)^3
const EPS = 216 / 24389; // (6/29)^3

const denom = D50[0] + 15 * D50[1] + 3 * D50[2];
const UN = (4 * D50[0]) / denom;
const VN = (9 * D50[1]) / denom;

// { l, c, h } in LCHuv (D50) → { l, c, h } in CIE LCH (D50). l is unchanged (L*).
export function lchuvToLch({ l, c, h }: { l: number; c: number; h: number }): { l: number; c: number; h: number } {
  if (l <= 0) return { l: 0, c: 0, h };
  const hr = (h * Math.PI) / 180;
  const up = (c * Math.cos(hr)) / (13 * l) + UN;
  const vp = (c * Math.sin(hr)) / (13 * l) + VN;
  const y = l <= 8 ? l / KAPPA : ((l + 16) / 116) ** 3;
  const x = (y * 9 * up) / (4 * vp);
  const z = (y * (12 - 3 * up - 20 * vp)) / (4 * vp);
  const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const fx = f(x / D50[0]);
  const fy = f(y / D50[1]);
  const fz = f(z / D50[2]);
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c: Math.hypot(a, b), h: deg < 0 ? deg + 360 : deg };
}
