// BLAQ STUDIO palette. Purple dominates; black for silhouettes; neon for light.
export const PAL = Object.freeze({
  midnight: '#10091D',
  violet: '#24113D',
  electric: '#9B5CFF',
  lavender: '#C8A7FF',
  ink: '#09090F',
  chrome: '#B9B9CB',
  pink: '#FF72C6',
  blue: '#43D9FF',
  white: '#F4EEFF',
  // derived helpers
  deepPurple: '#1B0E33',
  dusk: '#3A1A63',
  haze: '#5A2D96',
  steel: '#6C6C85',
  gunmetal: '#2A2A3C',
  warm: '#FFC857',
  red: '#FF4D6D',
  green: '#5CFFB0',
});

export const num = (css) => parseInt(css.replace('#', ''), 16);

export function rgb(css) {
  const n = num(css);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Linear blend of two css colors. t=0 -> a, t=1 -> b */
export function mix(a, b, t) {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);

export function rgba(css, a) {
  const [r, g, b] = rgb(css);
  return `rgba(${r},${g},${b},${a})`;
}

// Skin tones: Mule is distinctly darker than Princess.
export const SKIN = Object.freeze({
  mule: { base: '#3A2218', shade: '#26150F', light: '#5C3A2B' },
  princess: { base: '#9A6544', shade: '#764A32', light: '#C08A64' },
});
