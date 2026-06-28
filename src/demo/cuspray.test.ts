import { describe, it, expect } from 'vitest';
import { findCusp, sFromPoint, rayAnchorT, pointAtS, invertEase } from './cuspray';

// A tent envelope peaking at t=0.6, c=0.3 — convex enough for clean ray math.
const tent = (t: number) => (t <= 0.6 ? (t / 0.6) * 0.3 : ((1 - t) / 0.4) * 0.3);

describe('findCusp', () => {
  it('locates the peak of an envelope', () => {
    const cusp = findCusp(tent);
    expect(cusp.t).toBeCloseTo(0.6, 2);
    expect(cusp.c).toBeCloseTo(0.3, 3);
  });
});

describe('sFromPoint', () => {
  it('is chroma as a fraction of peak chroma', () => {
    expect(sFromPoint(0.15, { t: 0.6, c: 0.3 })).toBeCloseTo(0.5, 6);
  });
  it('clamps to [0,1] and handles a zero-chroma cusp', () => {
    expect(sFromPoint(0.6, { t: 0.6, c: 0.3 })).toBe(1);
    expect(sFromPoint(0.1, { t: 0.5, c: 0 })).toBe(0);
  });
});

describe('rayAnchorT / pointAtS round-trip', () => {
  const cusp = { t: 0.6, c: 0.3 };

  it('s=0 lands on the achromatic axis (c=0)', () => {
    const p = pointAtS(0, rayAnchorT(0.4, 0.1, cusp), cusp);
    expect(p.c).toBeCloseTo(0, 9);
  });

  it('s=1 lands exactly on the cusp', () => {
    const p = pointAtS(1, rayAnchorT(0.4, 0.1, cusp), cusp);
    expect(p.t).toBeCloseTo(cusp.t, 9);
    expect(p.c).toBeCloseTo(cusp.c, 9);
  });

  it('a point recovers its own s and stays on its ray', () => {
    const t0 = 0.4;
    const c0 = 0.12;
    const s0 = sFromPoint(c0, cusp); // 0.4
    const anchor = rayAnchorT(t0, c0, cusp);
    const back = pointAtS(s0, anchor, cusp);
    expect(back.t).toBeCloseTo(t0, 9);
    expect(back.c).toBeCloseTo(c0, 9);
  });

  it('falls back to the black anchor when the point is at the cusp', () => {
    expect(rayAnchorT(0.6, 0.3, cusp)).toBe(0);
  });
});

describe('invertEase', () => {
  const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const easeIn = (x: number) => x * x;

  it('inverts smoothstep (round-trip ~ identity)', () => {
    for (const x of [0, 0.2, 0.5, 0.75, 1]) {
      expect(invertEase(smoothstep, smoothstep(x))).toBeCloseTo(x, 4);
    }
  });

  it('inverts ease-in', () => {
    expect(invertEase(easeIn, 0.25)).toBeCloseTo(0.5, 4);
  });

  it('clamps out-of-range targets', () => {
    expect(invertEase(easeIn, -1)).toBeCloseTo(0, 4);
    expect(invertEase(easeIn, 2)).toBeCloseTo(1, 4);
  });
});
