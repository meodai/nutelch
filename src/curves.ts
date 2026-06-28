// Smoothstep — the classic Hermite S-curve, clamped to [0,1]. A gentle
// ease-in-out you can apply to any axis before relch/reach. Shipped because it's
// the curve people reach for most; anything richer is the caller's job (easing is
// just a 1-D remap — bring your own or any easing library).
export function smoothstep(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}
