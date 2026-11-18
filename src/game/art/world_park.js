// City-park props: bioluminescent trees, glowing flowers, lanterns, benches, the park
// gate, ponds with stepping stones, and the familiar wooden log.
import { PAL, mix } from './palette.js';
import { px, disc, glow, line, fillPoly, rng, drawText, textWidth, inkAndRim } from './pixel.js';
import { tex, texFrames, makeAnim } from './common.js';

function tree(c, w, h, seed, { c1 = '#1a0f33', c2 = '#2a1850', hi = '#3c2a73', dots = [PAL.lavender, PAL.blue, PAL.pink] } = {}) {
  const r = rng(seed);
  const trunkW = Math.max(5, Math.round(w * 0.12));
  const cx = w >> 1;
  px(c, cx - (trunkW >> 1), h * 0.45, trunkW, h * 0.55, '#120b22');
  px(c, cx + (trunkW >> 1) - 2, h * 0.5, 2, h * 0.5, '#2a1850');
  // a couple of branches
  line(c, cx, h * 0.62, cx - w * 0.28, h * 0.42, '#120b22', 3);
  line(c, cx, h * 0.55, cx + w * 0.26, h * 0.38, '#120b22', 3);
  const blobs = [];
  for (let i = 0; i < 12; i++) blobs.push([cx + r.int(-w * 0.34, w * 0.34), h * 0.3 + r.int(-h * 0.22, h * 0.14), r.int(w * 0.14, w * 0.24)]);
  blobs.push([cx, h * 0.28, w * 0.3]);
  for (const [x, y, rad] of blobs) disc(c, x, y, rad, c1);
  for (const [x, y, rad] of blobs) disc(c, x + rad * 0.25, y - rad * 0.25, Math.max(2, rad * 0.62), c2);
  for (const [x, y, rad] of blobs.slice(0, 7)) disc(c, x + rad * 0.4, y - rad * 0.4, Math.max(1, rad * 0.28), hi);
  for (let i = 0; i < 26; i++) {
    const [x, y, rad] = blobs[r.int(0, blobs.length - 1)];
    px(c, x + r.int(-rad, rad), y + r.int(-rad, rad), 1, 1, r.pick(dots));
  }
}

function flower(c, i, petal, core) {
  const sway = [0, 1, 0, -1][i];
  px(c, 4, 6, 1, 6, '#1f6b5a'); px(c, 5 + sway, 3, 1, 3, '#1f6b5a');
  px(c, 2, 9, 2, 1, '#2aa07f'); px(c, 5, 8, 2, 1, '#2aa07f');
  glow(c, 5 + sway, 3, 5, petal, 0.35 + (i % 2) * 0.25, 3);
  px(c, 3 + sway, 2, 5, 3, petal); px(c, 4 + sway, 1, 3, 5, petal); px(c, 4 + sway, 3, 2, 1, core);
}

export function buildParkWorld(scene) {
  const T = scene.textures;

  // trees (three silhouettes)
  tex(T, 'tree_a', 84, 132, (c) => tree(c, 84, 132, 3));
  tex(T, 'tree_b', 70, 112, (c) => tree(c, 70, 112, 8, { c1: '#150d2c', c2: '#24134a', hi: '#43307f' }));
  tex(T, 'tree_c', 96, 150, (c) => tree(c, 96, 150, 13, { c1: '#10091f', c2: '#1d1040', hi: '#352366', dots: [PAL.pink, PAL.lavender, '#8ff7cf'] }));

  tex(T, 'bush', 34, 18, (c) => {
    const r = rng(5);
    for (let i = 0; i < 5; i++) disc(c, 6 + i * 5, 11 + r.int(-2, 1), r.int(5, 7), '#1a0f33');
    for (let i = 0; i < 5; i++) disc(c, 7 + i * 5, 9 + r.int(-2, 1), r.int(3, 4), '#2a1850');
    for (let i = 0; i < 6; i++) px(c, r.int(2, 30), r.int(4, 14), 1, 1, r.pick([PAL.pink, PAL.lavender, PAL.blue]));
  });

  // glowing flowers
  for (const [key, petal, core] of [['flower_a', PAL.pink, '#fff6d8'], ['flower_b', PAL.blue, '#ffffff'], ['flower_c', PAL.lavender, PAL.warm]]) {
    const frames = texFrames(T, key, 4, 12, 14, (c, i) => flower(c, i, petal, core));
    makeAnim(scene, key, frames, 3);
  }

  // park lantern
  tex(T, 'lantern', 14, 64, (c) => {
    px(c, 6, 10, 2, 54, '#2a2a3c'); px(c, 4, 60, 6, 4, '#1a1a28');
    px(c, 3, 4, 8, 8, '#3c3c58'); px(c, 4, 5, 6, 6, '#e6d8ff'); px(c, 5, 6, 3, 3, '#ffffff'); px(c, 2, 3, 10, 2, '#2a2a3c');
  });

  // bench
  tex(T, 'bench', 44, 24, (c) => {
    px(c, 3, 8, 38, 3, '#5a3a2c'); px(c, 3, 3, 38, 2, '#5a3a2c'); px(c, 3, 3, 38, 1, '#8a6650');
    px(c, 5, 5, 2, 12, '#2a2a3c'); px(c, 37, 5, 2, 12, '#2a2a3c');
    px(c, 3, 11, 38, 1, PAL.electric); px(c, 4, 17, 3, 6, '#2a2a3c'); px(c, 37, 17, 3, 6, '#2a2a3c');
  }, (cv) => inkAndRim(cv, { rim: PAL.lavender, rimStrength: 0.3 }));

  // park gate arch with neon sign
  tex(T, 'gate_arch', 84, 88, (c) => {
    px(c, 4, 20, 8, 68, '#2a2a3c'); px(c, 72, 20, 8, 68, '#2a2a3c');
    px(c, 4, 20, 2, 68, '#3c3c58'); px(c, 72, 20, 2, 68, '#3c3c58');
    px(c, 0, 14, 84, 10, '#3c3c58'); px(c, 0, 14, 84, 2, PAL.chrome); px(c, 0, 22, 84, 2, PAL.electric);
    const w = textWidth('PARK', 2);
    px(c, 42 - w / 2 - 3, 28, w + 6, 18, '#0c0716');
    for (let k = 0; k < 2; k++) drawText(c, 'PARK', 42 - w / 2 + k, 31 + k, k ? '#ffffff' : '#5CFFB0', 2);
    for (let x = 16; x < 70; x += 8) px(c, x, 2 + (x % 3), 1, 12, '#5a3a2c');
  }, (cv) => inkAndRim(cv, { rim: PAL.lavender, rimStrength: 0.25 }));

  // low iron fence
  tex(T, 'fence_low', 32, 16, (c) => {
    px(c, 0, 4, 32, 1, '#3c3c58'); px(c, 0, 11, 32, 1, '#3c3c58');
    for (let x = 1; x < 32; x += 6) { px(c, x, 2, 2, 14, '#2a2a3c'); px(c, x, 1, 2, 2, PAL.lavender); }
  });

  // stepping stones and pond
  tex(T, 'stone', 30, 12, (c) => {
    px(c, 2, 3, 26, 8, '#3c3c58'); px(c, 0, 5, 30, 5, '#3c3c58'); px(c, 2, 3, 26, 1, '#6c6c85'); px(c, 3, 10, 24, 1, '#1a1a28');
    px(c, 6, 5, 2, 1, '#6c6c85'); px(c, 18, 7, 3, 1, '#2a2a3c');
  });
  const pond = texFrames(T, 'pond', 4, 16, 54, (c, i) => {
    px(c, 0, 0, 16, 54, '#0d0a24');
    px(c, 0, 0, 16, 2, '#5a2d96');
    for (let y = 3; y < 54; y += 4) {
      const off = ((y >> 2) + i) % 4;
      px(c, off * 3, y, 5, 1, y < 20 ? '#43307f' : '#241448');
      px(c, 8 + off, y + 2, 4, 1, y < 20 ? PAL.lavender : '#321a60');
    }
    px(c, 3 + i * 3, 1, 4, 1, '#c8a7ff');
    glow(c, 8, 2, 7, PAL.lavender, 0.2, 2);
  });
  makeAnim(scene, 'pond', pond, 3);
  const lily = texFrames(T, 'lily', 3, 14, 8, (c, i) => {
    px(c, 1, 3, 12, 3, '#1f6b5a'); px(c, 3, 2, 8, 1, '#2aa07f'); px(c, 6 + (i % 2), 0, 3, 3, PAL.pink); px(c, 7 + (i % 2), 0, 1, 1, '#fff6d8');
  });
  makeAnim(scene, 'lily', lily, 2);

  // THE LOG: a long weathered trunk, cut face on the left, rim-lit by the purple city.
  tex(T, 'log', 96, 34, (c) => {
    const r = rng(77);
    px(c, 8, 8, 84, 22, '#6b4a3a'); px(c, 4, 12, 90, 14, '#6b4a3a');
    px(c, 8, 8, 84, 3, '#8a6650'); px(c, 8, 26, 84, 4, '#3a261c'); px(c, 10, 29, 80, 2, '#241610');
    for (let i = 0; i < 14; i++) px(c, 12 + r.int(0, 78), 11 + r.int(0, 14), r.int(5, 12), 1, r.pick(['#4a3226', '#7a5642', '#3a261c']));
    for (let i = 0; i < 6; i++) px(c, 14 + r.int(0, 76), 8, r.int(3, 7), 2, '#2f6b4a');   // moss
    px(c, 10, 8, 82, 1, '#c8a7ff');                                                       // city rim light
    // cut end
    c.fillStyle = '#a88060'; c.beginPath(); c.ellipse(8, 19, 7, 11, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#7a5642'; c.lineWidth = 1;
    for (const rr of [2, 4, 6]) { c.beginPath(); c.ellipse(8, 19, rr, rr * 1.55, 0, 0, Math.PI * 2); c.stroke(); }
    px(c, 8, 18, 1, 2, '#4a3226');
    // little knot + branch stub
    px(c, 62, 13, 5, 5, '#3a261c'); px(c, 63, 14, 3, 3, '#241610'); px(c, 88, 4, 6, 6, '#6b4a3a'); px(c, 88, 4, 6, 1, '#8a6650');
  });
  tex(T, 'log_glow', 140, 60, (c) => glow(c, 70, 40, 62, PAL.lavender, 0.45, 6));

  // soft picnic lights strung over the log (tiny bulbs)
  tex(T, 'string_lights', 120, 24, (c) => {
    c.strokeStyle = '#1a1a28'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 2); c.quadraticCurveTo(60, 26, 120, 2); c.stroke();
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, x = t * 120, y = 2 + 2 * (1 - t) * t * 24 * 0.9 + 0;
      glow(c, x, y + 2, 4, i % 2 ? PAL.pink : PAL.warm, 0.5, 2);
      px(c, x - 1, y + 1, 2, 2, i % 2 ? '#ffd0e8' : '#fff0c0');
    }
  });

  // rock + stump + signpost
  tex(T, 'stump', 22, 18, (c) => { px(c, 3, 3, 16, 14, '#5a3a2c'); px(c, 2, 0, 18, 5, '#a88060'); px(c, 5, 1, 12, 1, '#7a5642'); px(c, 3, 15, 16, 2, '#2a1810'); });
  tex(T, 'signpost', 26, 40, (c) => {
    px(c, 12, 6, 3, 34, '#4a3226'); px(c, 2, 6, 22, 9, '#5a3a2c'); px(c, 2, 6, 22, 1, '#8a6650'); px(c, 4, 9, 16, 1, PAL.lavender); px(c, 4, 11, 12, 1, PAL.lavender);
  });
  void mix; void fillPoly;
}
