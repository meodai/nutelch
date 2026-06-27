import { describe, it, expect } from 'vitest';
import { decodeLut } from './decode';

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');

describe('decodeLut', () => {
  it('reads little-endian uint16 (host-independent)', () => {
    // 258 = 0x0102 -> little-endian bytes [0x02, 0x01]
    const lut = decodeLut('oklch', b64([0x02, 0x01]), 1, 1, 1);
    expect(lut.data[0]).toBe(258);
    expect(lut.mode).toBe('oklch');
    expect(lut.lMax).toBe(1);
  });

  it('derives lMax 100 for the lch family', () => {
    expect(decodeLut('lch', b64([0, 0]), 1, 1, 1).lMax).toBe(100);
  });

  it('throws on a payload whose byte length does not match lSteps×hSteps', () => {
    // 2 bytes = 1 cell, but we claim a 2×2 (4-cell, 8-byte) grid
    expect(() => decodeLut('oklch', b64([1, 2]), 1, 2, 2)).toThrow(/malformed LUT/);
  });
});
