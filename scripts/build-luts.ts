import { clampChroma } from 'culori';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// LUT sampling strategy is per family — measured, not assumed (see
// scripts/final-compare.ts):
//
//  • OKLCH → ADAPTIVE non-uniform grid. Breakpoints bunch where the boundary
//    curves most (the cusps) and thin out where it is near-linear, so a 49×192
//    grid tracks the shell far better than a uniform one — and smaller. Practical
//    overshoot drops ~3× vs the old uniform grid.
//  • CIE LCH → UNIFORM grid. LCH's gamut is broadly curved everywhere, so spreading
//    a sparse adaptive grid starves the smooth bulk (rms blows up 5×). A uniform
//    65×256 grid is the better fit; its only large errors are at the near-singular
//    yellow-white cusp, which no finite linear LUT can fully resolve anyway.
const ADAPTIVE_L = 49; // OKLCH L nodes (includes L=0 and L=lMax)
const ADAPTIVE_H = 192; // OKLCH H nodes (includes H=0; wraps at the seam)
const UNIFORM_L = 65; // CIE LCH L nodes
const UNIFORM_H = 256; // CIE LCH H nodes

// Fine probe grid used to estimate boundary curvature for breakpoint placement.
const PL = 513;
const PH = 1440;

type Family = 'ok' | 'cie';
type Gamut = 'srgb' | 'display-p3';

const RGB_GAMUT: Record<Gamut, string> = { srgb: 'rgb', 'display-p3': 'p3' };
const CFG: Record<Family, { mode: 'oklch' | 'lch'; lMax: number; ceiling: number; adaptive: boolean }> = {
  ok: { mode: 'oklch', lMax: 1, ceiling: 0.5, adaptive: true }, // above any sRGB/P3 OKLCH chroma
  cie: { mode: 'lch', lMax: 100, ceiling: 160, adaptive: false }, // above any sRGB/P3 LCH chroma
};

function boundary(family: Family, gamut: Gamut, l: number, h: number): number {
  const { mode, ceiling } = CFG[family];
  const clamped = clampChroma({ mode, l, c: ceiling, h } as never, mode, RGB_GAMUT[gamut]);
  return (clamped as { c?: number }).c ?? 0;
}

// Place `count` ascending breakpoints over [0, axisMax] whose spacing follows the
// inverse of `importance` — equal cumulative importance per interval, so nodes
// bunch where the boundary bends. A uniform floor keeps smooth regions from being
// starved entirely. `wrap` omits the closing endpoint (hue seam).
function placeBreakpoints(importance: Float64Array, axisMax: number, count: number, wrap: boolean): Float64Array {
  const n = importance.length;
  let mean = 0;
  for (const v of importance) mean += v;
  mean /= n;
  const floor = mean * 0.18;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i]! + importance[i]! + floor;
  const total = cum[n]!;
  const segs = wrap ? count : count - 1;
  const bps = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const target = (k / segs) * total;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < target) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const frac = (target - cum[i - 1]!) / (cum[i]! - cum[i - 1]! || 1);
    bps[k] = ((i - 1 + frac) / n) * axisMax;
  }
  bps[0] = 0;
  if (!wrap) bps[count - 1] = axisMax;
  return bps;
}

function breakpoints(family: Family, gamut: Gamut): { lbp: Float64Array; hbp: Float64Array } {
  const { lMax } = CFG[family];
  const probe = (li: number, hi: number) => boundary(family, gamut, ((li + 0.5) / PL) * lMax, (hi / PH) * 360);
  const impL = new Float64Array(PL);
  const impH = new Float64Array(PH);
  for (let li = 0; li < PL; li++) {
    let mx = 0;
    for (let hi = 0; hi < PH; hi++) {
      const a = li > 0 ? probe(li - 1, hi) : 0;
      const b = probe(li, hi);
      const c = li < PL - 1 ? probe(li + 1, hi) : 0;
      mx = Math.max(mx, Math.abs(a - 2 * b + c));
    }
    impL[li] = mx;
  }
  for (let hi = 0; hi < PH; hi++) {
    let mx = 0;
    for (let li = 0; li < PL; li++) {
      const a = probe(li, (hi - 1 + PH) % PH);
      const b = probe(li, hi);
      const c = probe(li, (hi + 1) % PH);
      mx = Math.max(mx, Math.abs(a - 2 * b + c));
    }
    impH[hi] = mx;
  }
  return {
    lbp: placeBreakpoints(impL, lMax, ADAPTIVE_L, false),
    hbp: placeBreakpoints(impH, 360, ADAPTIVE_H, true),
  };
}

// Evenly-spaced positions for a uniform axis (endpoint included; hue wraps so no
// node at 360).
function uniformAxis(axisMax: number, count: number, wrap: boolean): Float64Array {
  const out = new Float64Array(count);
  const denom = wrap ? count : count - 1;
  for (let i = 0; i < count; i++) out[i] = (i / denom) * axisMax;
  return out;
}

function encodeU16(values: Float64Array, scale: number): string {
  const bytes = new Uint8Array(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    const v = Math.round((values[i]! / scale) * 65535);
    bytes[2 * i] = v & 0xff;
    bytes[2 * i + 1] = (v >> 8) & 0xff;
  }
  return Buffer.from(bytes).toString('base64');
}

interface Sampled {
  b64: string;
  cmax: number;
  lSteps: number;
  hSteps: number;
  lbpB64?: string; // omitted for uniform LUTs
  hbpB64?: string;
}

function sample(family: Family, gamut: Gamut): Sampled {
  const { lMax, adaptive } = CFG[family];
  const lbp = adaptive ? breakpoints(family, gamut).lbp : uniformAxis(lMax, UNIFORM_L, false);
  const hbp = adaptive ? breakpoints(family, gamut).hbp : uniformAxis(360, UNIFORM_H, true);
  const lSteps = lbp.length;
  const hSteps = hbp.length;
  const raw = new Float64Array(lSteps * hSteps);
  let cmax = 0;
  for (let li = 0; li < lSteps; li++) {
    const edge = li === 0 || li === lSteps - 1; // L=0 and L=lMax have no chroma
    for (let hi = 0; hi < hSteps; hi++) {
      const c = edge ? 0 : boundary(family, gamut, lbp[li]!, hbp[hi]!);
      raw[li * hSteps + hi] = c;
      if (c > cmax) cmax = c;
    }
  }
  const bytes = new Uint8Array(raw.length * 2);
  for (let i = 0; i < raw.length; i++) {
    const v = Math.round((raw[i]! / cmax) * 65535);
    bytes[2 * i] = v & 0xff;
    bytes[2 * i + 1] = (v >> 8) & 0xff;
  }
  return {
    b64: Buffer.from(bytes).toString('base64'),
    cmax,
    lSteps,
    hSteps,
    lbpB64: adaptive ? encodeU16(lbp, lMax) : undefined,
    hbpB64: adaptive ? encodeU16(hbp, 360) : undefined,
  };
}

const NAMES: Record<Family, Record<Gamut, string>> = {
  ok: { srgb: 'oklchSrgb', 'display-p3': 'oklchP3' },
  cie: { srgb: 'lchSrgb', 'display-p3': 'lchP3' },
};
const FILES: Record<Family, Record<Gamut, string>> = {
  ok: { srgb: 'oklch-srgb.ts', 'display-p3': 'oklch-display-p3.ts' },
  cie: { srgb: 'lch-srgb.ts', 'display-p3': 'lch-display-p3.ts' },
};

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'luts');
mkdirSync(outDir, { recursive: true });

for (const family of ['ok', 'cie'] as Family[]) {
  for (const gamut of ['srgb', 'display-p3'] as Gamut[]) {
    const { b64, lbpB64, hbpB64, cmax, lSteps, hSteps } = sample(family, gamut);
    const name = NAMES[family][gamut];
    const mode = CFG[family].mode;
    const bp = lbpB64 ? `,\n  '${lbpB64}',\n  '${hbpB64}',` : '';
    // /*#__PURE__*/ lets bundlers drop any LUT the consumer doesn't import.
    const src =
      `// Generated by scripts/build-luts.ts — do not edit.\n` +
      `import { decodeLut } from './decode';\n\n` +
      `export const ${name} = /*#__PURE__*/ decodeLut(\n` +
      `  '${mode}',\n  '${b64}',\n  ${cmax},\n  ${lSteps},\n  ${hSteps}${bp}\n);\n`;
    writeFileSync(join(outDir, FILES[family][gamut]), src);
    const kind = lbpB64 ? 'adaptive' : 'uniform';
    console.log(`wrote ${FILES[family][gamut]} (cmax=${cmax.toFixed(4)}, ${lSteps}×${hSteps} ${kind})`);
  }
}
