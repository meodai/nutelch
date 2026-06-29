import { cusp, relch, toCss, toe, toeInv, smoothstep, type Mode } from '../index';
import { oklchSrgb, oklchP3, lchSrgb, lchP3 } from '../luts';
import {
  buildControls,
  type ControlValues,
  type RangeSpec,
  type SelectSpec,
} from './controls';
import { renderSlice } from './slice';
import { okhslHex, okhslCoords, actualMaxChroma } from './actual';
import { findCusp, sFromPoint, rayAnchorT, pointAtS, invertEase } from './cuspray';
import pkg from '../../package.json';

type Family = 'ok' | 'cie';
type Gamut = 'srgb' | 'display-p3';

const MODES: Mode[] = ['oklch', 'lch'];
const familyOf = (m: Mode): Family => (m === 'oklch' ? 'ok' : 'cie');
const lMaxOf = (fam: Family) => (fam === 'ok' ? 1 : 100);

// The demo lets the user pick mode + gamut, then hands the matching LUT to the
// lib. Apps that need only one gamut just import that single LUT directly.
const LUTS = {
  oklch: { srgb: oklchSrgb, 'display-p3': oklchP3 },
  lch: { srgb: lchSrgb, 'display-p3': lchP3 },
} as const;
// Importable names for each LUT, for the live code snippet.
const LUT_NAME: Record<Mode, Record<Gamut, string>> = {
  oklch: { srgb: 'oklchSrgb', 'display-p3': 'oklchP3' },
  lch: { srgb: 'lchSrgb', 'display-p3': 'lchP3' },
};
// CSS percentage reference for chroma: oklch 100% = 0.4, lch 100% = 150.
const PCT_REF = (fam: Family) => (fam === 'ok' ? 0.4 : 150);

// Demo-local easing functions. The LIB ships none of these — easing is the
// caller's concern, applied to whatever axis you like by transforming the
// input before relch(). Each maps [0,1] -> [0,1].
const id = (x: number) => x;
// `toe`/`toeInv` come from the lib now. `toe-inv` is OkHSL's lightness transform
// (okhsl.l -> oklab.L), so applying it to nutelch's L matches OkHSL's lightness
// exactly; `toe` is the opposite bend, shown for contrast.
const EASE: Record<string, (x: number) => number> = {
  linear: id,
  smoothstep,
  'ease-in': (x) => x * x,
  'ease-out': (x) => 1 - (1 - x) * (1 - x),
  'toe-inv': toeInv,
  toe,
};
const EASE_NAMES = Object.keys(EASE);

const root = document.documentElement;

const WM_W = 1400;
const WM_H = 300;
const WM_N = 42;
const WM_DUTY = 0.9;
const WM_FADE = 0.6;
const WM_STROKE = 2;

function stripeBand(kind: 'field' | 'figure'): string {
  const pitch = WM_H / WM_N;
  const bars = (fill: string, strokeBase = 0) => {
    let s = '';
    for (let i = 0; i < WM_N; i++) {
      const cy = (i + 0.5) * pitch;
      const x = i / (WM_N - 1);
      const t = Math.min(Math.max((x - WM_FADE) / (1 - WM_FADE), 0), 1);
      const factor = (1 - x) * (1 - t * t * (3 - 2 * t));
      const w = pitch * WM_DUTY * factor;
      if (w < 0.1) continue;
      const stroke = strokeBase ? ` stroke="#fff" stroke-width="${(strokeBase * factor).toFixed(3)}"` : '';
      s += `<rect x="0" y="${(cy - w / 2).toFixed(2)}" width="${WM_W}" height="${w.toFixed(2)}" fill="${fill}"${stroke}/>`;
    }
    return s;
  };
  const text = (fill: string) =>
    `<text class="wm-text" x="${WM_W / 2}" y="280" text-anchor="middle" fill="${fill}">nutelch</text>`;

  const maskBody =
    kind === 'field'
      ? bars('#fff') + text('#000')
      : text('#fff') + bars('#000', WM_STROKE);
  const id = `wm-${kind}`;
  return `<svg viewBox="0 0 ${WM_W} ${WM_H}" class="wordmark-svg wordmark-svg--${kind}" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <defs><mask id="${id}">${maskBody}</mask></defs>
      <rect width="${WM_W}" height="${WM_H}" fill="currentColor" mask="url(#${id})"/>
    </svg>`;
}

function buildWordmark(host: HTMLElement | null, type: 'figure' | 'field'): void {
  if (!host) return;
  // figure underneath, field on top — the field's word-hole reveals the figure.
  host.innerHTML = stripeBand(type);
}
buildWordmark(document.getElementById('wordmark'), 'figure');
buildWordmark(document.getElementById('wordmark-footer'), 'field');

const versionEl = document.getElementById('version');
if (versionEl) versionEl.textContent = `v${pkg.version}`;

const controlsHost = document.getElementById('controls')!;
const sliceHost = document.getElementById('slice')!;
const readoutHost = document.getElementById('readout')!;
const codeHost = document.getElementById('code')!;
const swOkhsl = document.getElementById('sw-okhsl')!;
const swNut = document.getElementById('sw-nut')!;
const swPct = document.getElementById('sw-pct')!;
// the pct swatch's name flips with the family (oklch % / lch %); it lives in a
// sibling under the shared .swatch__item, not inside the cell.
const bnPct = swPct.closest('.swatch__item')!.querySelector('.bn')!;

// Out-of-gamut badge: a "!" in the swatch's upper-right corner, with the message
// as its hover title. Toggled per-swatch instead of a single readout line.
function setGamutFlag(cell: HTMLElement, over: boolean): void {
  let flag = cell.querySelector<HTMLElement>('.swatch__flag');
  if (over) {
    if (!flag) {
      flag = document.createElement('span');
      flag.className = 'swatch__flag';
      flag.textContent = '!';
      flag.title = 'out of gamut';
      cell.appendChild(flag);
    }
  } else {
    flag?.remove();
  }
}

let family: Family = 'ok';
let lMax = 1;

const fmtL = (v: number) => (lMax === 1 ? v.toFixed(3) : Math.round(v).toString());

const ranges: RangeSpec[] = [
  { key: 'l', label: 'lightness', min: 0, max: 1, step: 0.001, value: 0.72, format: fmtL },
  { key: 'relC', label: 'relC · saturation', min: 0, max: 1.5, step: 0.005, value: 0.67, format: (v) => v.toFixed(3) },
  { key: 'cuspRay', label: 'cusp reach', min: 0, max: 1, step: 0.005, value: 1, format: (v) => v.toFixed(3) },
  { key: 'h', label: 'hue', min: 0, max: 360, step: 1, value: Math.floor(Math.random() * 360), format: (v) => `${Math.round(v)}°` },
];

const selects: SelectSpec[] = [
  { key: 'mode', label: 'model', options: MODES, value: 'oklch' },
  { key: 'gamut', label: 'gamut', options: ['srgb', 'display-p3'], value: 'srgb' },
  { key: 'curveL', label: 'L curve', options: EASE_NAMES, value: 'linear' },
  { key: 'curveC', label: 'relC curve', options: EASE_NAMES, value: 'linear' },
];

// Faithful CSS for the active family. `t` is normalized lightness 0..1.
const css = (fam: Family, t: number, c: number, h: number) =>
  fam === 'ok'
    ? `oklch(${t.toFixed(4)} ${c.toFixed(4)} ${h})`
    : `lch(${(t * 100).toFixed(2)}% ${c.toFixed(3)} ${h})`;

const fmtComp = (fam: Family, v: number) => (fam === 'ok' ? v.toFixed(4) : v.toFixed(2));

function renderReadout(
  col: { mode: Mode; l: number; c: number; h: number },
  fam: Family,
  relC: number,
  peakC: number,
): void {
  const lStr = fam === 'ok' ? col.l.toFixed(3) : Math.round(col.l).toString();
  const over = relC > 1.0001;
  readoutHost.innerHTML = `
    <dl class="readout__grid">
      <div><dt>L</dt><dd>${lStr}</dd></div>
      <div><dt>C</dt><dd>${fmtComp(fam, col.c)}</dd></div>
      <div><dt>H</dt><dd>${Math.round(col.h)}°</dd></div>
    </dl>
    <div class="readout__map ${over ? 'is-over' : ''}">
      relC <b>${relC.toFixed(3)}</b> → C <b>${fmtComp(fam, col.c)}</b>
      <span class="readout__cusp">cusp <b>${fmtComp(fam, peakC)}</b></span>
    </div>`;
}

function renderCode(lutName: string, fam: Family, l: number, relC: number, h: number, cssStr: string): void {
  const lArg = fam === 'ok' ? l.toFixed(4) : l.toFixed(2);
  const cArg = relC.toFixed(fam === 'ok' ? 4 : 3);
  codeHost.textContent =
    `import {\n` +
    `  relch, toCss, ${lutName}\n` +
    `} from 'nutelch';\n\n` +
    `const color = relch({\n` +
    `  lut: ${lutName},\n` +
    `  l: ${lArg},\n` +
    `  relC: ${cArg},\n` +
    `  h: ${Math.round(h)},\n` +
    `});\n` +
    `// → { mode, l, c, h }\n\n` +
    `toCss(color);\n` +
    `// "${cssStr}"`;
}

function render(v: ControlValues): void {
  const mode = v.choices.mode as Mode;
  const gamut = v.choices.gamut as Gamut;
  const fam = familyOf(mode);
  const lut = LUTS[mode][gamut];

  const lParam = v.values.l ?? 0;
  const h = v.values.h ?? 0;
  const relC = v.values.relC ?? 1;
  const tParam = lMaxOf(fam) === 1 ? lParam : lParam / 100;

  const easeL = EASE[v.choices.curveL ?? 'linear'] ?? id;
  const easeC = EASE[v.choices.curveC ?? 'linear'] ?? id;
  const t = Math.min(Math.max(easeL(tParam), 0), 1);
  const lEased = t * lMaxOf(fam);
  const relCe = easeC(Math.min(relC, 1)) + Math.max(relC - 1, 0);

  const col = relch({ lut, l: lEased, relC: relCe, h });
  const peakC = cusp({ lut, l: lEased, h }).c;

  const env = (tt: number) => cusp({ lut, l: tt * lMaxOf(fam), h }).c;
  const peakCusp = findCusp(env);
  const cuspS = sFromPoint(col.c, peakCusp);
  const anchorT = rayAnchorT(t, col.c, peakCusp);
  if (handle) handle.setRange('cuspRay', { value: cuspS });

  const cssNut = toCss(col);
  const cPct = relCe * PCT_REF(fam);
  const cssPct = toCss({ mode: col.mode, l: lEased, c: cPct, h });
  const okhsl = okhslCoords(fam, h, Math.min(relC, 1), tParam);
  const hexOkhsl = okhslHex(h, Math.min(relC, 1), tParam);

  root.style.setProperty('--live', cssNut);
  root.style.setProperty('--live-ink', t > 0.6 ? 'oklch(0.18 0 0)' : 'oklch(0.97 0 0)');

  swNut.style.background = cssNut;
  swPct.style.background = cssPct;
  swOkhsl.style.background = hexOkhsl;

  setGamutFlag(swNut, relC > 1.0001);
  setGamutFlag(swPct, cPct > peakC * 1.0001);

  bnPct.textContent = fam === 'ok' ? 'oklch %' : 'lch %';

  renderReadout(col, fam, relC, peakC);
  renderCode(LUT_NAME[mode][gamut], fam, lEased, relCe, h, cssNut);

  renderSlice(sliceHost, {
    hue: h,
    lMax: lMaxOf(fam),
    cssColor: (tt, c) => css(fam, tt, c, h),
    lutEnvelope: (tt) => cusp({ lut, l: tt * lMaxOf(fam), h }).c,
    cmax: Math.max(peakCusp.c, PCT_REF(fam), col.c, cPct, lMaxOf(fam) === 1 ? 0.05 : 5) * 1.05,
    point: { l: t, c: col.c },
    pctPoint: { l: t, c: cPct },
    pctLabel: fam === 'ok' ? 'oklch%' : 'lch%',
    okhslPoint: fam === 'ok' && gamut === 'srgb' ? { l: okhsl.t, c: okhsl.c } : null,
    okhslLabel: 'okhsl',
    cusp: peakCusp,
    rayAnchorT: anchorT,
  });
}

let handle: ReturnType<typeof buildControls>;

function applyCuspRay(v: ControlValues): void {
  const mode = v.choices.mode as Mode;
  const fam = familyOf(mode);
  const gamut = v.choices.gamut as Gamut;
  const lut = LUTS[mode][gamut];
  const h = v.values.h ?? 0;
  const env = (tt: number) => cusp({ lut, l: tt * lMaxOf(fam), h }).c;
  const peakCusp = findCusp(env);

  const easeL = EASE[v.choices.curveL ?? 'linear'] ?? id;
  const easeC = EASE[v.choices.curveC ?? 'linear'] ?? id;

  const tParam = lMaxOf(fam) === 1 ? (v.values.l ?? 0) : (v.values.l ?? 0) / 100;
  const tNow = Math.min(Math.max(easeL(tParam), 0), 1);
  const relCnow = v.values.relC ?? 1;
  const relCeNow = easeC(Math.min(relCnow, 1)) + Math.max(relCnow - 1, 0);
  const cNow = relCeNow * env(tNow);

  const anchorT = rayAnchorT(tNow, cNow, peakCusp);
  const target = pointAtS(v.values.cuspRay ?? 1, anchorT, peakCusp);

  const rawL = invertEase(easeL, target.t) * lMaxOf(fam);
  const envAtT = env(target.t);
  const relCactual = envAtT > 1e-9 ? target.c / envAtT : 0;
  const rawRelC = relCactual <= 1 ? invertEase(easeC, relCactual) : 1 + (relCactual - 1);

  handle.setRange('l', { value: rawL });
  handle.setRange('relC', { value: rawRelC });
  render(handle.values());
}

handle = buildControls(controlsHost, ranges, selects, (v, changed) => {
  if (changed === 'cuspRay') {
    applyCuspRay(v);
    return;
  }
  const newFamily = familyOf(v.choices.mode as Mode);
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

function runBenchmark(): void {
  const elSpeed = document.getElementById('brag-speedup');
  const elRate = document.getElementById('brag-rate');
  const elOkhsl = document.getElementById('brag-okhsl');
  const elError = document.getElementById('brag-error');
  if (!elSpeed || !elRate || !elOkhsl || !elError) return;

  const lut = oklchSrgb;
  const N = 24000;
  const ls = new Float64Array(N);
  const hs = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    ls[i] = 0.02 + ((i % 97) / 97) * 0.95;
    hs[i] = (i * 7) % 360;
  }

  let acc = 0;
  for (let i = 0; i < 3000; i++) {
    acc += cusp({ lut, l: ls[i]!, h: hs[i]! }).c;
    acc += actualMaxChroma('ok', ls[i]!, hs[i]!, 'srgb');
    acc += relch({ lut, l: ls[i]!, relC: 0.7, h: hs[i]! }).c;
    acc += okhslCoords('ok', hs[i]!, 0.7, ls[i]!).c;
  }

  const t0 = performance.now();
  for (let i = 0; i < N; i++) acc += cusp({ lut, l: ls[i]!, h: hs[i]! }).c;
  const nutMs = performance.now() - t0;

  const t1 = performance.now();
  for (let i = 0; i < N; i++) acc += actualMaxChroma('ok', ls[i]!, hs[i]!, 'srgb');
  const culMs = performance.now() - t1;

  const t2 = performance.now();
  for (let i = 0; i < N; i++) acc += relch({ lut, l: ls[i]!, relC: 0.7, h: hs[i]! }).c;
  const nut2Ms = performance.now() - t2;

  const t3 = performance.now();
  for (let i = 0; i < N; i++) acc += okhslCoords('ok', hs[i]!, 0.7, ls[i]!).c;
  const okMs = performance.now() - t3;

  if (acc < 0) console.log(acc);

  const fmt = (x: number) => (x >= 10 ? Math.round(x).toString() : x.toFixed(1));
  elSpeed.textContent = fmt(culMs / nutMs);
  elRate.textContent = Math.round(N / nutMs).toLocaleString();
  elOkhsl.textContent = fmt(okMs / nut2Ms);

  // Worst-case boundary error vs the true sRGB gamut, measured correctly: sweep a
  // dense (L, H) grid and take the largest |LUT − culori| across it. The old demo
  // used a coarse 5°/0.05-L grid whose samples landed near LUT nodes (where error
  // is ~0), so it badly under-reported. A fine grid converges on the real figure.
  // (The sRGB gamut is slightly non-convex at the blue corner, giving a ~0.036
  // near-singular spike over a <0.02° hue band; a practical grid steps over that
  // measure-zero sliver, which is also unreachable in real use — and undershoot
  // there is the safe, in-gamut direction.)
  const EL = 144;
  const EH = 576;
  let worst = 0;
  for (let i = 1; i < EL; i++) {
    const l = i / EL;
    for (let j = 0; j < EH; j++) {
      const h = (j / EH) * 360;
      const e = Math.abs(cusp({ lut, l, h }).c - actualMaxChroma('ok', l, h, 'srgb'));
      if (e > worst) worst = e;
    }
  }
  elError.textContent = `±${worst.toFixed(3)}`;
}

requestAnimationFrame(() => setTimeout(runBenchmark, 0));
