import { describe, it, expect } from 'vitest';
import { maxChroma } from './interp';
import type { Lut } from './luts/decode';

// 3 lightness x 4 hue synthetic LUT, cmax = 1, so decoded value = raw/65535.
// rows: L=0 all zero, L=mid known, L=max all zero.
function makeLut(): Lut {
  const lSteps = 3;
  const hSteps = 4;
  const data = new Uint16Array(lSteps * hSteps);
  // mid row (li=1): hues [0,1,2,3] -> [0, 16384, 32768, 65535]
  data[1 * hSteps + 0] = 0;
  data[1 * hSteps + 1] = 16384;
  data[1 * hSteps + 2] = 32768;
  data[1 * hSteps + 3] = 65535;
  return { data, cmax: 1, lSteps, hSteps };
}

describe('maxChroma', () => {
  const lut = makeLut();
  const lMax = 1;

  it('returns 0 at the lightness extremes', () => {
    expect(maxChroma(lut, 0, lMax, 90)).toBeCloseTo(0, 6);
    expect(maxChroma(lut, 1, lMax, 90)).toBeCloseTo(0, 6);
  });

  it('reads grid nodes exactly on the mid row', () => {
    // hSteps=4 -> hue step = 90deg. hue 90 -> hi=1 -> 16384/65535
    expect(maxChroma(lut, 0.5, lMax, 90)).toBeCloseTo(16384 / 65535, 5);
    expect(maxChroma(lut, 0.5, lMax, 180)).toBeCloseTo(32768 / 65535, 5);
  });

  it('interpolates between lightness rows', () => {
    // L=0.25 is halfway between row0 (all 0) and row1; hue 270 -> node 65535/65535=1
    expect(maxChroma(lut, 0.25, lMax, 270)).toBeCloseTo(0.5, 5);
  });

  it('wraps hue across the 360/0 seam', () => {
    // hue 315 sits halfway between hi=3 (val 1.0) and hi=0 (val 0.0, wrapped)
    expect(maxChroma(lut, 0.5, lMax, 315)).toBeCloseTo(0.5, 5);
    // hue 360 == hue 0
    expect(maxChroma(lut, 0.5, lMax, 360)).toBeCloseTo(maxChroma(lut, 0.5, lMax, 0), 6);
  });

  it('clamps lightness outside the range', () => {
    expect(maxChroma(lut, -5, lMax, 90)).toBeCloseTo(0, 6);
    expect(maxChroma(lut, 99, lMax, 90)).toBeCloseTo(0, 6);
  });
});
