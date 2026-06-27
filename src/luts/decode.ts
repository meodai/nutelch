export type Mode = 'oklch' | 'lch';

// A self-describing lookup table: it carries the cylindrical space it belongs to
// and that space's native lightness range, so consumers pass the LUT itself
// rather than selecting one through a registry.
export interface Lut {
  mode: Mode; // 'oklch' | 'lch' — also the mode returned by cusp/relch
  lMax: number; // native lightness max: 1 for oklch, 100 for lch
  cmax: number; // observed max chroma (the decode scale)
  lSteps: number;
  hSteps: number;
  data: Uint16Array;
}

// Decodes a base64 little-endian Uint16 buffer produced by scripts/build-luts.ts.
// Bytes are combined explicitly (low byte first) so the result is identical on
// big- and little-endian hosts. atob is available in browsers and Node >= 16.
export function decodeLut(
  mode: Mode,
  b64: string,
  cmax: number,
  lSteps: number,
  hSteps: number,
): Lut {
  const bin = atob(b64);
  const cells = lSteps * hSteps;
  if (bin.length !== cells * 2) {
    throw new Error(
      `nutelch: malformed LUT — ${bin.length} bytes, expected ${cells * 2} (${lSteps}×${hSteps} uint16)`,
    );
  }
  const data = new Uint16Array(cells);
  for (let i = 0; i < cells; i++) {
    data[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); // little-endian
  }
  return { mode, lMax: mode === 'oklch' ? 1 : 100, cmax, lSteps, hSteps, data };
}
