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
      ${over ? '<span class="readout__flag">out of gamut</span>' : ''}
    </div>`;
}

// The live, copy-pasteable snippet that reproduces the current color. Shows the
// resolved (post-curve) l/relC, so it stands alone with just relch + the LUT.
function renderCode(lutName: string, fam: Family, l: number, relC: number, h: number, cssStr: string): void {
  const lArg = fam === 'ok' ? l.toFixed(4) : l.toFixed(2);
  const cArg = relC.toFixed(fam === 'ok' ? 4 : 3);
  codeHost.textContent =
    `import { relch, toCss, ${lutName} } from 'nutelch';\n\n` +
    `const color = relch({\n` +
    `  lut: ${lutName},\n` +
    `  l: ${lArg},\n` +
    `  relC: ${cArg},\n` +
    `  h: ${Math.round(h)},\n` +
    `});\n` +
    `// → { mode, l, c, h }\n\n` +
    `toCss(color); // "${cssStr}"`;
}

function render(v: ControlValues): void {
  const mode = v.choices.mode as Mode;
  const gamut = v.choices.gamut as Gamut;
  const fam = familyOf(mode);
  const lut = LUTS[mode][gamut];

  const lParam = v.values.l ?? 0; // raw slider, native scale
  const h = v.values.h ?? 0;
  const relC = v.values.relC ?? 1;
  const tParam = lMaxOf(fam) === 1 ? lParam : lParam / 100; // raw normalized L

  // Curves are applied to nutelch's input axes only (okhsl / oklch% stay pure).
  const easeL = EASE[v.choices.curveL ?? 'linear'] ?? id;
  const easeC = EASE[v.choices.curveC ?? 'linear'] ?? id;
  const t = Math.min(Math.max(easeL(tParam), 0), 1); // eased normalized L
  const lEased = t * lMaxOf(fam); // eased native L
  const relCe = easeC(Math.min(relC, 1)) + Math.max(relC - 1, 0); // ease the 0..1 part, keep overshoot

  const col = relch({ lut, l: lEased, relC: relCe, h });
  const peakC = cusp({ lut, l: lEased, h }).c;

  // Global cusp (peak chroma over all L) for this hue, in plot space, plus the
  // current dot's ray. Feeds the slice's ray line and keeps the "cusp reach"
  // slider thumb in sync as L/relC move.
  const env = (tt: number) => cusp({ lut, l: tt * lMaxOf(fam), h }).c;
  const peakCusp = findCusp(env);
  const cuspS = sFromPoint(col.c, peakCusp);
  const anchorT = rayAnchorT(t, col.c, peakCusp);
  if (handle) handle.setRange('cuspRay', { value: cuspS });

  // nutelch (center): relC relative to the cusp, with the chosen curves.
  const cssNut = toCss(col); // dogfood the lib's CSS helper
  // raw percentage: chroma as an absolute CSS fraction (ignores the cusp), same lightness.
  const cPct = relCe * PCT_REF(fam);
  const cssPct = toCss({ mode: col.mode, l: lEased, c: cPct, h });
  // OkHSL: pure reference — its own model, fed the RAW params (no nutelch curves).
  const okhsl = okhslCoords(fam, h, Math.min(relC, 1), tParam);
  const hexOkhsl = okhslHex(h, Math.min(relC, 1), tParam);

  // Theme the page with nutelch's live color, plus a contrasting ink for text
  // drawn on top of it (e.g. selection) — chosen from the color's lightness.
  root.style.setProperty('--live', cssNut);
  root.style.setProperty('--live-ink', t > 0.6 ? 'oklch(0.18 0 0)' : 'oklch(0.97 0 0)');

  swNut.style.background = cssNut;
  swPct.style.background = cssPct;
  swOkhsl.style.background = hexOkhsl;

  bnPct.textContent = fam === 'ok' ? 'oklch %' : 'lch %';

  renderReadout(col, fam, relC, peakC);
  renderCode(LUT_NAME[mode][gamut], fam, lEased, relCe, h, cssNut);

  renderSlice(sliceHost, {
    hue: h,
    lMax: lMaxOf(fam),
    cssColor: (tt, c) => css(fam, tt, c, h),
    lutEnvelope: (tt) => cusp({ lut, l: tt * lMaxOf(fam), h }).c,
    // Pin the chroma axis to the hue's global cusp (and the % reference) so it
    // stays put for every in-gamut move; it only grows past that when relC
    // overshoots the shell (col.c / cPct exceed the cusp).
    cmax: Math.max(peakCusp.c, PCT_REF(fam), col.c, cPct, lMaxOf(fam) === 1 ? 0.05 : 5) * 1.15,
    point: { l: t, c: col.c },
    pctPoint: { l: t, c: cPct },
    pctLabel: fam === 'ok' ? 'oklch%' : 'lch%',
    // OkHSL is an sRGB + OK model — only place its point on the OK/sRGB slice.
    okhslPoint: fam === 'ok' && gamut === 'srgb' ? { l: okhsl.t, c: okhsl.c } : null,
    okhslLabel: 'okhsl',
    cusp: peakCusp,
    rayAnchorT: anchorT,
  });
}

// Declared up front (not `const handle = ...`) so render(), which buildControls
// calls synchronously via emit('init'), can reference it without hitting the TDZ.
let handle: ReturnType<typeof buildControls>;

// Translate a "cusp reach" slider value into raw L + relC along the current
// point's ray, inverting whatever easing curves are active so the dot tracks the
// ray on screen. Mutates the L/relC sliders, then re-renders.
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

  // Current plotted (eased) point, so the ray is anchored where the dot is now.
  const tParam = lMaxOf(fam) === 1 ? (v.values.l ?? 0) : (v.values.l ?? 0) / 100;
  const tNow = Math.min(Math.max(easeL(tParam), 0), 1);
  const relCnow = v.values.relC ?? 1;
  const relCeNow = easeC(Math.min(relCnow, 1)) + Math.max(relCnow - 1, 0);
  const cNow = relCeNow * env(tNow);

  const anchorT = rayAnchorT(tNow, cNow, peakCusp);
  const target = pointAtS(v.values.cuspRay ?? 1, anchorT, peakCusp);

  // Back to raw slider values (undo the easing).
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
  // Switching model family rescales the lightness slider to the native L range,
  // preserving relative position. setRange patches in place (no rebuild), so
  // focus and scroll position are untouched.
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

// Live brag: time nutelch's LUT boundary lookup against culori computing the same
// boundary the honest way, on the user's machine. Run after first paint so it
// never delays the UI, and keep the workload identical for both contenders.
function runBenchmark(): void {
  const elSpeed = document.getElementById('brag-speedup');
  const elRate = document.getElementById('brag-rate');
  const elOkhsl = document.getElementById('brag-okhsl');
  if (!elSpeed || !elRate || !elOkhsl) return;

  const lut = oklchSrgb;
  const N = 24000;
  const ls = new Float64Array(N);
  const hs = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    ls[i] = 0.02 + ((i % 97) / 97) * 0.95;
    hs[i] = (i * 7) % 360;
  }

  // Warm every path so JIT state is comparable.
  let acc = 0;
  for (let i = 0; i < 3000; i++) {
    acc += cusp({ lut, l: ls[i]!, h: hs[i]! }).c;
    acc += actualMaxChroma('ok', ls[i]!, hs[i]!, 'srgb');
    acc += relch({ lut, l: ls[i]!, relC: 0.7, h: hs[i]! }).c;
    acc += okhslCoords('ok', hs[i]!, 0.7, ls[i]!).c;
  }

  // 1) boundary lookup: nutelch cusp vs culori computing the gamut boundary.
  const t0 = performance.now();
  for (let i = 0; i < N; i++) acc += cusp({ lut, l: ls[i]!, h: hs[i]! }).c;
  const nutMs = performance.now() - t0;

  const t1 = performance.now();
  for (let i = 0; i < N; i++) acc += actualMaxChroma('ok', ls[i]!, hs[i]!, 'srgb');
  const culMs = performance.now() - t1;

  // 2) boundary-relative color: nutelch relch vs an OkHSL (culori) conversion.
  const t2 = performance.now();
  for (let i = 0; i < N; i++) acc += relch({ lut, l: ls[i]!, relC: 0.7, h: hs[i]! }).c;
  const nut2Ms = performance.now() - t2;

  const t3 = performance.now();
  for (let i = 0; i < N; i++) acc += okhslCoords('ok', hs[i]!, 0.7, ls[i]!).c;
  const okMs = performance.now() - t3;

  if (acc < 0) console.log(acc); // keep the loops from being optimized away

  const fmt = (x: number) => (x >= 10 ? Math.round(x).toString() : x.toFixed(1));
  elSpeed.textContent = fmt(culMs / nutMs);
  elRate.textContent = Math.round(N / nutMs).toLocaleString();
  elOkhsl.textContent = fmt(okMs / nut2Ms);
}

requestAnimationFrame(() => setTimeout(runBenchmark, 0));
