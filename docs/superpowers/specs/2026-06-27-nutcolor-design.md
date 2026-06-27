# nutColor — Design

## Concept

A dependency-free microlib that expresses **chroma relative to the gamut "shell"** —
the per-lightness maximum-chroma boundary — in perceptual cylindrical color spaces.

The name plays on *nut* as a "Schalenfrucht" (a hull/shell fruit): just as a nut has a
hull, a perceptual color space like OKLCH/LCH has a gamut boundary. nutColor lets you
work in chroma values that are normalized (`0–1`) relative to that shell, so `relC: 0.5`
always means "halfway to the boundary" regardless of lightness or hue.

LUTs are precomputed with [culori](https://culorijs.org/) at build time. The **shipped
runtime has zero dependencies** — it only interpolates the LUTs.

## Scope

- **Modes:** `oklch`, `oklab`, `lch`, `lab`.
  - Two boundary *families*: **OK** (`oklch`/`oklab`) and **CIE** (`lch`/`lab`).
  - Within a family the gamut shell is identical; the `*lab` variants differ only in the
    output coordinate system.
- **Gamuts:** `srgb`, `display-p3`.
- **CSS Color Module Level 4** models only.

Out of scope for v1: `hsl`/`hwb` (sRGB-only, non-perceptual "saturation"), additional
gamuts (`rec2020`, `a98-rgb`, `prophoto`), and a reverse `color → relC` decomposition.
These are possible future extensions.

## Public API

The API mirrors culori's conventions: a single **color-object-with-a-`mode`-key** goes in,
and a color object comes out. No positional arguments. `gamut` is carried inside the input
object.

```ts
type Mode  = 'oklch' | 'oklab' | 'lch' | 'lab';
type Gamut = 'srgb'  | 'display-p3';

// The color sitting on the shell at (l, h).
// `c` is the raw maximum in-gamut chroma at that lightness + hue.
cusp(input: { mode?: Mode; l: number; h: number; gamut?: Gamut })
  : { mode: Mode; l: number; c: number; h: number };   // *lab modes return { l, a, b }

// `relC` is 0–1 of the way to the shell (overshoot > 1 allowed) → absolute color.
relch(input: { mode?: Mode; l: number; relC: number; h: number; gamut?: Gamut })
  : { mode: Mode } & ({ l: number; c: number; h: number }
                    | { l: number; a: number; b: number });
```

### Semantics

- **Defaults:** `mode: 'oklch'`, `gamut: 'srgb'`.
- **Input is always cylindrical.** `l`, `h`, and (for `relch`) `relC` describe the request.
  The shell is only definable in cylindrical terms, so this is the single input convention
  for every mode.
- **`mode` selects the boundary family AND the output coordinate system:**
  - `oklch` / `lch` → returns `{ mode, l, c, h }`
  - `oklab` / `lab` → returns `{ mode, l, a, b }`, computed `a = c·cos(h°)`, `b = c·sin(h°)`
  - Example: `cusp({ mode: 'oklab', l, h })` returns the shell point expressed in OKLab.
- **`relC` normalization is per-lightness** (boundary at the given L), not the absolute hue
  cusp: `relC: 1` maps to `cusp(...).c` at that exact `l` and `h`.
- **Overshoot allowed.** `relC > 1` returns chroma beyond the boundary (possibly out of
  gamut); the caller decides whether to clamp. `relch` is therefore linear in `relC`.
- **`cusp` returns a color object** (its `.c` is the "raw max chroma"). Reading the scalar
  is `cusp(...).c`.
- **Native ranges per family:** OK family L ∈ [0, 1]; CIE family L ∈ [0, 100]; H ∈ [0, 360)
  for both. Out-of-range `l` is clamped; `h` wraps modulo 360.

## Architecture

```
src/
  index.ts          Public API: cusp(), relch(). Thin.
  registry.ts       mode+gamut → { lut, family, lRange, cmax }. Resolves modes to families.
  interp.ts         Bilinear LUT lookup: hue wrap-around + lightness clamp → max chroma.
  coords.ts         Cylindrical ↔ rectangular (cos/sin) for *lab output. No full conversion.
  luts/
    ok.srgb.ts      Generated. Uint16Array grid + cmax scale.
    ok.display-p3.ts
    cie.srgb.ts
    cie.display-p3.ts
scripts/
  build-luts.ts     Uses culori (devDep) to generate the luts/*.ts modules.
demo/
  index.html
  main.ts           Vite interactive cusp explorer.
test/
  *.test.ts         Vitest.
```

### Module responsibilities

- **`index.ts`** — validates/normalizes input, dispatches to `registry` + `interp`, and
  formats the output via `coords`. Holds no color math beyond orchestration.
- **`registry.ts`** — single source of truth mapping each `mode` to its family LUT, its
  lightness range, and the LUT's chroma scale. Adding a gamut or family touches only here
  plus a generated LUT module.
- **`interp.ts`** — pure function: given a family LUT + `(l, h)`, returns the interpolated
  max chroma. Bilinear over the L×H grid, hue wraps across the 360°/0° seam, lightness
  clamps to the grid edges. Independently testable against culori ground truth.
- **`coords.ts`** — `{l,c,h} → {l,a,b}` and the trivial inverse. cos/sin only.
- **`luts/*.ts`** — generated data only; no logic. Tree-shakeable per family+gamut so an
  app importing only OK+sRGB pulls a single LUT.

### Data flow

```
relch(input)
  → registry: resolve mode → family, gamut → LUT, ranges, cmax
  → interp: bilinear lookup max chroma at (l, h)   ── cusp's core
  → c = relC * maxChroma                            (relch only)
  → coords: cylindrical → output coords per mode
  → { mode, ... }
```

`cusp` is the same pipeline minus the `relC` multiply and returns the boundary color.

## LUT format

- **Grid:** 65 × 256 — 65 lightness steps × 256 hue steps over `[0, 360)`.
  One `Uint16Array` of `65 * 256 = 16 640` values per family+gamut.
- **Encoding:** each cell stores `round(c / cmax * 65535)`; decode `c = v / 65535 * cmax`,
  where `cmax` is the LUT's per-family max chroma (e.g. ~0.4 for OK, ~150 for CIE).
- **Sampling (build time):** for each `(li, hi)`, binary-search the largest chroma whose
  color is `inGamut(gamut)` per culori, to a fixed tolerance. Lightness sample =
  `li/64 * Lmax`; hue sample = `hi/256 * 360`.
- **Size:** ~33 KB raw per LUT. The data is smooth, so it gzips to single-digit KB.
  Tree-shaking means consumers pay only for the families/gamuts they import.

## Demo

A Vite single-page **interactive cusp explorer**:

- Sliders for `L`, `relC`, `H`.
- Toggles for `mode` and `gamut`.
- A live swatch of the resolved color.
- A visualization of the gamut shell for the current hue: the chroma ramp and the boundary
  curve across lightness, with the current point marked.

## Tooling & packaging

- **Language:** TypeScript.
- **Build/dev:** Vite — builds the library (ESM + `.d.ts`) and serves/builds the demo.
- **Tests:** Vitest.
  - Interpolation accuracy vs culori ground truth (sampled across modes/gamuts/hues).
  - Edge cases: hue wrap at the 0/360 seam, lightness clamping at extremes, `relC` overshoot.
  - Coordinate conversion round-trips for `*lab` modes.
- **culori** is a **devDependency only** (LUT generation); the published runtime has zero
  dependencies.
- **Package name:** `nutcolor`; exported namespace `nutcolor`. Repo directory is `nutLCh`.
