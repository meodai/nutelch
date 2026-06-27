export interface SlicePoint {
  l: number; // normalized lightness 0..1 for plotting
  c: number; // chroma at the point
}

export interface SliceInput {
  hue: number;
  lMax: number; // 1 for OK family, 100 for CIE family (axis labels)
  cssColor: (t: number, c: number) => string; // (normalized L, chroma) -> CSS color string
  lutEnvelope: (t: number) => number; // nutelch LUT boundary chroma, t = normalized L
  actualEnvelope: (t: number) => number; // culori live boundary, same t
  okhslCurve?: Array<[number, number]> | null; // OkHSL boundary as [normalized L, chroma] points
  cmax: number; // x-axis max chroma for scaling
  point: SlicePoint | null; // nutColor's resolved point
  pctPoint?: SlicePoint | null; // the raw oklch%/lch% point, for comparison
  showActual: boolean; // overlay the actual (culori) envelope
}

const W = 540;
const H = 480;
const PAD = { l: 56, r: 24, t: 36, b: 42 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

const f = (n: number) => n.toFixed(2);
const fmtPts = (p: Array<[number, number]>) => p.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

function niceStep(max: number): number {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const s = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return s * mag;
}

export function renderSlice(host: HTMLElement, input: SliceInput): void {
  const { hue, lMax, cssColor, lutEnvelope, actualEnvelope, okhslCurve, cmax, point, pctPoint, showActual } =
    input;
  const Y = (t: number) => PAD.t + (1 - t) * PLOT_H;
  const X = (c: number) => PAD.l + (cmax > 0 ? c / cmax : 0) * PLOT_W;

  // The shell itself, filled with real gamut colors: each lightness row is a
  // horizontal gradient from neutral (chroma 0) out to the boundary color.
  const ROWS = 56;
  let defs = '';
  let fill = '';
  for (let i = 0; i < ROWS; i++) {
    const t0 = i / ROWS;
    const t1 = (i + 1) / ROWS;
    const tm = (t0 + t1) / 2;
    const cm = lutEnvelope(tm);
    if (cm <= 0) continue;
    const c0 = lutEnvelope(t0);
    const c1 = lutEnvelope(t1);
    const id = `shell-row-${i}`;
    defs += `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${cssColor(tm, 0)}"/>
        <stop offset="100%" stop-color="${cssColor(tm, cm)}"/>
      </linearGradient>`;
    fill += `<polygon points="${fmtPts([
      [X(0), Y(t0)],
      [X(c0), Y(t0)],
      [X(c1), Y(t1)],
      [X(0), Y(t1)],
    ])}" fill="url(#${id})"/>`;
  }

  // Envelopes (LUT solid, actual dashed) + locate the cusp (peak chroma over L).
  const STEPS = 120;
  const sample = (env: (t: number) => number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      out.push([X(env(t)), Y(t)]);
    }
    return out;
  };
  const lutLine = `<polyline class="env env--lut" points="${fmtPts(sample(lutEnvelope))}"/>`;
  const actLine = showActual
    ? `<polyline class="env env--actual" points="${fmtPts(sample(actualEnvelope))}"/>`
    : '';
  const okhslLine =
    okhslCurve && okhslCurve.length
      ? `<polyline class="env env--okhsl" points="${fmtPts(
          okhslCurve.map(([t, c]) => [X(c), Y(t)]),
        )}"/>`
      : '';

  let cuspT = 0;
  let cuspC = 0;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const c = lutEnvelope(t);
    if (c > cuspC) {
      cuspC = c;
      cuspT = t;
    }
  }
  const cuspLabel = lMax === 1 ? cuspC.toFixed(3) : Math.round(cuspC).toString();
  const cuspMark = `<g class="cusp">
      <circle cx="${f(X(cuspC))}" cy="${f(Y(cuspT))}" r="4.5"/>
      <text x="${f(X(cuspC) - 9)}" y="${f(Y(cuspT) + 4)}" text-anchor="end">cusp ${cuspLabel}</text>
    </g>`;

  // Lightness gridlines, labelled in native units.
  const lTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => {
      const y = Y(t);
      const lab = lMax === 1 ? t.toFixed(2) : Math.round(t * lMax).toString();
      return `<line class="grid" x1="${PAD.l}" y1="${f(y)}" x2="${W - PAD.r}" y2="${f(y)}"/>
        <text class="tick" x="${PAD.l - 10}" y="${f(y + 3)}" text-anchor="end">${lab}</text>`;
    })
    .join('');

  // Chroma ticks along the bottom.
  let cTicks = '';
  const step = niceStep(cmax);
  for (let c = step; c < cmax; c += step) {
    const lab = lMax === 1 ? c.toFixed(2) : Math.round(c).toString();
    cTicks += `<text class="tick" x="${f(X(c))}" y="${H - PAD.b + 17}" text-anchor="middle">${lab}</text>`;
  }

  // The raw oklch%/lch% point — an outlined square. When its chroma exceeds the
  // shell at its lightness it's out of gamut, so flag it (and it sits right of
  // the boundary envelope, making the overshoot visible).
  let pctMarker = '';
  if (pctPoint) {
    const px = X(pctPoint.c);
    const py = Y(pctPoint.l);
    const oog = pctPoint.c > lutEnvelope(pctPoint.l) + 1e-9;
    const s = 4.5;
    pctMarker = `<rect class="dot-pct${oog ? ' is-oog' : ''}" x="${f(px - s)}" y="${f(py - s)}" width="${f(2 * s)}" height="${f(2 * s)}"/>`;
  }

  // nutColor's current point with crosshair guides.
  let marker = '';
  if (point) {
    const px = X(point.c);
    const py = Y(point.l);
    marker = `<line class="guide" x1="${PAD.l}" y1="${f(py)}" x2="${f(px)}" y2="${f(py)}"/>
      <line class="guide" x1="${f(px)}" y1="${f(py)}" x2="${f(px)}" y2="${H - PAD.b}"/>
      <circle class="dot-halo" cx="${f(px)}" cy="${f(py)}" r="9"/>
      <circle class="dot" cx="${f(px)}" cy="${f(py)}" r="5"/>`;
  }

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="slice" role="img"
         aria-label="gamut shell cross-section at hue ${Math.round(hue)} degrees">
      <defs>${defs}</defs>
      <text class="slice__title" x="${PAD.l}" y="20">gamut shell · hue ${Math.round(hue)}°</text>
      ${lTicks}
      ${fill}
      ${lutLine}
      ${actLine}
      ${okhslLine}
      ${cuspMark}
      ${pctMarker}
      ${marker}
      ${cTicks}
      <text class="axis" x="16" y="${f(PAD.t + PLOT_H / 2)}"
            transform="rotate(-90 16 ${f(PAD.t + PLOT_H / 2)})" text-anchor="middle">lightness</text>
      <text class="axis" x="${f(PAD.l + PLOT_W / 2)}" y="${H - 5}" text-anchor="middle">chroma →</text>
    </svg>`;
}
