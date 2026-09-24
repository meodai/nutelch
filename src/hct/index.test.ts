import { describe, it, expect } from 'vitest';
import { converter } from 'culori';
// Material 0.4.0 ships extensionless ESM imports Node rejects; vite.config.ts
// inlines the package so Vite resolves them.
import { Hct } from '@material/material-color-utilities';
import { cusp, relch, reach, peak, toCss, hctToRgb, hctSrgb, hctP3 } from './index';
import { oklchSrgb, toCss as coreToCss } from '../index';

describe('HCT', () => {
  it('hctSrgb is self-describing (mode hct, tone on 0..100)', () => {
    expect(hctSrgb.mode).toBe('hct');
    expect(hctSrgb.lMax).toBe(100);
    expect(hctP3.cmax).toBeGreaterThan(hctSrgb.cmax); // P3 reaches more chroma
  });

  it('cusp tracks Material’s own gamut clamp (independent ground truth)', () => {
    // Hct.from clamps an out-of-gamut request to the max chroma that fits sRGB.
    for (const [h, t] of [[30, 50], [140, 80], [270, 35], [200, 60], [320, 55], [90, 90]] as const) {
      const material = Hct.from(h, 200, t).chroma;
      const ours = cusp({ lut: hctSrgb, l: t, h }).c;
      expect(Math.abs(ours - material) / hctSrgb.cmax).toBeLessThan(0.02);
    }
  });

  it('relch at relC ≤ 1 lands inside sRGB (within LUT tolerance)', () => {
    for (const h of [0, 60, 120, 180, 240, 300]) {
      for (const t of [20, 50, 80]) {
        const { r, g, b } = hctToRgb(relch({ lut: hctSrgb, l: t, relC: 0.98, h }));
        for (const v of [r, g, b]) {
          expect(v).toBeGreaterThan(-0.01);
          expect(v).toBeLessThan(1.01);
        }
      }
    }
  });

  it('toCss emits an hct color as the equivalent oklch()', () => {
    const col = relch({ lut: hctSrgb, l: 50, relC: 0.5, h: 30 });
    const css = toCss(col);
    expect(css).toMatch(/^oklch\(/);
    // the oklch lightness should match the same color computed via culori from RGB
    const { r, g, b } = hctToRgb(col);
    const ok = converter('oklch')({ mode: 'rgb', r, g, b }) as { l: number };
    const l = Number(css.slice(6).split(' ')[0]);
    expect(l).toBeCloseTo(ok.l, 3);
  });

  it('accepts t (tone) wherever l is accepted, and returns it as l', () => {
    const byL = relch({ lut: hctSrgb, l: 40, relC: 0.8, h: 280 });
    const byT = relch({ lut: hctSrgb, t: 40, relC: 0.8, h: 280 });
    expect(byT).toEqual(byL);
    expect(byT.l).toBe(40);
    expect(cusp({ lut: hctSrgb, t: 60, h: 30 })).toEqual(cusp({ lut: hctSrgb, l: 60, h: 30 }));
    expect(reach({ lut: hctSrgb, t: 30, reach: 0.5, h: 142 })).toEqual(
      reach({ lut: hctSrgb, l: 30, reach: 0.5, h: 142 }),
    );
    expect(hctToRgb({ h: 280, c: 30, t: 40 })).toEqual(hctToRgb({ h: 280, c: 30, l: 40 }));
  });

  it('toCss formats non-hct colors exactly like the core', () => {
    const c = relch({ lut: oklchSrgb, l: 0.6, relC: 0.5, h: 30 });
    expect(toCss(c)).toBe(coreToCss(c));
  });

  it('peak works on the HCT LUTs', () => {
    const p = peak({ lut: hctSrgb, h: 30 });
    expect(p.mode).toBe('hct');
    expect(p.c).toBeGreaterThan(0);
  });

  it('rejects passing both l and t (compile-time)', () => {
    // @ts-expect-error — give exactly one of l / t
    const both = () => relch({ lut: hctSrgb, l: 40, t: 40, relC: 1, h: 0 });
    // @ts-expect-error — give exactly one of l / t
    const neither = () => cusp({ lut: hctSrgb, h: 0 });
    expect(typeof both).toBe('function');
    expect(typeof neither).toBe('function');
  });

  it('hctToRgb returns NaN for (h, c, tone) combinations that cannot exist', () => {
    const { r } = hctToRgb({ h: 177, c: 180, l: 4 });
    expect(r).toBeNaN();
  });
});
