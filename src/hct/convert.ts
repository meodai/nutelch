// HCT → RGB / OKLCH, dependency-free.
//
// HCT (Hue, Chroma, Tone) is Google Material's color space: hue and chroma are
// CAM16's h and C under one fixed set of viewing conditions, and tone is CIE L*
// (a function of luminance Y alone, which is what makes tone differences map to
// WCAG contrast). Going HCT → RGB therefore means: tone → Y, then find the CAM16
// lightness J whose (J, C, h) inverse lands on that Y.
//
// Sources:
//  • CAM16 equations: C. Li, Z. Li, Z. Wang, Y. Xu, M. R. Luo, G. Cui, M. Melgosa,
//    M. H. Brill, M. Pointer, "Comprehensive color solutions: CAM16, CAT16, and
//    CAM16-UCS", Color Research & Application 42(6):703–718, 2017.
//    https://doi.org/10.1002/col.22131
//  • HCT definition, default viewing conditions, the CAM16 inverse as written
//    here, and the Newton step on J: Google's material-color-utilities
//    (Apache-2.0), typescript/hct/{viewing_conditions,cam16,hct_solver}.ts and
//    typescript/utils/color_utils.ts —
//    https://github.com/material-foundation/material-color-utilities
//    Cross-checked against @material/material-color-utilities 0.4.0 in convert.test.ts.
//  • XYZ → linear Display P3 and XYZ → OKLab matrices: CSS Color Module Level 4,
//    §18 "Sample code for color conversions" — https://www.w3.org/TR/css-color-4/
//    (OKLab itself: B. Ottosson, https://bottosson.github.io/posts/oklab/)

import type { Gamut } from '../luts/decode';

// ── CIE L* ↔ Y (Y on 0..100) ──────────────────────────────────────────────────
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

export function yFromLstar(lstar: number): number {
  const ft = (lstar + 16) / 116;
  const ft3 = ft * ft * ft;
  return 100 * (ft3 > EPS ? ft3 : (116 * ft - 16) / KAPPA);
}

export function lstarFromY(y: number): number {
  const t = y / 100;
  const f = t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
  return 116 * f - 16;
}

// ── Viewing conditions (Material's ViewingConditions.DEFAULT) ──────────────────
// D65 white, adapting luminance (200/π)·Y(L*=50)/100 ≈ 11.7 cd/m², background
// L* 50, average surround (2), illuminant not discounted.
const WHITE = [95.047, 100.0, 108.883] as const;

// CAT16 matrix (XYZ → sharpened cone responses) and its inverse.
function m16(x: number, y: number, z: number): [number, number, number] {
  return [
    0.401288 * x + 0.650173 * y - 0.051461 * z,
    -0.250268 * x + 1.204414 * y + 0.045854 * z,
    -0.002079 * x + 0.048952 * y + 0.953127 * z,
  ];
}
function m16Inv(r: number, g: number, b: number): [number, number, number] {
  return [
    1.86206786 * r - 1.01125463 * g + 0.14918677 * b,
    0.38752654 * r + 0.62144744 * g - 0.00897398 * b,
    -0.0158415 * r - 0.03412294 * g + 1.04996444 * b,
  ];
}

const VC = (() => {
  const la = ((200 / Math.PI) * yFromLstar(50)) / 100;
  const rgbW = m16(WHITE[0], WHITE[1], WHITE[2]);
  const f = 0.8 + 2 / 10; // surround 2 → f = 1.0
  const c = 0.69; // lerp(0.59, 0.69, (f - 0.9) * 10) at f = 1.0
  const d = Math.min(1, Math.max(0, f * (1 - (1 / 3.6) * Math.exp((-la - 42) / 92))));
  const rgbD = rgbW.map((w) => d * (100 / w) + 1 - d) as [number, number, number];
  const k = 1 / (5 * la + 1);
  const k4 = k * k * k * k;
  const fl = k4 * la + 0.1 * (1 - k4) * (1 - k4) * Math.cbrt(5 * la);
  const n = yFromLstar(50) / WHITE[1];
  const z = 1.48 + Math.sqrt(n);
  const nbb = 0.725 / Math.pow(n, 0.2);
  const rgbA = rgbW.map((w, i) => {
    const af = Math.pow((fl * rgbD[i]! * w) / 100, 0.42);
    return (400 * af) / (af + 27.13);
  });
  const aw = (2 * rgbA[0]! + rgbA[1]! + 0.05 * rgbA[2]!) * nbb;
  return { n, aw, nbb, ncb: nbb, c, nc: f, rgbD, fl, z };
})();

// ── CAM16 forward: XYZ (0..100) → { J, C, h } ─────────────────────────────────
export function xyzToCam16(x: number, y: number, z: number): { j: number; c: number; h: number } {
  const [rC, gC, bC] = m16(x, y, z);
  const adapt = (v: number, d: number) => {
    const af = Math.pow((VC.fl * Math.abs(d * v)) / 100, 0.42);
    return (Math.sign(d * v) * 400 * af) / (af + 27.13);
  };
  const rA = adapt(rC, VC.rgbD[0]);
  const gA = adapt(gC, VC.rgbD[1]);
  const bA = adapt(bC, VC.rgbD[2]);
  const a = (11 * rA - 12 * gA + bA) / 11;
  const b = (rA + gA - 2 * bA) / 9;
  const u = (20 * rA + 20 * gA + 21 * bA) / 20;
  const p2 = (40 * rA + 20 * gA + bA) / 20;
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  const h = deg < 0 ? deg + 360 : deg >= 360 ? deg - 360 : deg;
  const j = 100 * Math.pow((p2 * VC.nbb) / VC.aw, VC.c * VC.z);
  const hp = h < 20.14 ? h + 360 : h;
  const eHue = 0.25 * (Math.cos((hp * Math.PI) / 180 + 2) + 3.8);
  const p1 = (50000 / 13) * eHue * VC.nc * VC.ncb;
  const t = (p1 * Math.hypot(a, b)) / (u + 0.305);
  const alpha = Math.pow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, VC.n), 0.73);
  return { j, c: alpha * Math.sqrt(j / 100), h };
}

// ── CAM16 inverse: { J, C, h } → XYZ (0..100) ─────────────────────────────────
export function cam16ToXyz(j: number, c: number, h: number): [number, number, number] {
  const alpha = c === 0 || j === 0 ? 0 : c / Math.sqrt(j / 100);
  const t = Math.pow(alpha / Math.pow(1.64 - Math.pow(0.29, VC.n), 0.73), 1 / 0.9);
  const hRad = (h * Math.PI) / 180;
  const eHue = 0.25 * (Math.cos(hRad + 2) + 3.8);
  const ac = VC.aw * Math.pow(j / 100, 1 / VC.c / VC.z);
  const p1 = eHue * (50000 / 13) * VC.nc * VC.ncb;
  const p2 = ac / VC.nbb;
  const hSin = Math.sin(hRad);
  const hCos = Math.cos(hRad);
  const gamma = (23 * (p2 + 0.305) * t) / (23 * p1 + 11 * t * hCos + 108 * t * hSin);
  const a = gamma * hCos;
  const b = gamma * hSin;
  const rA = (460 * p2 + 451 * a + 288 * b) / 1403;
  const gA = (460 * p2 - 891 * a - 261 * b) / 1403;
  const bA = (460 * p2 - 220 * a - 6300 * b) / 1403;
  const unadapt = (v: number, d: number) => {
    const base = Math.max(0, (27.13 * Math.abs(v)) / (400 - Math.abs(v)));
    return (Math.sign(v) * (100 / VC.fl) * Math.pow(base, 1 / 0.42)) / d;
  };
  return m16Inv(unadapt(rA, VC.rgbD[0]), unadapt(gA, VC.rgbD[1]), unadapt(bA, VC.rgbD[2]));
}

// ── HCT → XYZ ─────────────────────────────────────────────────────────────────
// Tone fixes Y; J is found so the CAM16 inverse of (J, C, h) has that Y. Y grows
// with J, close to a power law, so log Y is nearly linear in log J. We start from
// Material's guess J = 11·√Y and its first step J -= (Y(J) − Y)·J / (2·Y(J))
// (which assumes Y ∝ J²), then switch to secant steps in log–log space. Those
// converge superlinearly (Material's fixed-exponent step alone is only linear). Bisection on J
// is the fallback for the rare case the iteration wanders (very high chroma at
// low tone, where the inverse leaves the physical range). The result is NOT
// clipped to any gamut: out-of-gamut HCT colors come back as out-of-range XYZ/RGB.
// When no CAM16 color has this (h, c) at this tone, the result is [NaN, NaN, NaN].
export function hctToXyz(h: number, c: number, t: number): [number, number, number] {
  const y = yFromLstar(t);
  if (t <= 0) return [0, 0, 0];
  if (c <= 0 || t >= 100) return [(WHITE[0] * y) / 100, y, (WHITE[2] * y) / 100];
  const hue = ((h % 360) + 360) % 360;
  const lnY = Math.log(y);
  const tol = 1e-12;
  let x0 = Math.log(Math.sqrt(y) * 11);
  let xyz = cam16ToXyz(Math.exp(x0), c, hue);
  let f0 = Math.log(xyz[1]) - lnY;
  if (Number.isFinite(f0)) {
    if (Math.abs(f0) <= tol) return xyz;
    let x1 = x0 - f0 / 2; // Material's step, in log form
    for (let i = 0; i < 16; i++) {
      xyz = cam16ToXyz(Math.exp(x1), c, hue);
      const f1 = Math.log(xyz[1]) - lnY;
      if (!Number.isFinite(f1)) break;
      if (Math.abs(f1) <= tol) return xyz;
      const next = x1 - (f1 * (x1 - x0)) / (f1 - f0);
      if (!Number.isFinite(next)) break;
      x0 = x1;
      f0 = f1;
      x1 = next;
    }
  }
  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (cam16ToXyz(mid, c, hue)[1] < y) lo = mid;
    else hi = mid;
  }
  xyz = cam16ToXyz((lo + hi) / 2, c, hue);
  // No J reaches this Y: at this hue, that much chroma cannot exist at this tone
  // (e.g. high chroma near black around h≈177, where the inverse collapses to
  // black). Signal it rather than return a color with the wrong tone.
  return Math.abs(xyz[1] - y) <= 1e-6 * y ? xyz : [NaN, NaN, NaN];
}

// XYZ → HCT (the forward direction, closed form).
export function xyzToHct(x: number, y: number, z: number): { h: number; c: number; t: number } {
  const cam = xyzToCam16(x, y, z);
  return { h: cam.h, c: cam.c, t: lstarFromY(y) };
}

// ── XYZ (0..100) ↔ linear RGB ─────────────────────────────────────────────────
// sRGB uses Material's matrix so round trips agree with material-color-utilities;
// Display P3 uses the CSS Color 4 matrix.
export function xyzToLinearRgb(x: number, y: number, z: number, gamut: Gamut): [number, number, number] {
  x /= 100;
  y /= 100;
  z /= 100;
  return gamut === 'srgb'
    ? [
        3.2413774792388685 * x - 1.5376652402851851 * y - 0.49885366846268053 * z,
        -0.9691452513005321 * x + 1.8758853451067872 * y + 0.04156585616912061 * z,
        0.05562093689691305 * x - 0.20395524564742123 * y + 1.0571799111220335 * z,
      ]
    : [
        2.493496911941425 * x - 0.9313836179191239 * y - 0.40271078445071684 * z,
        -0.8294889695615747 * x + 1.7626640603183463 * y + 0.023624685841943577 * z,
        0.03584583024378447 * x - 0.07617238926804182 * y + 0.9568845240076872 * z,
      ];
}

export function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  // sRGB only (Material's matrix) — used for round-trip tests.
  return [
    100 * (0.41233895 * r + 0.35762064 * g + 0.18051042 * b),
    100 * (0.2126 * r + 0.7152 * g + 0.0722 * b),
    100 * (0.01932141 * r + 0.11916382 * g + 0.95034478 * b),
  ];
}

// sRGB / Display P3 share the sRGB transfer curve; extended to negatives by sign.
function encode(v: number): number {
  const a = Math.abs(v);
  const e = a <= 0.0031308 ? 12.92 * a : 1.055 * Math.pow(a, 1 / 2.4) - 0.055;
  return Math.sign(v) * e;
}
export function decode(v: number): number {
  const a = Math.abs(v);
  const d = a <= 0.04045 ? a / 12.92 : Math.pow((a + 0.055) / 1.055, 2.4);
  return Math.sign(v) * d;
}

// An HCT color: hue, chroma, and tone given as `t` or `l` (nutelch's Colors use
// `l`; Material calls it tone). Give exactly one.
export type HctInput = { h: number; c: number } & ({ t: number; l?: never } | { l: number; t?: never });
const tone = (color: HctInput): number => (color.t ?? color.l)!;

// HCT → gamma-encoded RGB (0..1) in `gamut`. Not clipped: a channel outside
// [0, 1] means the color is outside that gamut; NaN channels mean the (h, c, t)
// combination does not exist at all (see hctToXyz).
export function hctToRgb(color: HctInput, gamut: Gamut = 'srgb'): { r: number; g: number; b: number } {
  const [r, g, b] = xyzToLinearRgb(...hctToXyz(color.h, color.c, tone(color)), gamut);
  return { r: encode(r), g: encode(g), b: encode(b) };
}

// HCT → OKLCH (L 0..1). Gamut-free, so toCss can emit any HCT color exactly.
export function hctToOklch(color: HctInput): { l: number; c: number; h: number } {
  const [x, y, z] = hctToXyz(color.h, color.c, tone(color)).map((v) => v / 100) as [number, number, number];
  const lm = Math.cbrt(0.819022437996703 * x + 0.3619062600528904 * y - 0.1288737815209879 * z);
  const mm = Math.cbrt(0.0329836539323885 * x + 0.9292868615863434 * y + 0.0361446663506424 * z);
  const sm = Math.cbrt(0.0481771893596242 * x + 0.2642395317527308 * y + 0.6335478284694309 * z);
  const L = 0.210454268309314 * lm + 0.7936177747023054 * mm - 0.0040720430116193 * sm;
  const A = 1.9779985324311684 * lm - 2.4285922420485799 * mm + 0.450593709617411 * sm;
  const B = 0.0259040424655478 * lm + 0.7827717124575296 * mm - 0.8086757660463506 * sm;
  const deg = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: deg < 0 ? deg + 360 : deg };
}
