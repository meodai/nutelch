import { describe, it, expect } from 'vitest';
import { resolve } from './registry';

describe('resolve', () => {
  it('maps oklch to the ok family, L range 0..1', () => {
    const r = resolve('oklch', 'srgb');
    expect(r.family).toBe('ok');
    expect(r.lMax).toBe(1);
    expect(r.lut.data.length).toBe(65 * 256);
  });
  it('maps lch to the cie family, L range 0..100', () => {
    const r = resolve('lch', 'display-p3');
    expect(r.family).toBe('cie');
    expect(r.lMax).toBe(100);
  });
  it('resolves srgb and display-p3 to different LUTs within a family', () => {
    expect(resolve('oklch', 'srgb').lut).not.toBe(resolve('oklch', 'display-p3').lut);
  });
});
