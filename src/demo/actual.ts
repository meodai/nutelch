import { clampChroma, converter, formatHex } from 'culori';

type Gamut = 'srgb' | 'display-p3';

const RGB_GAMUT: Record<Gamut, string> = { srgb: 'rgb', 'display-p3': 'p3' };
const CFG = {
  ok: { mode: 'oklch' as const, ceiling: 0.5 },
  cie: { mode: 'lch' as const, ceiling: 160 },
};

const toOklch = converter('oklch');
const toLch = converter('lch');

// Ground-truth boundary chroma computed live with culori (demo only).
export function actualMaxChroma(family: 'ok' | 'cie', l: number, h: number, gamut: Gamut): number {
  const { mode, ceiling } = CFG[family];
  const clamped = clampChroma({ mode, l, c: ceiling, h } as never, mode, RGB_GAMUT[gamut]);
  return (clamped as { c?: number }).c ?? 0;
}

// OkHSL (Ottosson) is an sRGB + OKLab model whose saturation is normalized to
// the per-lightness gamut boundary — the same idea as nutelch's relC. Its s=1
// edge traces OkHSL's analytic sRGB boundary in the OKLCH L×C plane, so it
// should nearly coincide with nutelch's LUT boundary.
export function okhslBoundary(h: number, steps = 72): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const l = i / steps;
    const c = toOklch({ mode: 'okhsl', h, s: 1, l } as never) as { l?: number; c?: number };
    pts.push([c.l ?? 0, c.c ?? 0]);
  }
  return pts;
}

// The sRGB color OkHSL produces for the given knobs, for the comparison swatch.
export function okhslHex(h: number, s: number, l: number): string {
  return formatHex({ mode: 'okhsl', h, s, l } as never) ?? '#000';
}

// OkHSL's color expressed in the active family's coordinates, so its value reads
// on the same scale as nutelch's. `t` is normalized L (0..1).
export function okhslCoords(
  family: 'ok' | 'cie',
  h: number,
  s: number,
  l: number,
): { t: number; c: number; h: number } {
  if (family === 'ok') {
    const o = toOklch({ mode: 'okhsl', h, s, l } as never) as { l?: number; c?: number; h?: number };
    return { t: o.l ?? 0, c: o.c ?? 0, h: o.h ?? h };
  }
  const o = toLch({ mode: 'okhsl', h, s, l } as never) as { l?: number; c?: number; h?: number };
  return { t: (o.l ?? 0) / 100, c: o.c ?? 0, h: o.h ?? h };
}
