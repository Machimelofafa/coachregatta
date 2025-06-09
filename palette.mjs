export const palette = [
  '#b12060',
  '#a63b19',
  '#735c00',
  '#1a6d0b',
  '#00735d',
  '#0072a3',
  '#0065c1',
  '#7e44a4'
];

export function getColor(idx) {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root) {
      const val = getComputedStyle(root).getPropertyValue(`--palette-${idx % palette.length}`).trim();
      if (val) return val;
    }
  }
  return palette[idx % palette.length];
}
