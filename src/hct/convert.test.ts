import { describe, it, expect } from 'vitest';
// Material 0.4.0 ships extensionless ESM imports Node rejects; vite.config.ts
// inlines the package so Vite resolves them.
import { Hct } from '@material/material-color-utilities';
import { converter } from 'culori';
import { hctToRgb, rgbToHct, hctToOklch, xyzToHct, linearRgbToXyz, decode, yFromLstar, lstarFromY } from './convert';

// Deterministic spread of sRGB colors (LCG) — covers the cube, incl. edges.
function* samples(n: number) {
  let s = 12345;
  const next = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (const edge of [0x000000, 0xffffff, 0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0x00ffff, 0xff00ff, 0x808080]) {
    yield edge;
  }
  for (let i = 0; i < n; i++) yield (Math.floor(next() * 256) << 16) | (Math.floor(next() * 256) << 8) | Math.floor(next() * 256);
}
const channels = (rgb: number) => [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255].map((v) => v / 255) as [number, number, number];

describe('L* ↔ Y', () => {
  it('round-trips and hits the anchors', () => {
    expect(yFromLstar(0)).toBe(0);
    expect(yFromLstar(100)).toBeCloseTo(100, 9);
    for (const l of [1, 5, 8, 20, 50, 77, 99]) expect(lstarFromY(yFromLstar(l))).toBeCloseTo(l, 9);
  });
});

describe('HCT vs @material/material-color-utilities', () => {
  it('forward (RGB → HCT) matches Material', () => {
    for (const rgb of samples(400)) {
      const ref = Hct.fromInt(0xff000000 | rgb);
      const [r, g, b] = channels(rgb).map(decode) as [number, number, number];
      const ours = xyzToHct(...linearRgbToXyz(r, g, b));
      expect(ours.t).toBeCloseTo(ref.tone, 6);
      expect(ours.c).toBeCloseTo(ref.chroma, 6);
      if (ref.chroma > 1) {
        const dh = Math.abs(((ours.h - ref.hue + 540) % 360) - 180);
        expect(dh).toBeLessThan(1e-6);
      }
    }
  });

  it('inverse (HCT → RGB) reproduces the source color', () => {
    for (const rgb of samples(400)) {
      const ref = Hct.fromInt(0xff000000 | rgb);
      const out = hctToRgb({ h: ref.hue, c: ref.chroma, l: ref.tone });
      const want = channels(rgb);
      expect(out.r).toBeCloseTo(want[0], 6);
      expect(out.g).toBeCloseTo(want[1], 6);
      expect(out.b).toBeCloseTo(want[2], 6);
    }
  });

  it('agrees with Material’s solver for in-gamut (h, c, t) requests', () => {
    for (const [h, c, t] of [[30, 40, 50], [140, 30, 80], [270, 50, 35], [200, 20, 60], [320, 60, 55]] as const) {
      const ref = Hct.from(h, c, t);
      expect(ref.chroma).toBeCloseTo(c, 0); // sanity: request was in gamut
      const [r, g, b] = channels(ref.toInt() & 0xffffff);
      const out = hctToRgb({ h, c, l: t });
      // Material quantizes to 8-bit ARGB, hence the 1/255 tolerance.
      expect(Math.abs(out.r - r)).toBeLessThan(1 / 255 + 1e-6);
      expect(Math.abs(out.g - g)).toBeLessThan(1 / 255 + 1e-6);
      expect(Math.abs(out.b - b)).toBeLessThan(1 / 255 + 1e-6);
    }
  });

  it('returns unclipped channels for out-of-gamut chroma', () => {
    const out = hctToRgb({ h: 140, c: 150, l: 50 });
    expect(Math.min(out.r, out.g, out.b) < 0 || Math.max(out.r, out.g, out.b) > 1).toBe(true);
  });
});

describe('hctToOklch', () => {
  it('matches culori’s OKLCH of the same sRGB color', () => {
    const toOklch = converter('oklch');
    for (const rgb of samples(100)) {
      const ref = Hct.fromInt(0xff000000 | rgb);
      const ours = hctToOklch({ h: ref.hue, c: ref.chroma, l: ref.tone });
      const [r, g, b] = channels(rgb);
      const want = toOklch({ mode: 'rgb', r, g, b }) as { l: number; c: number; h?: number };
      // Material's sRGB matrix differs from culori's in the 4th decimal → ~1e-4 drift.
      expect(ours.l).toBeCloseTo(want.l, 3);
      expect(ours.c).toBeCloseTo(want.c, 3);
      if (want.c > 0.02) expect(Math.abs(((ours.h - want.h! + 540) % 360) - 180)).toBeLessThan(0.05);
    }
  });
});

describe('rgbToHct', () => {
  it('matches Material’s Hct.fromInt for sRGB colors', () => {
    for (const rgb of samples(300)) {
      const ref = Hct.fromInt(0xff000000 | rgb);
      const [r, g, b] = channels(rgb);
      const ours = rgbToHct({ r, g, b });
      expect(ours.mode).toBe('hct');
      expect(ours.l).toBeCloseTo(ref.tone, 6);
      expect(ours.c).toBeCloseTo(ref.chroma, 6);
      if (ref.chroma > 1) expect(Math.abs(((ours.h - ref.hue + 540) % 360) - 180)).toBeLessThan(1e-6);
    }
  });

  it('is the inverse of hctToRgb in sRGB and Display P3', () => {
    for (const gamut of ['srgb', 'display-p3'] as const) {
      for (const rgb of samples(200)) {
        const [r, g, b] = channels(rgb);
        const back = hctToRgb(rgbToHct({ r, g, b }, gamut), gamut);
        expect(back.r).toBeCloseTo(r, 6);
        expect(back.g).toBeCloseTo(g, 6);
        expect(back.b).toBeCloseTo(b, 6);
      }
    }
  });

  it('P3 red has more chroma than sRGB red (the wider gamut)', () => {
    const red = { r: 1, g: 0, b: 0 };
    expect(rgbToHct(red, 'display-p3').c).toBeGreaterThan(rgbToHct(red, 'srgb').c);
  });
});
