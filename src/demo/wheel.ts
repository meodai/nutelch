// Top view: hue = angle, chroma = radius. Each wedge is filled with that hue's
// most-saturated (cusp) color; the boundary contour is the per-hue cusp chroma
// (the gamut's peaks and valleys seen from above). Adapted from the testcolor
// (cusphanger) wheel, fed nutelch cusp data instead of culori.

const SIZE = 400;
const CT = SIZE / 2;
const PAD = 26;
const R = CT - PAD;

const pt = (hue: number, r: number): [number, number] => {
  const a = (hue * Math.PI) / 180;
  return [CT + r * Math.cos(a), CT - r * Math.sin(a)];
};
const f = (n: number) => n.toFixed(2);

export interface WheelCusp {
  h: number; // hue, evenly stepped and ordered
  c: number; // absolute cusp chroma at this hue
  t: number; // normalized lightness (0..1) of that cusp
}

export interface WheelInput {
  cusps: WheelCusp[];
  maxCusp: number; // radius scale (max cusp chroma across hues)
  cssColor: (t: number, c: number, h: number) => string; // (normalized L, chroma, hue) -> CSS
  marker: { hue: number; c: number } | null; // current color (absolute chroma)
}

export function renderWheel(host: HTMLElement, input: WheelInput): void {
  const { cusps, maxCusp, cssColor, marker } = input;
  if (!cusps.length || maxCusp <= 0) {
    host.innerHTML = '';
    return;
  }

  const rad = (c: number) => (c / maxCusp) * R;
  const hueAt = (i: number) => {
    const b = cusps[(i + 1) % cusps.length]!;
    return b.h === 0 ? 360 : b.h;
  };

  let wedges = '';
  let boundary = '';
  for (let i = 0; i < cusps.length; i++) {
    const a = cusps[i]!;
    const b = cusps[(i + 1) % cusps.length]!;
    const [ax, ay] = pt(a.h, rad(a.c));
    const [bx, by] = pt(hueAt(i), rad(b.c));
    wedges += `<path d="M ${f(CT)},${f(CT)} L ${f(ax)},${f(ay)} L ${f(bx)},${f(by)} Z" fill="${cssColor(a.t, a.c, a.h)}"/>`;
    boundary += `${i === 0 ? 'M' : 'L'} ${f(ax)},${f(ay)} `;
  }

  const rings = [0.25, 0.5, 0.75]
    .map((g) => `<circle cx="${CT}" cy="${CT}" r="${f(g * R)}" class="wheel-ring"/>`)
    .join('');

  let mk = '';
  if (marker) {
    const [mx, my] = pt(marker.hue, rad(marker.c));
    mk = `<line class="guide" x1="${CT}" y1="${CT}" x2="${f(mx)}" y2="${f(my)}"/>
      <circle class="dot-halo" cx="${f(mx)}" cy="${f(my)}" r="9"/>
      <circle class="dot" cx="${f(mx)}" cy="${f(my)}" r="5"/>`;
  }

  host.innerHTML = `
    <svg viewBox="0 0 ${SIZE} ${SIZE}" class="wheel" role="img"
         aria-label="top view: hue around the circle, chroma as radius">
      <radialGradient id="wheelFade" cx="50%" cy="50%" r="50%">
        <stop offset="0%" class="wheel-fade-in" />
        <stop offset="44%" class="wheel-fade-out" />
      </radialGradient>
      <g>${wedges}</g>
      <circle cx="${CT}" cy="${CT}" r="${R}" fill="url(#wheelFade)" />
      ${rings}
      <path d="${boundary}Z" class="wheel-boundary" />
      ${mk}
      <text class="slice__title" x="${PAD}" y="18">top view · cusp chroma per hue</text>
    </svg>`;
}
