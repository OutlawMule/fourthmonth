// Parallax backgrounds, generated: night skies, layered neon skylines (with two window
// patterns per layer so lights can "flicker" between them), park trees, houses, and the
// rooftop skyline with a four-stage sky for the dawn ending.
import { PAL, mix } from './palette.js';
import { makeCanvas, px, rng, vband, disc, glow, drawText } from './pixel.js';
import { tex } from './common.js';

export const BG_W = 512;
export const BG_H = 270;
const LIT = [PAL.lavender, PAL.electric, PAL.pink, PAL.blue, PAL.warm];

function layout(seed, { min = 18, max = 46, hMin = 50, hMax = 150, width = BG_W }) {
  const r = rng(seed);
  const out = [];
  let x = -r.int(0, 10);
  while (x < width) {
    const w = r.int(min, max);
    out.push({ x, w, h: r.int(hMin, hMax), roof: r.int(0, 5), neon: r() < 0.3, col: r.pick(LIT) });
    x += w + r.int(0, 3);
  }
  return out;
}

function drawBuildings(ctx, items, baseY, o) {
  const wr = rng(o.windowSeed);
  for (const off of [0, -BG_W]) {
    for (const b of items) {
      const x = b.x + off, top = baseY - b.h;
      px(ctx, x, top, b.w, b.h, o.body);
      px(ctx, x + b.w - 2, top, 2, b.h, o.edge);
      px(ctx, x, top, b.w, 1, o.edge);
      // roof furniture
      if (b.roof === 0) px(ctx, x + (b.w >> 1), top - 12, 1, 12, o.body);
      if (b.roof === 1) { px(ctx, x + 4, top - 6, 8, 6, o.body); px(ctx, x + 4, top - 7, 8, 1, o.edge); }
      if (b.roof === 2) { px(ctx, x + (b.w >> 1), top - 16, 1, 16, o.body); px(ctx, x + (b.w >> 1) - 1, top - 17, 3, 1, PAL.red); }
      // windows
      for (let wy = top + 5; wy < baseY - 4; wy += 5) {
        for (let wx = x + 3; wx < x + b.w - 5; wx += 4) {
          if (wr() < o.lit) px(ctx, wx, wy, 2, 3, wr.pick(o.colors ?? LIT));
          else if (wr() < 0.25) px(ctx, wx, wy, 2, 3, o.dim);
        }
      }
      // neon strip sign
      if (o.neon && b.neon) {
        const sh = 10 + ((b.w * 3) % 18), sy = top + 8;
        px(ctx, x + 1, sy, 2, sh, b.col);
        px(ctx, x, sy, 4, sh, mix(b.col, '#000000', 0.7));
        px(ctx, x + 1, sy, 2, sh, b.col);
        px(ctx, x + 1, sy + 1, 1, 2, '#ffffff');
      }
    }
  }
}

function sky(ctx, w, h, stops, seed, { stars = 90, moon = null } = {}) {
  vband(ctx, 0, 0, w, h, stops, 16);
  const r = rng(seed);
  for (let i = 0; i < stars; i++) {
    const y = r.int(0, Math.floor(h * 0.62));
    const a = 1 - y / (h * 0.7);
    ctx.globalAlpha = Math.max(0.25, a);
    px(ctx, r.int(0, w - 1), y, 1, 1, r() < 0.2 ? PAL.pink : r() < 0.5 ? PAL.lavender : '#ffffff');
    if (r() < 0.06) { const x = r.int(2, w - 3); px(ctx, x - 1, y, 3, 1, '#fff'); px(ctx, x, y - 1, 1, 3, '#fff'); }
  }
  ctx.globalAlpha = 1;
  if (moon) {
    glow(ctx, moon.x, moon.y, moon.r + 18, moon.glow, 0.5, 5);
    disc(ctx, moon.x, moon.y, moon.r, moon.color);
    disc(ctx, moon.x + 4, moon.y - 3, moon.r - 4, mix(moon.color, '#ffffff', 0.25));
    const rr = rng(4);
    for (let i = 0; i < 6; i++) disc(ctx, moon.x + rr.int(-moon.r + 6, moon.r - 6), moon.y + rr.int(-moon.r + 6, moon.r - 6), rr.int(1, 3), mix(moon.color, moon.glow, 0.5));
  }
}

function haze(ctx, y0, color, a = 0.35) {
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = `rgba(${color},${(a * i) / 24})`;
    ctx.fillRect(0, y0 + i * 2, BG_W, 2);
  }
}

function trees(ctx, seed, { baseY = 262, body = '#0d0a1f', glowCol = PAL.lavender, density = 1 }) {
  const r = rng(seed);
  for (const off of [0, -BG_W]) {
    for (let x = -10; x < BG_W + 20; x += r.int(24, 44) / density) {
      const h = r.int(70, 150), rad = r.int(20, 34), cx = x + off;
      px(ctx, cx - 2, baseY - h * 0.55, 4, h * 0.55, body);          // trunk
      for (let k = 0; k < 7; k++) disc(ctx, cx + r.int(-rad / 2, rad / 2), baseY - h + r.int(-8, 14), r.int(rad / 3, rad / 2 + 4), body);
      for (let k = 0; k < 16; k++) px(ctx, cx + r.int(-rad, rad), baseY - h + r.int(-14, 22), 1, 1, r() < 0.5 ? glowCol : PAL.blue);
    }
  }
}

function houses(ctx, seed) {
  const r = rng(seed);
  for (const off of [0, -BG_W]) {
    for (let x = 0; x < BG_W + 40; x += r.int(54, 80)) {
      const w = r.int(40, 64), h = r.int(34, 58), cx = x + off, top = 232 - h;
      px(ctx, cx, top, w, h, '#15092a');
      for (let i = 0; i < 9; i++) px(ctx, cx - 4 + i, top - i, w + 8 - i * 2, 1, '#1c0d38'); // roof
      for (let wx = cx + 6; wx < cx + w - 8; wx += 12) {
        const lit = r() < 0.55;
        px(ctx, wx, top + 10, 6, 7, lit ? mix(PAL.warm, PAL.pink, r() * 0.6) : '#241447');
        if (lit) px(ctx, wx, top + 10, 6, 1, '#fff6d8');
      }
      px(ctx, cx + w - 12, top + h - 14, 6, 14, '#0a0615');
    }
  }
}

export function buildBackgrounds(scene) {
  const T = scene.textures;

  // ------------------------------------------------------------------ drag district
  tex(T, 'bg_sky_drag', 480, BG_H, (c) => sky(c, 480, BG_H, ['#07040f', '#140a2b', '#2c1456', '#5a2d96'], 11, { moon: { x: 372, y: 62, r: 24, color: '#d8c4ff', glow: PAL.electric } }));
  for (const [i, seed] of [[0, 21], [1, 22]]) {
    tex(T, `bg_far_drag_${i}`, BG_W, BG_H, (c) => {
      drawBuildings(c, layout(5, { hMin: 70, hMax: 170, min: 24, max: 52 }), 262, { body: '#1a0d33', edge: '#26144a', dim: '#2a1850', lit: 0.12, windowSeed: seed, colors: [PAL.electric, PAL.lavender, '#5a2d96'] });
      haze(c, 214, '90,45,150', 0.45);
    });
    tex(T, `bg_mid_drag_${i}`, BG_W, BG_H, (c) => {
      drawBuildings(c, layout(9, { hMin: 60, hMax: 150, min: 26, max: 54 }), 270, { body: '#120a24', edge: '#2a1550', dim: '#1d1038', lit: 0.34, windowSeed: seed + 50, neon: true });
    });
  }

  // ----------------------------------------------------------------------- park
  tex(T, 'bg_sky_park', 480, BG_H, (c) => sky(c, 480, BG_H, ['#060814', '#0f1030', '#231a55', '#41307a'], 31, { stars: 120, moon: { x: 110, y: 58, r: 20, color: '#e6dcff', glow: PAL.lavender } }));
  tex(T, 'bg_far_park', BG_W, BG_H, (c) => {
    drawBuildings(c, layout(14, { hMin: 40, hMax: 110, min: 22, max: 44 }), 250, { body: '#150c2c', edge: '#1f1140', dim: '#241448', lit: 0.1, windowSeed: 71, colors: [PAL.lavender, PAL.blue, PAL.electric] });
    haze(c, 200, '70,50,140', 0.5);
  });
  tex(T, 'bg_mid_park', BG_W, BG_H, (c) => trees(c, 41, { body: '#0b0820', glowCol: PAL.lavender, density: 1 }));
  tex(T, 'bg_near_park', BG_W, BG_H, (c) => trees(c, 77, { body: '#070516', glowCol: PAL.pink, density: 0.55, baseY: 270 }));

  // ----------------------------------------------------------------- residential
  tex(T, 'bg_sky_res', 480, BG_H, (c) => sky(c, 480, BG_H, ['#05030c', '#110a26', '#25124a', '#3c1c70'], 51, { stars: 100, moon: { x: 90, y: 50, r: 16, color: '#cbb8ff', glow: PAL.electric } }));
  tex(T, 'bg_far_res', BG_W, BG_H, (c) => {
    drawBuildings(c, layout(18, { hMin: 80, hMax: 190, min: 22, max: 48 }), 240, { body: '#190c30', edge: '#26144a', dim: '#2a1850', lit: 0.14, windowSeed: 81, colors: [PAL.electric, PAL.lavender, PAL.pink] });
    haze(c, 196, '90,45,150', 0.4);
  });
  tex(T, 'bg_mid_res', BG_W, BG_H, (c) => houses(c, 61));

  // -------------------------------------------------------------------- rooftop
  const roofSky = [
    ['#05030c', '#110a26', '#25124a', '#3c1c70'],
    ['#0b0620', '#241049', '#4a2178', '#7a3a9a'],
    ['#1a0d33', '#4a2178', '#a84a8c', '#ff9ab0'],
    ['#33195e', '#8a4a9c', '#ff8aa8', '#ffd9a0'],
  ];
  roofSky.forEach((stops, i) => tex(T, `bg_sky_roof_${i}`, 480, BG_H, (c) => sky(c, 480, BG_H, stops, 91, { stars: Math.max(0, 110 - i * 38), moon: i < 3 ? { x: 380, y: 52 + i * 14, r: 18, color: '#e6dcff', glow: PAL.lavender } : null })));
  for (const [i, seed] of [[0, 3], [1, 4]]) {
    tex(T, `bg_far_roof_${i}`, BG_W, BG_H, (c) => {
      drawBuildings(c, layout(33, { hMin: 90, hMax: 210, min: 24, max: 56 }), 270, { body: '#1a0d33', edge: '#2d1859', dim: '#2a1850', lit: 0.2, windowSeed: seed, neon: true });
      haze(c, 220, '120,60,160', 0.45);
    });
    tex(T, `bg_mid_roof_${i}`, BG_W, BG_H, (c) => {
      drawBuildings(c, layout(35, { hMin: 40, hMax: 120, min: 30, max: 60 }), 290, { body: '#10081f', edge: '#26144a', dim: '#1d1038', lit: 0.3, windowSeed: seed + 9, neon: true });
    });
  }

  // flying vehicles (distant)
  for (const [k, col] of [['flyer_a', PAL.pink], ['flyer_b', PAL.blue]]) {
    tex(T, k, 22, 8, (c) => {
      px(c, 6, 2, 12, 3, '#2A2A3C'); px(c, 8, 1, 7, 2, '#3C3C58'); px(c, 17, 3, 3, 1, '#fff');
      px(c, 0, 3, 6, 1, col); px(c, 2, 4, 4, 1, mix(col, '#000', 0.5));
    });
  }
  tex(T, 'fog', 64, 32, (c) => { for (let y = 0; y < 32; y++) { c.fillStyle = `rgba(200,180,255,${0.12 * Math.sin((y / 32) * Math.PI)})`; c.fillRect(0, y, 64, 1); } });
  void makeCanvas; void drawText;
}
