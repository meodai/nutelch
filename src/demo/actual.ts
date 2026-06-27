import { clampChroma, converter, formatHex } from 'culori';
import type { Gamut } from '../index';

const RGB_GAMUT: Record<Gamut, string> = { srgb: 'rgb', 'display-p3': 'p3' };
const CFG = {
  ok: { mode: 'oklch' as const, ceiling: 0.5 },
  cie: { mode: 'lch' as const, ceiling: 160 },
};

const toOklch = converter('oklch');

// Ground-truth boundary chroma computed live with culori (demo only).
export function actualMaxChroma(family: 'ok' | 'cie', l: number, h: number, gamut: Gamut): number {
  const { mode, ceiling } = CFG[family];
  const clamped = clampChroma({ mode, l, c: ceiling, h } as never, mode, RGB_GAMUT[gamut]);
  return (clamped as { c?: number }).c ?? 0;
}

// OkHSV (Ottosson) is an sRGB + OKLab model. Sweeping its s=1 edge traces
// OkHSV's *analytic* approximation of the sRGB gamut boundary in the OKLCH
// L×C plane — useful to overlay against nutColor's LUT and the true gamut.
export function okhsvBoundary(h: number, steps = 72): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const v = i / steps;
    const c = toOklch({ mode: 'okhsv', h, s: 1, v } as never) as { l?: number; c?: number };
    pts.push([c.l ?? 0, c.c ?? 0]);
  }
  return pts;
}

// The sRGB color OkHSV produces for the given knobs, for the comparison swatch.
export function okhsvHex(h: number, s: number, v: number): string {
  return formatHex({ mode: 'okhsv', h, s, v } as never) ?? '#000';
}
