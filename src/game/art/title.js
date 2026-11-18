// Pixel-art title lettering: every font pixel becomes a chunky cell with a chrome
// gradient, a dark outline and neon-violet edges - the same look for the game title,
// the BLAQ STUDIO mark and the intro logo, generated in code (no image files).
import { makeCanvas, textCells } from './pixel.js';
import { PAL, rgba } from './palette.js';

export const CHROME_LIGHT = ['#ffffff', '#ececf8', '#c4c4d6', '#8a8aa6', '#3c3c58', '#9a9ab4', '#c8c8da'];
export const CHROME_DARK = ['#d9d9ec', '#a9a9c2', '#76768f', '#34344a', '#15151f', '#4a4a64', '#70708a'];

/**
 * renderTitle(['MULE × PRINCESS'], { scale: 6, bands: CHROME_LIGHT, edge: PAL.electric })
 * Returns a canvas. Lines are centred on each other.
 */
export function renderTitle(lines, { scale = 6, bands = CHROME_LIGHT, edge = PAL.electric, glowColor = PAL.electric, glowStrength = 0.28, lineGap = 2, margin = 14 } = {}) {
  const rows = lines.map((l) => textCells(l));
  const Wc = Math.max(...rows.map((r) => r.w));
  const Hc = rows.length * 7 + (rows.length - 1) * lineGap;
  const W = Wc * scale + margin * 2;
  const H = Hc * scale + margin * 2;
  const { canvas, ctx } = makeCanvas(W, H);

  const lit = new Map(); // "x,y" -> row-in-line (0..6)
  rows.forEach((r, i) => {
    const ox = Math.floor((Wc - r.w) / 2);
    const oy = i * (7 + lineGap);
    for (const [x, y] of r.cells) lit.set(`${x + ox},${y + oy}`, y);
  });
  const has = (x, y) => lit.has(`${x},${y}`);
  const px = (cx, cy) => [margin + cx * scale, margin + cy * scale];

  // soft stepped glow behind everything
  for (const [r, a] of [[scale * 1.6, glowStrength * 0.35], [scale * 1.0, glowStrength * 0.6], [scale * 0.5, glowStrength]]) {
    ctx.fillStyle = rgba(glowColor, a);
    for (const key of lit.keys()) {
      const [cx, cy] = key.split(',').map(Number);
      const [x, y] = px(cx, cy);
      ctx.fillRect(x - r, y - r, scale + r * 2, scale + r * 2);
    }
  }
  // dark outline
  const o = Math.max(1, Math.round(scale / 3));
  ctx.fillStyle = '#05050a';
  for (const key of lit.keys()) {
    const [cx, cy] = key.split(',').map(Number);
    const [x, y] = px(cx, cy);
    ctx.fillRect(x - o, y - o, scale + o * 2, scale + o * 2);
  }
  // chrome fill
  for (const [key, row] of lit) {
    const [cx, cy] = key.split(',').map(Number);
    const [x, y] = px(cx, cy);
    ctx.fillStyle = bands[row] ?? bands[bands.length - 1];
    ctx.fillRect(x, y, scale, scale);
  }
  // neon edges on every exposed side
  const t = Math.max(1, Math.round(scale / 4));
  ctx.fillStyle = edge;
  for (const key of lit.keys()) {
    const [cx, cy] = key.split(',').map(Number);
    const [x, y] = px(cx, cy);
    if (!has(cx, cy - 1)) ctx.fillRect(x, y, scale, t);
    if (!has(cx, cy + 1)) ctx.fillRect(x, y + scale - t, scale, t);
    if (!has(cx - 1, cy)) ctx.fillRect(x, y, t, scale);
    if (!has(cx + 1, cy)) ctx.fillRect(x + scale - t, y, t, scale);
  }
  return canvas;
}

export function titleDataUrl(lines, opts) {
  return renderTitle(lines, opts).toDataURL('image/png');
}
