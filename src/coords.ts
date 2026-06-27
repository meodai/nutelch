const D2R = Math.PI / 180;

// Convert a cylindrical color {l, c, h°} to rectangular Lab coordinates {l, a, b}.
// nutColor works in polar terms (chroma relative to the shell); this is the
// escape hatch for callers who need a/b — e.g. for `oklab()`/`lab()` output.
export function toLab(color: {
  l: number;
  c: number;
  h: number;
}): { l: number; a: number; b: number } {
  const r = color.h * D2R;
  return { l: color.l, a: color.c * Math.cos(r), b: color.c * Math.sin(r) };
}
