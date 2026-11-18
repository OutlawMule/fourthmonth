// Drag-racing district props: cars, spectators, signs, light poles, barriers, the
// start-lights tree, rails, kicker ramps, laser gates and the meeting-point hologram.
import { PAL, mix } from './palette.js';
import { makeCanvas, px, line, disc, glow, fillPoly, inkAndRim, neonSign, drawText, textWidth, rng } from './pixel.js';
import { tex, texFrames, makeAnim } from './common.js';

function car(c, w, o) {
  const { body, stripe, glass = '#1a1233', sport = false } = o;
  const y0 = 3;
  fillPoly(c, [[2, y0 + 9], [w - 2, y0 + 9], [w - 1, y0 + 13], [w - 3, y0 + 16], [3, y0 + 16], [1, y0 + 13]], body);
  fillPoly(c, [[w * 0.2, y0 + 9], [w * 0.33, y0 + 2], [w * 0.68, y0 + 2], [w * 0.82, y0 + 9]], mix(body, '#000', 0.2));
  fillPoly(c, [[w * 0.26, y0 + 8], [w * 0.36, y0 + 3.5], [w * 0.64, y0 + 3.5], [w * 0.76, y0 + 8]], glass);
  px(c, Math.round(w * 0.5), y0 + 4, 1, 4, mix(body, '#000', 0.3));
  line(c, w * 0.3, y0 + 7, w * 0.4, y0 + 4, '#6f5aa8', 1);
  px(c, 4, y0 + 11, w - 8, 1, stripe);
  px(c, w - 4, y0 + 10, 3, 2, '#fff6d8');
  px(c, 1, y0 + 10, 2, 2, PAL.red);
  if (sport) { px(c, 0, y0 + 5, 7, 1, mix(body, '#000', 0.2)); px(c, 1, y0 + 6, 1, 3, '#222'); }
  for (const wx of [Math.round(w * 0.22), Math.round(w * 0.78)]) { disc(c, wx, y0 + 15, 4, '#0c0c12'); disc(c, wx, y0 + 15, 2, PAL.chrome); px(c, wx, y0 + 15, 1, 1, '#555'); }
  c.fillStyle = 'rgba(155,92,255,0.4)'; c.fillRect(5, y0 + 19, w - 10, 1);
  c.fillStyle = 'rgba(155,92,255,0.18)'; c.fillRect(7, y0 + 20, w - 14, 1);
}

function spectator(c, i, f) {
  const skins = ['#6b4230', '#4a2c20', '#8c5a3c', '#3a2218', '#a0704c'];
  const jackets = [PAL.pink, PAL.electric, PAL.blue, '#2a2a3c', PAL.warm];
  const skin = skins[i % skins.length], jacket = jackets[i % jackets.length];
  const up = f === 1;
  px(c, 3, 12, 6, 7, jacket); px(c, 3, 12, 6, 1, mix(jacket, '#fff', 0.4));
  px(c, 3, 19, 2, 5, '#14141f'); px(c, 7, 19, 2, 5, '#14141f');
  px(c, 2, 23, 3, 1, '#09090f'); px(c, 7, 23, 3, 1, '#09090f');
  px(c, 4, 6 - (up ? 1 : 0), 4, 5, skin);
  const hair = '#0a0a10';
  if (i % 3 === 0) disc(c, 6, 5 - (up ? 1 : 0), 3, hair); else if (i % 3 === 1) px(c, 4, 4 - (up ? 1 : 0), 4, 2, hair); else { px(c, 3, 4 - (up ? 1 : 0), 6, 3, jacket); }
  px(c, 7, 8 - (up ? 1 : 0), 1, 1, '#fff');
  if (up) { px(c, 1, 5, 2, 8, skin); px(c, 9, 5, 2, 8, skin); px(c, 1, 5, 2, 2, jacket); px(c, 9, 5, 2, 2, jacket); }
  else { px(c, 1, 13, 2, 6, skin); px(c, 9, 13, 2, 6, skin); }
}

export function buildDragWorld(scene) {
  const T = scene.textures;
  const post = (rim) => (cv) => inkAndRim(cv, { rim, rimStrength: 0.4 });

  // cars (parked / traffic)
  const cars = [
    ['car_a', 58, { body: '#3a1d7a', stripe: PAL.pink, sport: true }],
    ['car_b', 62, { body: '#14141f', stripe: PAL.electric }],
    ['car_c', 54, { body: '#7a1d63', stripe: PAL.blue, sport: true }],
    ['car_d', 66, { body: '#2a2a3c', stripe: PAL.lavender }],
  ];
  for (const [k, w, o] of cars) tex(T, k, w, 26, (c) => car(c, w, o), post(PAL.lavender));

  // spectators with a two-frame cheer
  for (let i = 0; i < 5; i++) {
    const keys = texFrames(T, `spec${i}`, 2, 12, 24, (c, f) => spectator(c, i, f), post(PAL.pink));
    makeAnim(scene, `spec${i}`, keys, 2 + (i % 3) * 0.5);
  }

  // street light poles (purple lamps)
  tex(T, 'pole', 12, 84, (c) => {
    px(c, 5, 8, 2, 76, '#2a2a3c'); px(c, 3, 80, 6, 4, '#1a1a28');
    px(c, 4, 4, 8, 3, '#3c3c58'); px(c, 8, 7, 4, 2, PAL.lavender); px(c, 9, 9, 2, 1, '#fff');
  });

  // neon signs (static) and animated holo boards
  const sign = (key, text, color, scale = 1) => { const cv = neonSign(text, color, { scale }); if (T.exists(key)) T.remove(key); T.addCanvas(key, cv); };
  sign('sign_drag', 'DRAG', PAL.pink, 2); sign('sign_nitro', 'NITRO', PAL.blue, 1); sign('sign_race', 'RACE 05', PAL.lavender, 1);
  sign('sign_blaq', 'BLAQ', PAL.electric, 2); sign('sign_open', 'OPEN 24H', PAL.pink, 1); sign('sign_pit', 'PIT', PAL.warm, 1);
  sign('sign_meet', 'MEET HERE', PAL.pink, 1); sign('sign_park', 'PARK', '#5CFFB0', 2); sign('sign_home', 'HOME', PAL.warm, 1);
  const holo = (key, label, col) => {
    const keys = texFrames(T, key, 4, 76, 44, (c, i) => {
      c.fillStyle = 'rgba(155,92,255,0.16)'; c.fillRect(0, 0, 76, 44);
      px(c, 0, 0, 76, 1, col); px(c, 0, 43, 76, 1, col); px(c, 0, 0, 1, 44, col); px(c, 75, 0, 1, 44, col);
      drawText(c, label, 6, 5, col, 2);
      for (let b = 0; b < 8; b++) { const h = 4 + ((b * 7 + i * 5) % 13); px(c, 6 + b * 8, 40 - h, 5, h, b % 2 ? PAL.pink : PAL.blue); }
      c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(1, 4 + i * 10, 74, 1);
    });
    makeAnim(scene, key, keys, 4);
  };
  holo('holo_a', 'LIVE', PAL.lavender); holo('holo_b', 'GO', PAL.pink);

  // barriers, tires, fence
  tex(T, 'barrier', 32, 14, (c) => {
    px(c, 0, 4, 32, 10, '#3c3c58'); px(c, 3, 0, 26, 4, '#3c3c58');
    for (let x = -4; x < 34; x += 8) { fillPoly(c, [[x, 14], [x + 4, 14], [x + 8, 4], [x + 4, 4]], PAL.pink); }
    px(c, 0, 4, 32, 1, '#b9b9cb');
  }, post(PAL.pink));
  tex(T, 'tires', 16, 18, (c) => { for (let i = 0; i < 3; i++) { px(c, 1, 12 - i * 6, 14, 6, '#0c0c12'); px(c, 3, 13 - i * 6, 10, 1, i === 1 ? PAL.pink : '#26263a'); } });
  tex(T, 'fence_neon', 32, 22, (c) => {
    px(c, 0, 0, 2, 22, '#2a2a3c'); px(c, 30, 0, 2, 22, '#2a2a3c'); px(c, 0, 0, 32, 2, PAL.electric);
    for (let x = 2; x < 30; x += 3) px(c, x, 2, 1, 20, 'rgba(185,185,203,0.35)');
    px(c, 0, 0, 2, 2, PAL.pink); px(c, 30, 0, 2, 2, PAL.pink);
  });

  // start-lights "Christmas tree"
  const treeKeys = texFrames(T, 'drag_tree', 5, 16, 60, (c, i) => {
    px(c, 7, 0, 2, 60, '#2a2a3c'); px(c, 2, 0, 12, 40, '#14141f');
    for (let l = 0; l < 5; l++) {
      const on = l <= i - 1 || (i === 4 && l === 4);
      const col = l < 4 ? PAL.warm : PAL.green;
      const lit = (i === 4 ? l >= 3 : l < i);
      glow(c, 8, 5 + l * 7, 5, col, lit ? 0.8 : 0, 2);
      disc(c, 8, 5 + l * 7, 3, lit ? col : '#2a2a3c');
      void on;
    }
  }, post(PAL.warm));
  makeAnim(scene, 'drag_tree', treeKeys, 2.2);

  // grind rail + posts, kicker ramp, launch pad
  tex(T, 'rail_t', 16, 8, (c) => { px(c, 0, 1, 16, 3, PAL.chrome); px(c, 0, 1, 16, 1, '#fff'); px(c, 0, 4, 16, 1, PAL.electric); c.globalAlpha = 0.4; px(c, 0, 5, 16, 1, PAL.electric); c.globalAlpha = 1; });
  tex(T, 'rail_post', 6, 20, (c) => { px(c, 1, 0, 4, 20, '#3c3c58'); px(c, 0, 17, 6, 3, '#1a1a28'); px(c, 1, 0, 4, 1, PAL.chrome); }, post(PAL.electric));
  tex(T, 'kicker', 40, 18, (c) => {
    fillPoly(c, [[0, 18], [40, 18], [40, 0]], '#2a2a3c'); fillPoly(c, [[0, 18], [36, 18], [36, 4]], '#3c3c58');
    line(c, 0, 17, 39, 0, PAL.electric, 1); line(c, 0, 18, 40, 1, PAL.pink, 1);
  });
  const padKeys = texFrames(T, 'pad', 3, 22, 8, (c, i) => {
    px(c, 0, 4, 22, 4, '#2a2a3c'); px(c, 1, 3 - (i === 1 ? 1 : 0), 20, 2, PAL.pink); px(c, 2, 3 - (i === 1 ? 1 : 0), 18, 1, '#fff');
    glow(c, 11, 3, 10, PAL.pink, 0.3 + (i === 1 ? 0.3 : 0), 3);
  });
  makeAnim(scene, 'pad', padKeys, 4);

  // laser gate
  tex(T, 'laser_post', 10, 34, (c) => {
    px(c, 2, 4, 6, 30, '#2a2a3c'); px(c, 0, 0, 10, 6, '#3c3c58'); px(c, 3, 2, 4, 2, PAL.red); px(c, 2, 33, 6, 1, PAL.electric);
  }, post(PAL.red));
  const lz = texFrames(T, 'laser', 2, 16, 6, (c, i) => {
    glow(c, 8, 3, 6, PAL.red, 0.6, 2); px(c, 0, 2, 16, 2, i ? '#ff9aa8' : PAL.red); px(c, 0, 2, 16, 1, '#fff');
  });
  makeAnim(scene, 'laser', lz, 14);

  // meeting-point hologram + pad
  tex(T, 'meet_pad', 72, 14, (c) => {
    px(c, 4, 6, 64, 8, '#1a1228'); px(c, 4, 6, 64, 2, PAL.pink); px(c, 8, 8, 56, 1, PAL.electric);
    c.globalAlpha = 0.3; px(c, 0, 4, 72, 6, PAL.pink); c.globalAlpha = 1;
  });
  const holoKeys = texFrames(T, 'meet_holo', 6, 64, 96, (c, i) => {
    for (let k = 0; k < 4; k++) {
      const t = ((i / 6) + k / 4) % 1, y = 90 - t * 86, rx = 24 - t * 8;
      c.strokeStyle = `rgba(255,114,198,${0.9 - t * 0.8})`; c.lineWidth = 1;
      c.beginPath(); c.ellipse(32, y, rx, rx * 0.28, 0, 0, Math.PI * 2); c.stroke();
    }
    glow(c, 32, 70, 22, PAL.pink, 0.25, 4);
    const w = textWidth('5 JULY', 1); drawText(c, '5 JULY', 32 - w / 2, 40, PAL.white, 1);
  });
  makeAnim(scene, 'meet_holo', holoKeys, 8);

  void makeCanvas; void rng;
}
