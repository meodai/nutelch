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
// atob is available in browsers and Node >= 16.
export function decodeLut(
  mode: Mode,
  b64: string,
  cmax: number,
  lSteps: number,
  hSteps: number,
): Lut {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return {
    mode,
    lMax: mode === 'oklch' ? 1 : 100,
    cmax,
    lSteps,
    hSteps,
    data: new Uint16Array(bytes.buffer),
  };
}
