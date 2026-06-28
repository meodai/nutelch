# nutelch

Chroma relative to the gamut **shell** (the cusp) in OKLCH / LCH.
A *nut* is a "Schalenfrucht" — it has a hull; so does a perceptual color space.
nutelch lets you say "halfway to the boundary" (`relC: 0.5`) at any lightness and hue.

Dependency-free at runtime: gamut boundaries are precomputed into compact LUTs
(culori is a build-time dependency only) and looked up with bilinear interpolation.

## Where it sits: between OKLCH and OkHSL

nutelch borrows **one** idea from OkHSL — chroma measured as a fraction of the
per-lightness gamut shell — and keeps **everything else** from OKLCH:

|                  | OKLCH                | **nutelch**                               | OkHSL                              |
| ---------------- | -------------------- | ----------------------------------------- | ---------------------------------- |
| **Chroma**       | absolute `C` (gamut-blind) | **`relC` × cusp — boundary-relative, _linear_** | `s` — boundary-relative, _curved_ (C₀/C_mid/C_max) |
| **Lightness**    | raw OKLab `L`        | **raw OKLab `L`**                          | toe-remapped                       |
| **Hue**          | raw `H`              | **raw `H`**                               | raw `H`                            |
| **Output**       | CSS `oklch()`        | **CSS `oklch()`**                         | needs conversion                   |
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

## Usage

```js
import { cusp, relch, toLab, oklchSrgb, lchP3 } from 'nutelch';

// You pass the gamut LUT you want; it carries the space (mode) + lightness range.
// Import only the ones you use — the rest are tree-shaken away.

// Max in-gamut chroma at L=0.6, H=30 in OKLCH/sRGB — the shell point:
cusp({ lut: oklchSrgb, l: 0.6, h: 30 });
// → { mode: 'oklch', l: 0.6, c: 0.12…, h: 30 }

// Chroma as a fraction of the way to the shell:
relch({ lut: oklchSrgb, l: 0.6, relC: 0.5, h: 30 });
// → { mode: 'oklch', l: 0.6, c: 0.06…, h: 30 }  (half the max chroma)

// A different space + gamut is just a different LUT. LCH (CIE) uses L on 0..100:
relch({ lut: lchP3, l: 60, relC: 1, h: 30 });
// → { mode: 'lch', l: 60, c: …, h: 30 }

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
- `toLab({ l, c, h })` → `{ l, a, b }` — rectangular conversion for `oklab()`/`lab()` output.

The returned `mode` and the lightness range come from the LUT you pass. The available
LUTs are named `<space><Gamut>`:

| LUT          | space   | gamut        | L range |
| ------------ | ------- | ------------ | ------- |
| `oklchSrgb`  | `oklch` | `srgb`       | 0..1    |
| `oklchP3`    | `oklch` | `display-p3` | 0..1    |
| `lchSrgb`    | `lch`   | `srgb`       | 0..100  |
| `lchP3`      | `lch`   | `display-p3` | 0..100  |

Import only the LUTs you need (each is tree-shakeable; the package is side-effect-free).
Input is always cylindrical (`l`, `h`, `relC`); `H` is `0..360` and wraps.

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

nutelch's response is **linear** and ships **no easing functions** — that's deliberate.
Easing is a 1-D remap of an input, so apply your own (or any easing library) to whatever
axis you want, before the call:

```js
import { relch, oklchSrgb } from 'nutelch';
const easeIn = (x) => x * x;

// curve the saturation response:
relch({ lut: oklchSrgb, l: 0.7, relC: easeIn(0.5), h: 30 });
// curve lightness (e.g. toward an HSL-like ramp):
relch({ lut: oklchSrgb, l: easeIn(0.7), relC: 1, h: 30 });
```

A well-behaved ease maps `0→0` and `1→1`, so `relC: 1` still lands exactly on the shell.

## Development

```bash
npm install
npm run build:luts   # regenerate LUTs from culori
npm test
npm run dev          # interactive cusp explorer (compares LUT vs actual vs OkHSL)
npm run build:lib    # publishable dist/
```
