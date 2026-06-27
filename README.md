# nutColor

Chroma relative to the gamut **shell** (the cusp) in OKLCH / OKLab / LCH / Lab.
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
import { cusp, relch } from 'nutcolor';

// Max in-gamut chroma at L=0.6, H=30 (OKLCH, sRGB) — the shell point:
cusp({ l: 0.6, h: 30 });
// → { mode: 'oklch', l: 0.6, c: 0.12…, h: 30 }

// Chroma as a fraction of the way to the shell:
relch({ l: 0.6, relC: 0.5, h: 30 });
// → { mode: 'oklch', l: 0.6, c: 0.06…, h: 30 }  (half the max chroma)

// Other modes/gamuts; *lab returns rectangular coords:
relch({ mode: 'oklab', l: 0.6, relC: 1, h: 30, gamut: 'display-p3' });
// → { mode: 'oklab', l: 0.6, a: …, b: … }
relch({ mode: 'lch', l: 60, relC: 1, h: 30 }); // CIE L on 0..100
```

### API

- `cusp({ mode?, l, h, gamut? })` → the color on the shell at `(l, h)`. `.c` is the raw
  max in-gamut chroma. `*lab` modes return `{l,a,b}`.
- `relch({ mode?, l, relC, h, gamut? })` → resolves `relC` (0..1 of the way to the shell;
  overshoot allowed) to an absolute color.

Defaults: `mode: 'oklch'`, `gamut: 'srgb'`. Modes: `oklch`, `oklab`, `lch`, `lab`.
Gamuts: `srgb`, `display-p3`. Input is always cylindrical (`l`, `h`, `relC`).

## Development

```bash
npm install
npm run build:luts   # regenerate LUTs from culori
npm test
npm run dev          # interactive cusp explorer
npm run build:lib    # publishable dist/
```
