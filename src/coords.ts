const D2R = Math.PI / 180;

// Cylindrical (l, c, h°) -> rectangular (l, a, b). Shared by *lab output modes.
export function toRect(l: number, c: number, h: number): { l: number; a: number; b: number } {
  const r = h * D2R;
  return { l, a: c * Math.cos(r), b: c * Math.sin(r) };
}
