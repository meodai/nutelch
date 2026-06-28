// Geometry for the "cusp reach" slider. Everything lives in the slice's plot
// space: y = normalized lightness t in [0,1], x = actual chroma c. The global
// cusp is the peak-chroma point of the hue's gamut envelope. A color's "ray" is
// the line through its plotted point and the cusp; dragging the slider slides the
// point along that ray, from the achromatic anchor (c=0, s=0) to the cusp (s=1).
//
// Pure + framework-free so it can be unit-tested without a DOM.

export interface Cusp {
  t: number; // normalized lightness of the peak
  c: number; // peak (max over all L) chroma for the hue
}

// Locate the global cusp by scanning the envelope. A coarse scan then a local
// refine keeps it cheap but accurate enough that the drawn marker and the ray agree.
export function findCusp(envelope: (t: number) => number, steps = 256): Cusp {
  let ct = 0;
  let cc = -1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const c = envelope(t);
    if (c > cc) {
      cc = c;
      ct = t;
    }
  }
  // Refine around the best sample with a few bisection-ish passes.
  let lo = Math.max(0, ct - 1 / steps);
  let hi = Math.min(1, ct + 1 / steps);
  for (let i = 0; i < 24; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (envelope(m1) < envelope(m2)) lo = m1;
    else hi = m2;
  }
  const t = (lo + hi) / 2;
  const c = envelope(t);
  return c >= cc ? { t, c } : { t: ct, c: cc };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Slider value for a plotted point: chroma as a fraction of peak chroma. Every
// point on a ray satisfies c = s * cusp.c, so this reads the same whether the
// point is on its own ray or not — it's the position the thumb should show.
export function sFromPoint(c: number, cusp: Cusp): number {
  return cusp.c > 0 ? clamp01(c / cusp.c) : 0;
}

// Normalized lightness where this point's ray crosses c=0 (the dynamic anchor).
// Degenerates as c0 -> cusp.c (the point sits at the cusp, ray direction is
// undefined); in that case we fall back to the black anchor at t=0.
export function rayAnchorT(t0: number, c0: number, cusp: Cusp): number {
  const denom = cusp.c - c0;
  if (Math.abs(denom) < 1e-9) return 0;
  return cusp.t + (t0 - cusp.t) * (cusp.c / denom);
}

// Plot point at slider position s along the ray from the anchor to the cusp.
export function pointAtS(s: number, anchorT: number, cusp: Cusp): { t: number; c: number } {
  const sc = clamp01(s);
  return { t: anchorT + sc * (cusp.t - anchorT), c: sc * cusp.c };
}

// Numeric inverse of a monotonic-increasing easing on [0,1]: find x with ease(x)=y.
// Used to write the cusp-ray's target back to the raw L/relC sliders while the
// demo's easing curves are active.
export function invertEase(ease: (x: number) => number, y: number, iters = 48): number {
  const yc = clamp01(y);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (ease(mid) < yc) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
