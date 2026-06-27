// Importable, self-describing gamut LUTs. Import only the ones you need and
// pass them to cusp()/relch() — no registry, fully tree-shakeable.
export { oklchSrgb } from './oklch-srgb';
export { oklchP3 } from './oklch-display-p3';
export { lchSrgb } from './lch-srgb';
export { lchP3 } from './lch-display-p3';
export type { Lut, Mode } from './decode';
