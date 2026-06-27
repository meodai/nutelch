import { describe, it, expect } from 'vitest';
import { resolve } from './registry';

describe('resolve', () => {
  it('maps OK modes to the ok family, L range 0..1', () => {
    const r = resolve('oklch', 'srgb');
    expect(r.family).toBe('ok');
    expect(r.lMax).toBe(1);
    expect(r.cylindrical).toBe(true);
    expect(r.lut.data.length).toBe(65 * 256);
  });
  it('marks oklab as non-cylindrical but same family/LUT', () => {
    const cyl = resolve('oklch', 'srgb');
    const rect = resolve('oklab', 'srgb');
    expect(rect.cylindrical).toBe(false);
    expect(rect.lut).toBe(cyl.lut); // same family+gamut shares one LUT
  });
  it('maps CIE modes to the cie family, L range 0..100', () => {
    const r = resolve('lch', 'display-p3');
    expect(r.family).toBe('cie');
    expect(r.lMax).toBe(100);
    expect(r.cylindrical).toBe(true);
  });
});
