import { cusp, relch, type Mode, type Gamut } from '../index';
import {
  buildControls,
  type ControlValues,
  type RangeSpec,
  type SelectSpec,
} from './controls';
import { renderSlice } from './slice';
import { actualMaxChroma } from './actual';

type Family = 'ok' | 'cie';

const MODES: Mode[] = ['oklch', 'oklab', 'lch', 'lab'];
const familyOf = (m: Mode): Family => (m === 'oklch' || m === 'oklab' ? 'ok' : 'cie');
const lMaxOf = (fam: Family) => (fam === 'ok' ? 1 : 100);

const root = document.documentElement;
const controlsHost = document.getElementById('controls')!;
const swatch = document.getElementById('swatch')!;
const sliceHost = document.getElementById('slice')!;
const readoutHost = document.getElementById('readout')!;

let family: Family = 'ok';
let lMax = 1;

// Lightness readout follows the active model's native L scale.
const fmtL = (v: number) => (lMax === 1 ? v.toFixed(3) : Math.round(v).toString());

const ranges: RangeSpec[] = [
  { key: 'l', label: 'lightness', min: 0, max: 1, step: 0.001, value: 0.72, format: fmtL },
  { key: 'relC', label: 'relC · saturation', min: 0, max: 1.5, step: 0.005, value: 1, format: (v) => v.toFixed(3) },
  { key: 'h', label: 'hue', min: 0, max: 360, step: 1, value: 142, format: (v) => `${Math.round(v)}°` },
];

const selects: SelectSpec[] = [
  { key: 'mode', label: 'model', options: MODES, value: 'oklch' },
  { key: 'gamut', label: 'gamut', options: ['srgb', 'display-p3'], value: 'srgb' },
  { key: 'compare', label: 'overlay actual', options: ['on', 'off'], value: 'on' },
];

// Faithful CSS for the active family — oklch for OK, lch for CIE. `t` is
// normalized lightness 0..1; CIE L is expressed as a percentage.
const cssColorFor = (fam: Family, h: number) => (t: number, c: number) =>
  fam === 'ok'
    ? `oklch(${t.toFixed(4)} ${c.toFixed(4)} ${h})`
    : `lch(${(t * 100).toFixed(2)}% ${c.toFixed(3)} ${h})`;

const fmtComp = (fam: Family, v: number) => (fam === 'ok' ? v.toFixed(4) : v.toFixed(2));

function renderReadout(
  col: { mode: Mode } & ({ l: number; c: number; h: number } | { l: number; a: number; b: number }),
  css: string,
  fam: Family,
  relC: number,
  cAbs: number,
  peakC: number,
): void {
  const lStr = fam === 'ok' ? col.l.toFixed(3) : Math.round(col.l).toString();
  const comps =
    'c' in col
      ? [
          ['L', lStr],
          ['C', fmtComp(fam, col.c)],
          ['H', `${Math.round(col.h)}°`],
        ]
      : [
          ['L', lStr],
          ['a', fmtComp(fam, col.a)],
          ['b', fmtComp(fam, col.b)],
        ];

  const over = relC > 1.0001;
  const peakStr = fmtComp(fam, peakC);
  const cStr = fmtComp(fam, cAbs);

  readoutHost.innerHTML = `
    <div class="readout__mode">${col.mode}</div>
    <dl class="readout__grid">
      ${comps.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
    </dl>
    <div class="readout__map ${over ? 'is-over' : ''}">
      relC <b>${relC.toFixed(3)}</b> → C <b>${cStr}</b>
      <span class="readout__cusp">cusp ${peakStr}</span>
      ${over ? '<span class="readout__flag">out of gamut</span>' : ''}
    </div>
    <code class="readout__css">${css}</code>`;
}

function render(v: ControlValues): void {
  const mode = v.choices.mode as Mode;
  const gamut = v.choices.gamut as Gamut;
  const fam = familyOf(mode);
  const showActual = v.choices.compare === 'on';

  const lNative = v.values.l ?? 0;
  const h = v.values.h ?? 0;
  const relC = v.values.relC ?? 1;
  const t = lMaxOf(fam) === 1 ? lNative : lNative / 100; // normalized 0..1

  const col = relch({ mode, l: lNative, relC, h, gamut });
  const cAbs = 'c' in col ? col.c : Math.hypot(col.a, col.b);
  const peak = cusp({ mode, l: lNative, h, gamut });
  const peakC = 'c' in peak ? peak.c : Math.hypot(peak.a, peak.b);

  const css =
    fam === 'ok'
      ? `oklch(${t.toFixed(4)} ${cAbs.toFixed(4)} ${h})`
      : `lch(${lNative.toFixed(2)}% ${cAbs.toFixed(3)} ${h})`;

  // Theme the page with the live color.
  root.style.setProperty('--live', css);
  root.style.setProperty('--live-hue', String(h));
  swatch.style.background = css;

  renderReadout(col, css, fam, relC, cAbs, peakC);

  renderSlice(sliceHost, {
    hue: h,
    lMax: lMaxOf(fam),
    cssColor: cssColorFor(fam, h),
    lutEnvelope: (tt) => {
      const r = cusp({ mode, l: tt * lMaxOf(fam), h, gamut });
      return 'c' in r ? r.c : Math.hypot(r.a, r.b);
    },
    actualEnvelope: (tt) => actualMaxChroma(fam, tt * lMaxOf(fam), h, gamut),
    cmax: Math.max(peakC, cAbs, lMaxOf(fam) === 1 ? 0.05 : 5) * 1.15,
    point: { l: t, c: cAbs },
    showActual,
  });
}

const handle = buildControls(controlsHost, ranges, selects, (v, changed) => {
  const newFamily = familyOf(v.choices.mode as Mode);
  // Switching model family rescales the lightness slider to the native L range,
  // preserving the relative position. setRange patches in place — no rebuild,
  // so focus and scroll position are untouched.
  if (changed === 'mode' && newFamily !== family) {
    const relPos = (v.values.l ?? 0) / lMax;
    const newMax = lMaxOf(newFamily);
    family = newFamily;
    lMax = newMax;
    handle.setRange('l', {
      min: 0,
      max: newMax,
      step: newMax === 1 ? 0.001 : 0.1,
      value: relPos * newMax,
    });
    render(handle.values());
    return;
  }
  render(v);
});
