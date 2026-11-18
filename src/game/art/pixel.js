// Pixel-art drawing toolkit: canvas helpers, a 5x7 bitmap font, outline/rim-light
// post-processing, a seeded RNG and a tiny atlas packer. Everything is procedural so
// the game needs no external image files.
import { rgb, rgba } from './palette.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

/** Deterministic RNG so generated art is identical on every load. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

export function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Thick Bresenham line made of square pixels. */
export function line(ctx, x0, y0, x1, y1, color, t = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  ctx.fillStyle = color;
  const off = Math.floor(t / 2);
  for (let guard = 0; guard < 4000; guard++) {
    ctx.fillRect(x0 - off, y0 - off, t, t);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

export function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y) + 0.5);
    ctx.fillRect(Math.round(cx) - w, Math.round(cy) + y, w * 2 + 1, 1);
  }
}

export function ring(ctx, cx, cy, r, color, t = 1) {
  ctx.fillStyle = color;
  for (let a = 0; a < Math.PI * 2; a += 1 / Math.max(r, 2)) {
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), t, t);
  }
}

/** Stepped (banded) glow - reads as pixel art instead of a smooth gradient. */
export function glow(ctx, cx, cy, r, color, alpha = 0.5, steps = 4) {
  for (let i = steps; i >= 1; i--) {
    const rr = (r * i) / steps;
    ctx.fillStyle = rgba(color, (alpha * (steps - i + 1)) / (steps * 1.6));
    for (let y = -rr; y <= rr; y++) {
      const w = Math.sqrt(Math.max(0, rr * rr - y * y));
      ctx.fillRect(Math.round(cx - w), Math.round(cy + y), Math.max(1, Math.round(w * 2)), 1);
    }
  }
}

/** Vertical gradient quantised into bands (pixel-art friendly). */
export function vband(ctx, x, y, w, h, stops, bands = 12) {
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    let c = stops[0];
    for (let s = 0; s < stops.length - 1; s++) {
      const a = s / (stops.length - 1), b = (s + 1) / (stops.length - 1);
      if (t >= a && t <= b) {
        const k = (t - a) / (b - a);
        const [r1, g1, b1] = rgb(stops[s]), [r2, g2, b2] = rgb(stops[s + 1]);
        c = `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
      }
    }
    ctx.fillStyle = c;
    const y0 = y + Math.floor((h * i) / bands), y1 = y + Math.floor((h * (i + 1)) / bands);
    ctx.fillRect(x, y0, w, Math.max(1, y1 - y0));
  }
}

// ----------------------------------------------------------------------------- font
// 5x7 bitmap font, one number per row (5 bits, MSB = leftmost pixel).
const G = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [30, 1, 1, 14, 1, 1, 30], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  '&': [12, 18, 20, 8, 21, 18, 13], '×': [0, 17, 10, 4, 10, 17, 0], '.': [0, 0, 0, 0, 0, 0, 4],
  ',': [0, 0, 0, 0, 0, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4],
  '-': [0, 0, 0, 31, 0, 0, 0], ':': [0, 4, 0, 0, 0, 4, 0], "'": [4, 4, 8, 0, 0, 0, 0],
  '/': [1, 1, 2, 4, 8, 16, 16], '+': [0, 4, 4, 31, 4, 4, 0], '<': [2, 4, 8, 16, 8, 4, 2],
  '>': [8, 4, 2, 1, 2, 4, 8], '%': [24, 25, 2, 4, 8, 19, 3], '#': [10, 10, 31, 10, 31, 10, 10],
  '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '"': [10, 10, 0, 0, 0, 0, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

export function textWidth(str, scale = 1, spacing = 1) {
  return Math.max(0, [...str].length * (5 + spacing) * scale - spacing * scale);
}

/** Draws text with the bitmap font. Returns the width drawn. */
export function drawText(ctx, str, x, y, color, scale = 1, spacing = 1) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const rows = G[ch] ?? G['?'];
    for (let r = 0; r < 7; r++) {
      const bits = rows[r];
      for (let c = 0; c < 5; c++) {
        if (bits & (1 << (4 - c))) ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
      }
    }
    cx += (5 + spacing) * scale;
  }
  return cx - x - spacing * scale;
}

/** A neon sign texture: dark plate, glowing text, stepped bloom. */
export function neonSign(text, color, { scale = 1, pad = 3, plate = '#0c0716', border = true } = {}) {
  const w = textWidth(text, scale) + pad * 2 + 2;
  const h = 7 * scale + pad * 2 + 2;
  const { canvas, ctx } = makeCanvas(w, h);
  px(ctx, 0, 0, w, h, plate);
  if (border) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, h - 1, w, 1); ctx.fillRect(0, 0, 1, h); ctx.fillRect(w - 1, 0, 1, h);
  }
  ctx.globalAlpha = 0.35;
  drawText(ctx, text, pad + 2, pad + 2, color, scale);
  drawText(ctx, text, pad, pad, color, scale);
  ctx.globalAlpha = 1;
  drawText(ctx, text, pad + 1, pad + 1, '#ffffff', scale);
  return canvas;
}

// -------------------------------------------------------------------- post-processing
/**
 * Adds a 1px dark outline around every opaque shape and an optional neon rim light on
 * the upper/right edges. Run once per sprite frame; this is what gives all the
 * characters the same "inked" pixel-art look.
 */
export function inkAndRim(canvas, { outline = '#09090F', rim = null, rimStrength = 0.5 } = {}) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data, o = out.data;
  const [or, og, ob] = rgb(outline);
  const rr = rim ? rgb(rim) : null;
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : s[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (s[i + 3] > 40) {
        let r = s[i], g = s[i + 1], b = s[i + 2];
        if (rr && (A(x + 1, y) <= 40 || A(x, y - 1) <= 40) && A(x - 1, y) > 40) {
          r += (rr[0] - r) * rimStrength; g += (rr[1] - g) * rimStrength; b += (rr[2] - b) * rimStrength;
        }
        o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = 255;
      } else if (A(x - 1, y) > 40 || A(x + 1, y) > 40 || A(x, y - 1) > 40 || A(x, y + 1) > 40) {
        o[i] = or; o[i + 1] = og; o[i + 2] = ob; o[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/** Flip a canvas horizontally into a new canvas. */
export function flipH(canvas) {
  const { canvas: c, ctx } = makeCanvas(canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return c;
}

// ------------------------------------------------------------------------------ atlas
/**
 * Packs equally sized frames into one canvas and registers it with Phaser as a single
 * texture with named frames (a real sprite atlas). The source frame canvases stay
 * available for the HTML previews via `getFrame()`.
 */
export class Atlas {
  constructor(key, cellW, cellH, cols = 12) {
    this.key = key; this.cw = cellW; this.ch = cellH; this.cols = cols;
    this.names = [];
    this.frames = new Map(); // name -> canvas
  }

  add(name, drawFn, post) {
    const { canvas, ctx } = makeCanvas(this.cw, this.ch);
    drawFn(ctx, canvas);
    if (post) post(canvas);
    this.names.push(name);
    this.frames.set(name, canvas);
    return canvas;
  }

  getFrame(name) { return this.frames.get(name); }

  register(textures) {
    const rows = Math.ceil(this.names.length / this.cols);
    const { canvas, ctx } = makeCanvas(this.cols * this.cw, rows * this.ch);
    this.names.forEach((n, i) => {
      ctx.drawImage(this.frames.get(n), (i % this.cols) * this.cw, Math.floor(i / this.cols) * this.ch);
    });
    if (textures.exists(this.key)) textures.remove(this.key);
    const tex = textures.addCanvas(this.key, canvas);
    this.names.forEach((n, i) => tex.add(n, 0, (i % this.cols) * this.cw, Math.floor(i / this.cols) * this.ch, this.cw, this.ch));
    return tex;
  }
}

/** Registry so HTML previews can read generated frames: ART.get('mule').getFrame('idle_0') */
export const ART = {
  atlases: new Map(),
  set(atlas) { this.atlases.set(atlas.key, atlas); },
  get(key) { return this.atlases.get(key); },
};


/** Scanline polygon fill with integer pixels (no anti-aliasing). pts = [[x,y],...] */
export function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const yc = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.round(xs[i]), x1 = Math.round(xs[i + 1]);
      if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
    }
  }
}

/**
 * Lit cells of a bitmap-font string as [[x, y], ...] in font-pixel units (no scaling).
 * Used by the title renderer and the intro, which turn every font pixel into a particle.
 */
export function textCells(str, spacing = 1) {
  const cells = [];
  let cx = 0;
  for (const ch of String(str).toUpperCase()) {
    const rows = G[ch] ?? G['?'];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) if (rows[r] & (1 << (4 - c))) cells.push([cx + c, r]);
    }
    cx += 5 + spacing;
  }
  return { cells, w: Math.max(0, cx - spacing), h: 7 };
}
