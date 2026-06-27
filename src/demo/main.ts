import { cusp, relch, type Mode, type Gamut } from '../index';
import { buildControls, type ControlValues } from './controls';
import { renderSlice } from './slice';
import { actualMaxChroma } from './actual';

const app = document.getElementById('app')!;
app.innerHTML = `
  <h1>nutColor — cusp explorer</h1>
  <div id="controls" class="controls"></div>
  <div id="swatch" class="swatch"></div>
  <div id="slice"></div>
`;

const controlsHost = document.getElementById('controls')!;
const swatch = document.getElementById('swatch')!;
const sliceHost = document.getElementById('slice')!;

const familyOf = (m: Mode): 'ok' | 'cie' => (m === 'oklch' || m === 'oklab' ? 'ok' : 'cie');
const lMaxOf = (m: Mode) => (familyOf(m) === 'ok' ? 1 : 100);

function render(v: ControlValues) {
  const mode = v.choices.mode as Mode;
  const gamut = v.choices.gamut as Gamut;
  const showActual = v.choices.compare === 'overlay';
  const lMax = lMaxOf(mode);
  const family = familyOf(mode);
  const l = (v.values.l ?? 0) * lMax; // slider is 0..1, scaled to the mode's L range
  const h = v.values.h ?? 0;
  const relC = v.values.relC ?? 1;

  const col = relch({ mode, l, relC, h, gamut });
  const cAbs = 'c' in col ? col.c : Math.hypot(col.a, col.b);

  // swatch via CSS oklch/oklab approximations (demo display only)
  const cssL = family === 'ok' ? l : l / 100;
  swatch.style.background = `oklch(${cssL} ${family === 'ok' ? cAbs : cAbs / 150 * 0.4} ${h})`;
  swatch.textContent = JSON.stringify(col);

  const peak = cusp({ mode, l, h, gamut });
  const peakC = 'c' in peak ? peak.c : Math.hypot(peak.a, peak.b);

  renderSlice(sliceHost, {
    hue: h,
    lMax,
    cmax: Math.max(peakC, cAbs, lMax === 1 ? 0.04 : 5) * 1.18,
    lutEnvelope: (t) => {
      const r = cusp({ mode, l: t * lMax, h, gamut });
      return 'c' in r ? r.c : Math.hypot(r.a, r.b);
    },
    actualEnvelope: (t) => actualMaxChroma(family, t * lMax, h, gamut),
    point: { l: l / lMax, c: cAbs },
    showActual,
  });
}

buildControls(
  controlsHost,
  [
    { key: 'l', label: 'L', min: 0, max: 1, step: 0.01, value: 0.6 },
    { key: 'relC', label: 'relC', min: 0, max: 1.5, step: 0.01, value: 1 },
    { key: 'h', label: 'H', min: 0, max: 360, step: 1, value: 30 },
  ],
  [
    { key: 'mode', label: 'mode', options: ['oklch', 'oklab', 'lch', 'lab'], value: 'oklch' },
    { key: 'gamut', label: 'gamut', options: ['srgb', 'display-p3'], value: 'srgb' },
    { key: 'compare', label: 'boundary', options: ['lut', 'overlay'], value: 'overlay' },
  ],
  render,
);
