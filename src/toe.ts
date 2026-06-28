// Ottosson's "toe" function and its inverse — the lightness remap behind OkHSL's
// reference lightness (Lr). `toe` maps OKLab L → Lr; `toeInv` maps Lr → OKLab L.
//
// These are shipped as named utilities, not baked into relch/reach: nutelch keeps
// a linear lightness axis, and you apply a remap yourself when you want one (see
// the README "Curves / easing"). Feeding `toeInv` to nutelch's lightness input is
// exactly what lines its lightness up with OkHSL.
//
// Constants from https://bottosson.github.io/posts/colorpicker/
const K1 = 0.206;
const K2 = 0.03;
const K3 = (1 + K1) / (1 + K2);

// OKLab L → Lr (perceptual reference lightness). toe(0)=0, toe(1)=1.
export function toe(x: number): number {
  return 0.5 * (K3 * x - K1 + Math.sqrt((K3 * x - K1) ** 2 + 4 * K2 * K3 * x));
}

// Lr → OKLab L, the inverse of toe — OkHSL's lightness transform. toeInv(0)=0, toeInv(1)=1.
export function toeInv(x: number): number {
  return (x * x + K1 * x) / (K3 * (x + K2));
}
