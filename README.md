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
import { cusp, relch, toLab } from 'nutelch';

// Max in-gamut chroma at L=0.6, H=30 (OKLCH, sRGB) — the shell point:
cusp({ l: 0.6, h: 30 });
// → { mode: 'oklch', l: 0.6, c: 0.12…, h: 30 }

// Chroma as a fraction of the way to the shell:
relch({ l: 0.6, relC: 0.5, h: 30 });
// → { mode: 'oklch', l: 0.6, c: 0.06…, h: 30 }  (half the max chroma)

// LCH (CIE) — L on 0..100; display-p3 gamut:
relch({ mode: 'lch', l: 60, relC: 1, h: 30, gamut: 'display-p3' });
// → { mode: 'lch', l: 60, c: …, h: 30 }

// Need rectangular a/b (for oklab()/lab() output)? Convert the result:
toLab(relch({ l: 0.6, relC: 1, h: 30 }));
// → { l: 0.6, a: …, b: … }
```

### API

- `cusp({ mode?, l, h, gamut? })` → the color on the shell at `(l, h)`. `.c` is the raw
  max in-gamut chroma.
- `relch({ mode?, l, relC, h, gamut? })` → resolves `relC` (0..1 of the way to the shell;
  overshoot allowed) to an absolute color.
- `toLab({ l, c, h })` → `{ l, a, b }` — rectangular conversion for `oklab()`/`lab()` output.

Defaults: `mode: 'oklch'`, `gamut: 'srgb'`. Modes: `oklch`, `lch` (the two cusp-native
cylindrical CSS spaces). Gamuts: `srgb`, `display-p3`. Input is always cylindrical
(`l`, `h`, `relC`).

### Curves / easing

nutelch's response is **linear** and ships **no easing functions** — that's deliberate.
Easing is a 1-D remap of an input, so apply your own (or any easing library) to whatever
axis you want, before the call:

```js
import { relch } from 'nutelch';
const easeIn = (x) => x * x;

// curve the saturation response:
relch({ l: 0.7, relC: easeIn(0.5), h: 30 });
// curve lightness (e.g. toward an HSL-like ramp):
relch({ l: easeIn(0.7), relC: 1, h: 30 });
```

A well-behaved ease maps `0→0` and `1→1`, so `relC: 1` still lands exactly on the shell.

## Development

```bash
npm install
npm run build:luts   # regenerate LUTs from culori
npm test
npm run dev          # interactive cusp explorer (compares LUT vs actual vs OkHSV)
npm run build:lib    # publishable dist/
```
