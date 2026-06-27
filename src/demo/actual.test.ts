import { describe, it, expect } from 'vitest';
import { actualMaxChroma } from './actual';

describe('actualMaxChroma', () => {
  it('returns a positive OK-family chroma in srgb', () => {
    expect(actualMaxChroma('ok', 0.6, 30, 'srgb')).toBeGreaterThan(0);
  });
  it('returns a larger-or-equal boundary for P3 than srgb', () => {
    const s = actualMaxChroma('ok', 0.6, 30, 'srgb');
    const p = actualMaxChroma('ok', 0.6, 30, 'display-p3');
    expect(p).toBeGreaterThanOrEqual(s - 1e-9);
  });
  it('handles the cie family on the 0..100 L scale', () => {
    expect(actualMaxChroma('cie', 60, 30, 'srgb')).toBeGreaterThan(0);
  });
});
