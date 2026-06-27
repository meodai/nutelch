import { describe, it, expect } from 'vitest';
import { okSrgb } from './ok.srgb';
import { cieSrgb } from './cie.srgb';

describe('generated LUTs', () => {
  it('okSrgb has the right shape and zeroed L extremes', () => {
    expect(okSrgb.data.length).toBe(65 * 256);
    expect(okSrgb.cmax).toBeGreaterThan(0);
    // first row (L=0) and last row (L=1) are all zero
    for (let hi = 0; hi < 256; hi++) {
      expect(okSrgb.data[hi]).toBe(0);
      expect(okSrgb.data[64 * 256 + hi]).toBe(0);
    }
    // a mid-lightness cell is non-zero
    expect(okSrgb.data[32 * 256 + 0]).toBeGreaterThan(0);
  });

  it('cieSrgb decodes to a plausible chroma scale', () => {
    expect(cieSrgb.data.length).toBe(65 * 256);
    expect(cieSrgb.cmax).toBeGreaterThan(50); // CIE LCH chroma is in the tens-to-100s
  });
});
