# nutelch

Chroma relative to the gamut **shell** (the cusp) in OKLCH / LCH / LCHuv — plus HCT as an opt-in add-on.
A *nut* is a "Schalenfrucht" — it has a hull; so does a perceptual color space.
nutelch lets you say "halfway to the boundary" (`relC: 0.5`) at any lightness and hue.

Dependency-free at runtime: gamut boundaries are precomputed into compact LUTs
(culori is a build-time dependency only) and looked up with bilinear interpolation.
The OKLCH and HCT LUTs are **adaptive** — their grid lines bunch around the cusps, where the
boundary bends, and thin out where it's near-linear — so they track the shell ~3×
more accurately than a uniform grid while staying *smaller*. See
[Adaptive LUTs](#adaptive-luts-why-the-grid-is-non-uniform).

## Where it sits: between OKLCH and OkHSL

nutelch borrows **one** idea from OkHSL — chroma measured as a fraction of the
per-lightness gamut shell — and keeps **everything else** from OKLCH:

|                  | OKLCH                | **nutelch**                               | OkHSL                              |
| ---------------- | -------------------- | ----------------------------------------- | ---------------------------------- |
| **Chroma**       | absolute `C` (gamut-blind) | **`relC` × cusp — boundary-relative, _linear_** | `s` — boundary-relative, _curved_ (C₀/C_mid/C_max) |
| **Lightness**    | raw OKLab `L`        | **raw OKLab `L`**                          | toe-remapped                       |
| **Hue**          | raw `H`              | **raw `H`**                               | raw `H`                            |
| **Output**       | CSS `oklch()`        | **CSS `oklch()`**                         | needs conversion                   |
| **Gamuts**       | gamut-agnostic       | **sRGB + Display-P3** (OKLCH, LCH, LCHuv & HCT LUTs) | sRGB only               |
| **Speed**        | instant (gamut-blind) | **fast (LUT lookup)**                    | slowest (runtime gamut math)       |
| **Out of gamut** | allowed              | **allowed (overshoot)**                   | clamped to `[0, 1]`                |

So nutelch is **OKLCH with exactly one OkHSL property grafted on**: "saturation"
that means the same thing at every L and H, and never *accidentally* lands out of
gamut — without OkHSL's other opinions (the lightness toe, the nonlinear
saturation curve, the picker geometry).

Two consequences:

1. **It's OKLCH-native.** A nutelch result _is_ an `oklch(l c h)` color — hand it
   straight to CSS. OkHSL is its own space you must convert out of.
2. **It's the linear midpoint, and you can slide either way.** Default `relC` is
   linear; add an [`ease`](#curves--easing) to move toward OkHSL's curved feel,
   or use [`cusp()`](#api) with absolute chroma to fall back to plain OKLCH.

## Install

```bash
npm install nutelch
```

Two entry points, both tree-shakeable and dependency-free:

| import                | what                                                    |
| --------------------- | ------------------------------------------------------- |
| `nutelch`             | the core: OKLCH, CIE LCH and LCHuv LUTs + all functions |
| `nutelch/hct`         | the HCT add-on (CAM16 conversion), see [HCT](#hct)       |

Each ships as ESM and CommonJS (`import` / `require`) with TypeScript types for both, so
it resolves under every `moduleResolution` (`bundler`, `node16`/`nodenext` from ESM *or*
CJS, and legacy `node10`). The core is also available as a UMD bundle
(`dist/nutelch.umd.cjs`, global `nutelch`) for script tags.

## Usage

```js
import { cusp, relch, peak, reach, toCss, toLab, oklchSrgb, lchP3, lchuvSrgb } from 'nutelch';

// You pass the gamut LUT you want; it carries the space (mode) + lightness range.
// Import only the ones you use — the rest are tree-shaken away.

// Max in-gamut chroma at L=0.6, H=30 in OKLCH/sRGB — the shell point:
cusp({ lut: oklchSrgb, l: 0.6, h: 30 });
// → { mode: 'oklch', l: 0.6, c: 0.12…, h: 30 }

// Chroma as a fraction of the way to the shell:
relch({ lut: oklchSrgb, l: 0.6, relC: 0.5, h: 30 });
// → { mode: 'oklch', l: 0.6, c: 0.06…, h: 30 }

// Every call returns a plain { mode, l, c, h }. Turn it into CSS with toCss:
toCss(relch({ lut: oklchSrgb, l: 0.6, relC: 0.5, h: 30 }));
// → "oklch(0.6 0.06 30)"  (half the max chroma)

// A different space + gamut is just a different LUT. LCH (CIE) uses L on 0..100:
relch({ lut: lchP3, l: 60, relC: 1, h: 30 });
// → { mode: 'lch', l: 60, c: …, h: 30 }

// LCHuv (polar CIELUV) too; toCss emits it as the equivalent lch():
toCss(relch({ lut: lchuvSrgb, l: 60, relC: 0.5, h: 30 }));
// → "lch(60% … …)"

// HCT (Material) is a separate entry point, 'nutelch/hct' — see #hct.

// The cusp — the most chromatic color of a hue (peak of the shell over all L):
peak({ lut: oklchSrgb, h: 30 });
// → { mode: 'oklch', l: 0.65…, c: 0.18…, h: 30 }  (its own lightness)

// reach: the OkHSV-flavored complement to relch. relC holds L and scales chroma
// to the shell at that L; reach slides L and C together along the ray from a gray
// anchor toward the cusp — a perceptual "shade line". `l` is the gray at reach 0:
reach({ lut: oklchSrgb, l: 0.3, reach: 1, h: 30 });   // === peak (the cusp)
reach({ lut: oklchSrgb, l: 0.3, reach: 0.5, h: 30 }); // halfway from gray L=0.3 to the cusp

// Need rectangular a/b (for oklab()/lab() output)? Convert the result:
toLab(relch({ lut: oklchSrgb, l: 0.6, relC: 1, h: 30 }));
// → { l: 0.6, a: …, b: … }
```

### API

- `cusp({ lut, l, h })` → the color on the shell at `(l, h)`. `.c` is the raw max in-gamut
  chroma **at that lightness**.
- `relch({ lut, l, relC, h })` → resolves `relC` (0..1 of the way to the shell; overshoot
  allowed) to an absolute color. Holds `l`, scales chroma.
- `peak({ lut, h })` → the **cusp**: the most chromatic color of the hue (the peak of the
  shell over *all* lightness). Carries its own `.l`. Distinct from `cusp()`, which is the
  max at one given `l`.
- `reach({ lut, l, reach, h })` → saturation along the ray from the achromatic anchor at
  `l` to the cusp. `reach` 0 = that gray, 1 = the cusp (overshoot allowed). Moves `l` and
  `c` together — the complement to `relch`.
- `toCss(color)` → a CSS string in the color's own space (`oklch(l c h)` / `lch(l% c h)`),
  float noise trimmed. Pass it the object `cusp`/`relch`/`peak`/`reach` return. CSS has no
  LUV syntax, so an `lchuv` color is converted exactly to the equivalent `lch(…)` (both are
  D50 and share L\*). For HCT colors use the `toCss` from `nutelch/hct`; the core one
  throws on them.
- `toLab({ l, c, h })` → `{ l, a, b }` — rectangular conversion for `oklab()`/`lab()` output.
- `toe(x)` / `toeInv(x)` → Ottosson's lightness toe and its inverse (the OkHSL `Lr`
  remap), both mapping `[0,1]→[0,1]`. Opt-in utilities — feed `toeInv` to a lightness
  input to align nutelch's lightness with OkHSL's. See [Curves / easing](#curves--easing).
- `smoothstep(x)` → the classic Hermite ease-in-out, clamped to `[0,1]`. The one
  general-purpose curve the lib ships; apply your own for anything else.

The returned `mode` and the lightness range come from the LUT you pass. The available
LUTs are named `<space><Gamut>`. `l`, `c` and `h` always mean *that space's* lightness,
chroma and hue — which, for HCT, makes `l` the **tone**:

| LUT          | space   | gamut        | `l` is…                  | `l` range | `c`, `h` are…     |
| ------------ | ------- | ------------ | ------------------------ | --------- | ----------------- |
| `oklchSrgb`  | `oklch` | `srgb`       | OKLab lightness          | 0..1      | OKLCH C, H        |
| `oklchP3`    | `oklch` | `display-p3` | OKLab lightness          | 0..1      | OKLCH C, H        |
| `lchSrgb`    | `lch`   | `srgb`       | CIE L\*                  | 0..100    | CIE LCH C, H      |
| `lchP3`      | `lch`   | `display-p3` | CIE L\*                  | 0..100    | CIE LCH C, H      |
| `lchuvSrgb`  | `lchuv` | `srgb`       | CIE L\*                  | 0..100    | CIELUV C, H (D50) |
| `lchuvP3`    | `lchuv` | `display-p3` | CIE L\*                  | 0..100    | CIELUV C, H (D50) |
| `hctSrgb`¹   | `hct`   | `srgb`       | **tone** (= CIE L\*)     | 0..100    | CAM16 chroma, hue |
| `hctP3`¹     | `hct`   | `display-p3` | **tone** (= CIE L\*)     | 0..100    | CAM16 chroma, hue |

¹ from `nutelch/hct`, see [HCT](#hct).

Import only the LUTs you need (each is tree-shakeable; the package is side-effect-free).
Input is always cylindrical (`l`, `h`, `relC`); `H` is `0..360` and wraps.

### LCHuv

LCHuv is the polar form of CIELUV — the space Wijffelaars et al. use in
[*Generating Color Palettes using Intuitive Parameters*](https://doi.org/10.1111/j.1467-8659.2008.01203.x)
(Computer Graphics Forum 27(3), EuroVis 2008), where the most saturated color of each hue anchors the palette curve.
nutelch's LCHuv uses a **D50** white, matching culori (which builds the LUTs) and CSS
`lch()` — that's what makes the `toCss` conversion exact. HSLuv and many screen-oriented
LUV implementations use **D65** instead, so their chroma/hue values differ slightly.

It is the most accurate family nutelch ships: mean boundary error ~0.03% of `cmax`,
worst overshoot 0.8% (sRGB) / 0.6% (P3). Like CIE LCH it uses a uniform grid; an adaptive
one halved the undershoot but doubled the overshoot, the harmful direction.

### HCT

[HCT](https://material.io/blog/science-of-color-design) is Material Design's color space:
**hue and chroma are CAM16's**, **tone is CIE L\***. Because tone depends on luminance
alone, a tone gap maps to a WCAG contrast ratio, whatever the hue. The HCT LUTs let you
ask "80% of the chroma available at this tone and hue" without Material's iterative solver.

HCT lives in its own entry point, **`nutelch/hct`**, so its CAM16 conversion never lands
in an OKLCH/LCH bundle. It exports HCT-aware `cusp`, `relch`, `reach`, `peak` and `toCss`,
the `hctSrgb` / `hctP3` LUTs, and `hctToRgb` / `rgbToHct`:

- `cusp` / `relch` / `reach` → same as the core, but lightness may be given as `t` (tone)
  *or* `l` — one, not both.
- `toCss(color)` → CSS has no HCT syntax, so an `hct` color is converted exactly (no gamut
  clipping) and emitted as `oklch(…)`; `oklch`/`lch` colors format as in the core.
- `hctToRgb(color, gamut = 'srgb')` → takes `{ h, c, t }` or `{ h, c, l }` (e.g. a returned
  `Color`) and gives `{ r, g, b }`, gamma-encoded `0..1` in `'srgb'` or `'display-p3'`. Not
  clipped: a channel outside `0..1` means out of gamut; `NaN` means that hue/chroma cannot
  exist at that tone at all.
- `rgbToHct({ r, g, b }, gamut = 'srgb')` → the inverse: gamma-encoded `0..1` RGB in `'srgb'` or
  `'display-p3'` to an HCT `Color` (`{ mode: 'hct', h, c, l }`, tone in `l`). Closed form, no
  solve; it matches Material's `Hct.fromInt` for sRGB and round-trips with `hctToRgb`.

**In HCT, lightness is tone** (Material's `T`, `0..100`). Pass it as `t` — or as `l`,
nutelch's usual name; they're interchangeable inputs. Where Material writes
`Hct.from(hue, chroma, tone)`, nutelch takes `{ h: hue, c: chroma, t: tone }`. Returned
colors keep one shape for every space, so an HCT `Color` carries its tone in **`.l`**.
Note the tone is CIE L\*, *not* CAM16's own lightness `J`.

```js
import { relch, toCss, hctToRgb, rgbToHct, hctSrgb } from 'nutelch/hct';

const color = relch({ lut: hctSrgb, t: 40, relC: 0.8, h: 280 }); // tone 40
color.l;         // → 40 (tone, returned as l)
toCss(color);    // → "oklch(…)" (the same color, in a space CSS understands)
hctToRgb(color); // → { r, g, b } in sRGB, 0..1
hctToRgb({ h: 280, c: 30, t: 40 }); // also takes a hand-written HCT color
rgbToHct({ r: 0.2, g: 0.4, b: 0.8 }); // → { mode: 'hct', h, c, l } — from any RGB color
```

CAM16 depends on viewing conditions, so an HCT LUT is only exact for one set. nutelch uses
Material's defaults (D65, adapting luminance ≈ 11.7 cd/m², background L\* 50, average
surround), so values agree with `@material/material-color-utilities`. The conversion is
nutelch's own (`src/hct/convert.ts`, sources cited there) and is tested against Material.

Accuracy vs the true HCT boundary (`npm run eval:luts`, fractions of `cmax`): mean error
~0.2%; the worst over/undershoot (~14% sRGB, ~8% P3) sits at the yellow-white tip near
tone 99 — the same near-singular corner as CIE LCH, since tone *is* L\*. A uniform grid was
measured too and overshot more (~20%), so HCT uses the adaptive grid like OKLCH.

### `reach`: saturating toward the cusp

`reach` is the geometric complement to `relch`. Picture the hue's constant-hue slice
with two points:

- **A** — your current color's `(L, C)`
- **B** — the **cusp** (`peak`), the hue's most chromatic color

Take the direction `normalize(B − A)` and slide along it: toward **B** is more
saturated, away from it less, until the ray hits the achromatic axis (`C = 0`) at a
gray. That 1-D move *is* `reach` — `reach: 1` is the cusp, `reach: 0` is the gray the
ray lands on. The API names that gray directly (`l`), since two endpoints fix the ray:

```js
reach({ lut: oklchSrgb, l: 0.3, reach: 0.8, h: 142 }); // 80% from gray L=0.3 toward the cusp
```

This is close to how **OkHSL** saturates — but without OkHSL's rectangle-squashing of
the gamut and without its `Lr` lightness prediction (the toe). Same "more/less
saturated along a perceptual line" feel, expressed natively in `oklch()`.

The cost of *not* squashing: the path is a straight line, and constant-hue slices
aren't perfectly convex, so a ray can bulge slightly out of gamut between the gray and
the cusp (worst case measured ≈ `0.024` chroma, for a near-white anchor). **`reach ≤ 1`
is not a gamut guarantee** — if you need one, check `cusp()` at the result's `L`.

> Because it's just "move along a direction," you can swap the straight line for a
> *curve* — bending the path to hug the shell, or to mimic OkHSL's motion more
> closely. Same entry point, richer trajectories.

### Curves / easing

nutelch's response is **linear** by design. Easing is just a 1-D remap of an input, so
apply your own (or any easing library) to whatever axis you want, before the call:

```js
import { relch, smoothstep, oklchSrgb } from 'nutelch';

// curve the saturation response:
relch({ lut: oklchSrgb, l: 0.7, relC: smoothstep(0.5), h: 30 });
// curve lightness (e.g. toward an HSL-like ramp):
relch({ lut: oklchSrgb, l: smoothstep(0.7), relC: 1, h: 30 });
```

A well-behaved ease maps `0→0` and `1→1`, so `relC: 1` still lands exactly on the shell.
The lib ships exactly one general curve — [`smoothstep`](#api) — because it's the one
everyone reaches for; bring your own for anything else.

#### Why `toeInv`?

OKLab's `L` is **not perceptually even for picking lightness** — equal steps in `L` don't
read as equal steps in perceived lightness, especially in the darks. Ottosson's OkHSL
fixes this with a *reference lightness* `Lr`: it remaps `L` through the **`toe`** function
so `Lr` tracks perceived lightness (and CIE `L*`) more closely, then uses `Lr` as its
lightness axis. nutelch deliberately keeps the **raw OKLab `L`** (so a nutelch color is a
plain `oklch()` color).

So when you want OkHSL-style, perceptually-even lightness, **dial your `0..1` value as
`Lr` and pass it through `toeInv` (`Lr → L`)** before `relch`. A linear ramp of your input
then reads as an even lightness ramp — and matches OkHSL exactly:

```js
import { relch, toe, toeInv, oklchSrgb } from 'nutelch';

relch({ lut: oklchSrgb, l: toeInv(0.7), relC: 1, h: 30 }); // OkHSL-aligned lightness
toe(0.5); // → 0.42…  the inverse direction (L → Lr), e.g. to label a color's lightness
```

## Adaptive LUTs: why the grid is non-uniform

The gamut shell isn't equally complex everywhere. A constant-hue slice rises to a
sharp **cusp** then falls to white; as a function of hue the max chroma spikes near
the primaries. A *uniform* grid spends the same number of samples on the flat
regions as on these corners, so bilinear interpolation **overshoots across a sharp
cusp** — claiming more chroma than the gamut actually holds. That's a real bug: at
OKLCH/sRGB blue (`L≈0.45, H≈264`) a uniform 65×256 grid reported `C≈0.288` when the
true boundary is `≈0.261`.

An **adaptive** LUT fixes this by placing its grid lines where the boundary bends —
dense around the cusps, sparse where it's near-linear — found by sampling the
boundary's curvature at build time. It's the *same* kind of table (precomputed
chroma + bilinear); only the sample positions change, plus a small breakpoint array
and a binary search to find the cell.

We measured the candidates against culori ground truth (`npm run eval:luts`;
experiments in `scripts/adaptive-explore.ts` / `final-compare.ts`). Figures are for
**oklch/sRGB**, *practical* worst-case error as a fraction of `cmax`:

| representation                 | worst overshoot | worst undershoot |   size | lookup speed |
| ------------------------------ | --------------: | ---------------: | -----: | -----------: |
| uniform 65×256 (old)           |           ~8.5% |          ~−10.7% |  33 KB |        1.00× |
| cusp-triangle (Ottosson)       |           ~9.7% |             safe |   2 KB |  0.16× (6× faster) |
| uniform 129×1024               |           ~1.8% |           ~−5.9% | 264 KB |        1.00× |
| **adaptive 49×192 (chosen)**   |       **~2.9%** |       **~−2.4%** | **19 KB** | **~1.1×** |

**Why adaptive non-uniform won (for OKLCH):** it cuts the *dangerous* overshoot ~3×
**and** shrinks the LUT (19 KB vs 33 KB), where matching that accuracy with a uniform
grid would need ~8× the bytes. The only cost is ~10% slower lookups (a binary search
over breakpoints instead of a direct index). The cusp-triangle is far smaller/faster
but its straight edges can't follow the curved gamut (rms ~1.8%), and a higher-res
uniform grid never fixes the overshoot at a useful size.

**HCT is adaptive too:** it behaves like OKLCH here — a uniform 65×256 grid had a
lower mean error but a worse worst-case overshoot (19.6% vs 13.6% on sRGB) at ~1.8×
the size. See [HCT](#hct).

**LCHuv is uniform too:** adaptive 49×192 cut its worst undershoot to −2.6% (from −8.7%)
but doubled the overshoot to 1.6% (from 0.8%); overshoot is what matters. See [LCHuv](#lchuv).

**Why CIE LCH stays uniform:** LCH's gamut is broadly curved *everywhere*, so a sparse
adaptive grid starves the smooth bulk (rms blows up ~5×). A uniform grid is the better
fit there; its only large errors are at the near-singular yellow-white cusp.

**One honest caveat:** the sRGB gamut is slightly *non-convex* at the blue corner, so
the true "first-exit" max chroma is near-discontinuous over a `<0.02°` hue band — a
spike no finite linear LUT (or OkHSL) can resolve. nutelch leaves that as a tiny
*undershoot*, which is the safe, always-in-gamut direction. Practical worst-case
boundary error for the OKLCH LUTs is `±0.009` (the demo measures this live).

## Development

```bash
npm install
npm run build:luts   # regenerate all LUTs (adaptive OKLCH + HCT, uniform LCH + LCHuv)
npm run build:luts -- hct   # only some families: ok, cie, luv, hct (HCT alone takes ~9 min)
npm run eval:luts    # accuracy report: LUT vs ground-truth boundary, per LUT
npm test
npm run dev          # interactive cusp explorer: oklch / lch / lchuv / hct (compares vs OkHSL)
npm run build:lib    # publishable dist/ (see below)
```

`build:lib` runs three steps:

1. `vite.lib.config.ts` builds both entries (`nutelch`, `nutelch/hct`) as ESM + CJS, with
   shared code in a common chunk, and rolls each entry's types into one `.d.ts`.
2. `vite.lib.umd.config.ts` adds the core's UMD bundle (Vite's UMD output is single-entry).
3. `scripts/dual-types.ts` copies each `.d.ts` to a `.d.cts`: the package is
   `"type": "module"`, so CJS consumers need `.d.cts` types, which the `require`
   conditions in `exports` point at. `npx @arethetypeswrong/cli --pack .` verifies it.

Ground truth for the build, the report and the tests lives in `src/eval/ground-truth.ts`
(culori for OKLCH / LCH / LCHuv; `src/hct/convert.ts` for HCT). The build imports no LUT
file, so a new family builds from scratch; add it to `src/eval/lut-cases.ts` and the
accuracy ratchet in `src/interp.accuracy.test.ts` to have it measured and guarded.

## Acknowledgements

The core idea — measuring chroma relative to the gamut cusp — and much of the guidance
shaping this library are thanks to [Matt DesLauriers](https://github.com/mattdesl).

The HCT conversion follows Google's
[material-color-utilities](https://github.com/material-foundation/material-color-utilities)
(Apache-2.0) and the CAM16 paper (Li et al., *Color Res. Appl.* 42(6), 2017,
[doi:10.1002/col.22131](https://doi.org/10.1002/col.22131)); full citations are in `src/hct/convert.ts`.

## License

[MIT](./LICENSE) © David Aerne
