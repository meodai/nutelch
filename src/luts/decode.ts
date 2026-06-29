export type Mode = 'oklch' | 'lch';

// A self-describing lookup table: it carries the cylindrical space it belongs to
// and that space's native lightness range, so consumers pass the LUT itself
// rather than selecting one through a registry.
//
// Sampling is on a NON-UNIFORM grid: `lbp`/`hbp` hold the actual L and H
// breakpoint positions, placed densely where the gamut boundary curves most
// (cusps) and sparsely where it is near-linear. A LUT without breakpoints is
// treated as a uniform grid (back-compat) — positions are then implicit.
export interface Lut {
  mode: Mode; // 'oklch' | 'lch' — also the mode returned by cusp/relch
  lMax: number; // native lightness max: 1 for oklch, 100 for lch
  cmax: number; // observed max chroma (the decode scale)
  lSteps: number;
  hSteps: number;
  data: Uint16Array;
  lbp?: Float64Array; // L breakpoint positions, ascending, lbp[0]=0, lbp[last]=lMax
  hbp?: Float64Array; // H breakpoint positions, ascending in [0,360); wraps at the seam
}

function decodeU16(b64: string): Uint16Array {
  const bin = atob(b64);
  const out = new Uint16Array(bin.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
  return out;
}

// Decodes a base64 little-endian Uint16 buffer produced by scripts/build-luts.ts.
// Bytes are combined explicitly (low byte first) so the result is identical on
// big- and little-endian hosts. atob is available in browsers and Node >= 16.
// `lbpB64`/`hbpB64` carry the breakpoint positions (uint16, normalized to lMax /
// 360); omit them for a uniform LUT.
export function decodeLut(
  mode: Mode,
  b64: string,
  cmax: number,
  lSteps: number,
  hSteps: number,
  lbpB64?: string,
  hbpB64?: string,
): Lut {
  const cells = lSteps * hSteps;
  const data = decodeU16(b64);
  if (data.length !== cells) {
    throw new Error(
      `nutelch: malformed LUT — ${data.length} cells, expected ${cells} (${lSteps}×${hSteps} uint16)`,
    );
  }
  const lMax = mode === 'oklch' ? 1 : 100;
  let lbp: Float64Array | undefined;
  let hbp: Float64Array | undefined;
  if (lbpB64) {
    const u = decodeU16(lbpB64);
    lbp = Float64Array.from(u, (v) => (v / 65535) * lMax);
  }
  if (hbpB64) {
    const u = decodeU16(hbpB64);
    hbp = Float64Array.from(u, (v) => (v / 65535) * 360);
  }
  return { mode, lMax, cmax, lSteps, hSteps, data, lbp, hbp };
}
