export interface Lut {
  data: Uint16Array;
  cmax: number;
  lSteps: number;
  hSteps: number;
}

// Decodes a base64 little-endian Uint16 buffer produced by scripts/build-luts.ts.
// atob is available in browsers and Node >= 16.
export function decodeLut(b64: string, cmax: number, lSteps: number, hSteps: number): Lut {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { data: new Uint16Array(bytes.buffer), cmax, lSteps, hSteps };
}
