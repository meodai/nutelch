export interface SlicePoint {
  l: number; // 0..1 normalized for plotting
  c: number; // chroma at the point
}

export interface SliceInput {
  hue: number;
  lMax: number; // 1 for ok, 100 for cie (axis label only)
  lutEnvelope: (t: number) => number; // nutColor LUT boundary, t = normalized L in [0,1]
  actualEnvelope: (t: number) => number; // culori live boundary, same t
  cmax: number; // x-axis max chroma for scaling
  point: SlicePoint | null; // current marker
  showActual: boolean; // overlay the actual envelope
}

const W = 400;
const H = 400;
const PAD = { l: 48, r: 16, t: 26, b: 32 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

const f = (n: number) => n.toFixed(2);
const fmtPts = (pts: Array<[number, number]>) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

export function renderSlice(host: HTMLElement, input: SliceInput): void {
  const { hue, lutEnvelope, actualEnvelope, cmax, point, showActual } = input;
  const Y = (t: number) => PAD.t + (1 - t) * PLOT_H;
  const X = (c: number) => PAD.l + (cmax > 0 ? c / cmax : 0) * PLOT_W;

  const STEPS = 96;
  const sample = (env: (t: number) => number): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      pts.push([X(env(t)), Y(t)]);
    }
    return pts;
  };

  const lutLine = `<polyline points="${fmtPts(sample(lutEnvelope))}" class="env-line" fill="none"/>`;
  const actualLine = showActual
    ? `<polyline points="${fmtPts(sample(actualEnvelope))}" class="env-actual" fill="none" stroke-dasharray="4 3"/>`
    : '';

  const lTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => {
      const y = Y(t);
      return `<line x1="${PAD.l}" y1="${f(y)}" x2="${f(W - PAD.r)}" y2="${f(y)}" class="grid"/>
        <text x="${PAD.l - 8}" y="${f(y + 3)}" class="tick" text-anchor="end">${t}</text>`;
    })
    .join('');

  let marker = '';
  if (point) {
    const px = X(point.c);
    const py = Y(point.l);
    marker = `<line x1="${PAD.l}" y1="${f(py)}" x2="${f(px)}" y2="${f(py)}" class="guide"/>
      <circle cx="${f(px)}" cy="${f(py)}" r="4" class="dot"/>`;
  }

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="slice-svg" role="img"
         aria-label="chroma-lightness slice at hue ${hue.toFixed(0)}">
      <text x="${PAD.l}" y="16" class="title" text-anchor="start">hue ${hue.toFixed(0)}°</text>
      ${lTicks}
      ${lutLine}
      ${actualLine}
      ${marker}
      <text x="${PAD.l - 38}" y="${f(PAD.t + PLOT_H / 2)}" class="axis" text-anchor="middle"
            transform="rotate(-90 ${PAD.l - 38} ${f(PAD.t + PLOT_H / 2)})">lightness</text>
      <text x="${f(PAD.l + PLOT_W / 2)}" y="${H - 2}" class="axis" text-anchor="middle">chroma</text>
    </svg>`;
}
