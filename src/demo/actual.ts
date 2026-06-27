import { clampChroma } from 'culori';
import type { Gamut } from '../index';

const RGB_GAMUT: Record<Gamut, string> = { srgb: 'rgb', 'display-p3': 'p3' };
const CFG = {
  ok: { mode: 'oklch' as const, ceiling: 0.5 },
  cie: { mode: 'lch' as const, ceiling: 160 },
};

// Ground-truth boundary chroma computed live with culori (demo only).
export function actualMaxChroma(family: 'ok' | 'cie', l: number, h: number, gamut: Gamut): number {
  const { mode, ceiling } = CFG[family];
  const clamped = clampChroma({ mode, l, c: ceiling, h } as never, mode, RGB_GAMUT[gamut]);
  return (clamped as { c?: number }).c ?? 0;
}
