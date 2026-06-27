# nutColor

Chroma relative to the gamut **shell** (the cusp) in OKLCH / LCH.
A *nut* is a "Schalenfrucht" — it has a hull; so does a perceptual color space.
nutColor lets you say "halfway to the boundary" (`relC: 0.5`) at any lightness and hue.

Dependency-free at runtime: gamut boundaries are precomputed into compact LUTs
(culori is a build-time dependency only) and looked up with bilinear interpolation.

## Install

```bash
npm install nutcolor
```

## Usage

```js
import { cusp, relch, toLab } from 'nutcolor';

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

nutColor's response is **linear** and ships **no easing functions** — that's deliberate.
Easing is a 1-D remap of an input, so apply your own (or any easing library) to whatever
axis you want, before the call:

```js
import { relch } from 'nutcolor';
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
