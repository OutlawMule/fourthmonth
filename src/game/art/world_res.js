// Residential street + rooftop props: houses (including Princess's house), picket
// fences, bins, hedges, the driveway, the arriving car and its headlight beam, rain and
// puddles, security floodlights, and the rooftop furniture (AC units, water tank,
// antenna, holographic displays, bench, memory gate).
import { PAL, mix, rgba } from './palette.js';
import { px, disc, glow, line, fillPoly, rng, neonSign, drawText, textWidth, inkAndRim } from './pixel.js';
import { tex, texFrames, makeAnim } from './common.js';

const WARM = ['#ffc857', '#ffb070', '#ffd9a0', '#ff9ad6'];

function windowLit(c, x, y, w, h, color, curtains = true) {
  px(c, x - 1, y - 1, w + 2, h + 2, '#0a0615');
  px(c, x, y, w, h, color);
  px(c, x, y, w, 1, mix(color, '#ffffff', 0.5));
  if (curtains) { px(c, x, y, 2, h, mix(color, '#7a3a8c', 0.5)); px(c, x + w - 2, y, 2, h, mix(color, '#7a3a8c', 0.5)); }
  px(c, x + (w >> 1), y, 1, h, '#0a0615'); px(c, x, y + (h >> 1), w, 1, '#0a0615');
}
function windowDark(c, x, y, w, h) { px(c, x - 1, y - 1, w + 2, h + 2, '#0a0615'); px(c, x, y, w, h, '#1d1038'); px(c, x, y, w, 1, '#3a2470'); px(c, x + 1, y + 2, 2, 1, '#5a3a9a'); }

function house(c, w, h, o) {
  const { wall = '#26144a', wallHi = '#341a66', roof = '#150a2e', roofHi = '#2a1456', seed = 1, door = '#0f0820', lit = 2 } = o;
  const r = rng(seed);
  const roofH = Math.round(h * 0.34);
  px(c, 0, roofH, w, h - roofH, wall);
  px(c, 0, roofH, w, 2, wallHi); px(c, w - 3, roofH, 3, h - roofH, '#1a0d33');
  for (let y = roofH + 8; y < h - 6; y += 6) px(c, 0, y, w, 1, 'rgba(0,0,0,0.12)');          // siding
  fillPoly(c, [[-4, roofH + 1], [w + 4, roofH + 1], [w - 14, 3], [14, 3]], roof);
  fillPoly(c, [[w * 0.55, roofH + 1], [w + 4, roofH + 1], [w - 14, 3], [w * 0.6, 3]], roofHi);
  px(c, -4, roofH, w + 8, 2, '#0a0615');
  px(c, w - 34, 0, 8, 12, '#150a2e');                                                        // chimney
  // windows
  const cols = Math.max(2, Math.floor((w - 40) / 40));
  for (let i = 0; i < cols; i++) {
    const x = 18 + i * Math.floor((w - 52) / Math.max(1, cols - 1)) - (cols === 1 ? 0 : 0);
    const isLit = r() < 0.25 + lit * 0.15;
    if (isLit) windowLit(c, x, roofH + 12, 16, 18, r.pick(WARM)); else windowDark(c, x, roofH + 12, 16, 18);
    if (h > 100 && Math.abs(x + 8 - w / 2) > 22) { if (r() < 0.4) windowLit(c, x, roofH + 40, 16, 16, r.pick(WARM), false); else windowDark(c, x, roofH + 40, 16, 16); }
  }
  // door + step
  const dx = Math.round(w * 0.5) - 8;
  px(c, dx - 2, h - 38, 20, 38, '#0a0615'); px(c, dx, h - 36, 16, 36, door); px(c, dx + 12, h - 20, 2, 2, PAL.warm);
  px(c, dx - 4, h - 3, 24, 3, '#3c3c58');
  px(c, dx + 2, h - 34, 12, 10, 'rgba(155,92,255,0.25)');
}

export function buildNeighborhood(scene) {
  const T = scene.textures;
  const post = (rim) => (cv) => inkAndRim(cv, { rim, rimStrength: 0.25 });

  tex(T, 'house_a', 150, 124, (c) => house(c, 150, 124, { seed: 11, lit: 1 }), post(PAL.lavender));
  tex(T, 'house_b', 126, 106, (c) => house(c, 126, 106, { seed: 23, wall: '#2a1850', lit: 0, door: '#150a2e' }), post(PAL.lavender));
  tex(T, 'house_c', 172, 132, (c) => house(c, 172, 132, { seed: 37, wall: '#221044', roof: '#1a0d33', lit: 2 }), post(PAL.lavender));

  // Princess's house: porch light, warm door glow, dark windows (everyone else is asleep)
  tex(T, 'house_her', 206, 138, (c) => {
    house(c, 206, 138, { seed: 5, wall: '#2e1a5c', wallHi: '#3c2478', lit: 0, door: '#150a2e' });
    const dx = 103 - 8;
    glow(c, dx + 8, 100, 22, PAL.warm, 0.35, 4);
    px(c, dx + 2, 102, 12, 36, '#3a1a63');
    px(c, dx + 3, 103, 10, 12, '#ffd9a0');       // lit door glass
    px(c, dx + 3, 103, 10, 1, '#ffffff');
    px(c, dx - 8, 96, 3, 5, '#ffe9b0'); glow(c, dx - 6, 98, 8, PAL.warm, 0.7, 3); // porch lamp
    px(c, dx + 24, 96, 3, 5, '#ffe9b0'); glow(c, dx + 25, 98, 8, PAL.warm, 0.7, 3);
    windowLit(c, 24, 54, 16, 18, '#ff9ad6');     // one upstairs light left on
    px(c, 160, 62, 24, 2, PAL.pink);              // small neon strip
    drawText(c, '12', dx + 3, 86, '#ffd9a0', 1);
  }, post(PAL.lavender));

  // fences, bin, hedge, mailbox, hydrant, driveway
  tex(T, 'fence_pick', 32, 24, (c) => {
    px(c, 0, 6, 32, 2, '#3c3c58'); px(c, 0, 16, 32, 2, '#3c3c58');
    for (let x = 1; x < 32; x += 5) { px(c, x, 2, 3, 22, '#cfc6e6'); px(c, x + 1, 0, 1, 2, '#cfc6e6'); px(c, x, 2, 1, 22, '#ffffff'); px(c, x + 2, 2, 1, 22, '#8a7fb0'); }
  }, post(PAL.lavender));
  tex(T, 'bin', 16, 22, (c) => {
    px(c, 1, 4, 14, 18, '#2f6b4a'); px(c, 0, 2, 16, 3, '#3f8a5f'); px(c, 1, 4, 14, 1, '#6fd0a0'); px(c, 3, 8, 1, 12, '#245038'); px(c, 12, 8, 1, 12, '#245038');
    px(c, 4, 12, 8, 4, '#1c3e2c'); px(c, 5, 13, 6, 2, PAL.blue);
  }, post('#5CFFB0'));
  tex(T, 'hedge', 44, 26, (c) => {
    const r = rng(2);
    px(c, 0, 8, 44, 18, '#16402f'); for (let i = 0; i < 9; i++) disc(c, 4 + i * 5, 9 + r.int(-1, 1), r.int(4, 6), '#1d5a3f');
    for (let i = 0; i < 8; i++) px(c, r.int(1, 42), r.int(4, 22), 1, 1, r.pick(['#2f8a63', PAL.pink, PAL.lavender]));
    px(c, 0, 24, 44, 2, '#0e2a20');
  });
  tex(T, 'mailbox', 12, 26, (c) => { px(c, 5, 10, 2, 16, '#3c3c58'); px(c, 1, 3, 10, 8, '#3a5cc0'); px(c, 1, 3, 10, 1, '#7aa0ff'); px(c, 9, 1, 2, 5, PAL.red); });
  tex(T, 'hydrant', 12, 16, (c) => { px(c, 2, 4, 8, 12, '#c0334d'); px(c, 1, 2, 10, 3, '#e0566f'); px(c, 4, 0, 4, 3, '#c0334d'); px(c, 0, 8, 12, 3, '#c0334d'); px(c, 2, 4, 1, 12, '#ff8aa0'); });
  tex(T, 'driveway', 140, 10, (c) => {
    px(c, 0, 0, 140, 10, '#4a4468'); px(c, 0, 0, 140, 2, '#6a6490'); px(c, 0, 0, 140, 1, '#9a94c0');
    for (let x = 22; x < 140; x += 22) px(c, x, 2, 1, 8, '#2a2644');
    px(c, 0, 8, 140, 2, '#1d1938'); glow(c, 70, 2, 40, PAL.warm, 0.15, 3);
  });

  // THE CAR that arrives in the driveway, and its beam
  tex(T, 'car_night', 84, 34, (c) => {
    fillPoly(c, [[2, 18], [82, 18], [83, 26], [80, 30], [4, 30], [1, 26]], '#1b1630');
    fillPoly(c, [[14, 18], [24, 6], [58, 6], [72, 18]], '#2a2250');
    fillPoly(c, [[20, 17], [27, 8], [40, 8], [40, 17]], '#0c0820'); fillPoly(c, [[43, 17], [43, 8], [56, 8], [66, 17]], '#0c0820');
    line(c, 26, 16, 32, 9, '#6f5aa8', 1); line(c, 46, 16, 50, 9, '#6f5aa8', 1);
    px(c, 70, 20, 11, 3, '#fff6d8'); px(c, 78, 20, 4, 3, '#ffffff'); px(c, 1, 20, 4, 3, PAL.red);
    px(c, 4, 25, 76, 1, PAL.electric); px(c, 4, 26, 76, 1, 'rgba(155,92,255,0.5)');
    for (const wx of [20, 62]) { disc(c, wx, 29, 6, '#0a0615'); disc(c, wx, 29, 3, PAL.chrome); px(c, wx, 29, 1, 1, '#555'); }
    px(c, 2, 31, 80, 1, 'rgba(155,92,255,0.45)'); px(c, 6, 32, 72, 1, 'rgba(155,92,255,0.2)');
    glow(c, 80, 21, 8, PAL.warm, 0.6, 3);
  }, post(PAL.lavender));
  tex(T, 'beam_h', 150, 60, (c) => {
    for (let x = 0; x < 150; x++) {
      const half = 3 + x * 0.19, a = 0.34 * Math.pow(1 - x / 150, 1.3);
      c.fillStyle = `rgba(255,240,200,${a})`;
      c.fillRect(x, Math.round(30 - half), 1, Math.round(half * 2));
    }
  });
  tex(T, 'door_open', 8, 26, (c) => { px(c, 0, 0, 3, 26, '#1b1630'); px(c, 3, 2, 3, 22, '#2a2250'); px(c, 1, 6, 1, 4, PAL.warm); });

  // rain + puddle ripples
  tex(T, 'rain_drop', 2, 7, (c) => { px(c, 1, 0, 1, 4, 'rgba(200,180,255,0.9)'); px(c, 1, 4, 1, 3, 'rgba(200,180,255,0.4)'); });
  const pud = texFrames(T, 'puddle', 4, 30, 6, (c, i) => {
    px(c, 2, 2, 26, 3, 'rgba(120,90,200,0.35)'); px(c, 2, 2, 26, 1, 'rgba(200,167,255,0.5)');
    c.strokeStyle = 'rgba(220,200,255,0.7)'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(15, 3, 3 + i * 3, 1 + i * 0.5, 0, 0, Math.PI * 2); c.stroke();
  });
  makeAnim(scene, 'puddle', pud, 5);

  // security floodlight (motion-sensor light) used as the neighborhood hazard
  tex(T, 'flood_post', 12, 72, (c) => {
    px(c, 5, 8, 2, 64, '#2a2a3c'); px(c, 2, 70, 8, 2, '#1a1a28'); px(c, 0, 2, 12, 7, '#3c3c58'); px(c, 1, 3, 10, 5, '#fff2c0'); px(c, 2, 3, 8, 1, '#ffffff'); px(c, 0, 8, 12, 1, '#1a1a28');
    glow(c, 6, 5, 8, PAL.warm, 0.5, 3);
  }, post(PAL.warm));
  const fb = texFrames(T, 'flood_beam', 2, 16, 8, (c, i) => {
    px(c, 0, 0, 16, 8, 'rgba(255,200,87,0.18)'); px(c, 4, 0, 8, 8, i ? 'rgba(255,220,130,0.7)' : 'rgba(255,200,87,0.55)'); px(c, 7, 0, 2, 8, '#fff6d8');
  });
  makeAnim(scene, 'flood_beam', fb, 10);

  // ---------------------------------------------------------------- rooftop
  tex(T, 'ac_unit', 34, 24, (c) => {
    px(c, 0, 4, 34, 20, '#3c3c58'); px(c, 0, 2, 34, 3, '#6c6c85'); px(c, 0, 2, 34, 1, '#b9b9cb');
    for (let x = 3; x < 31; x += 3) px(c, x, 8, 1, 14, '#1a1a28');
    disc(c, 26, 13, 5, '#2a2a3c'); px(c, 24, 12, 4, 2, PAL.blue);
  }, post(PAL.lavender));
  tex(T, 'tank', 40, 62, (c) => {
    px(c, 4, 14, 32, 34, '#4a4468'); px(c, 2, 10, 36, 6, '#6a6490'); px(c, 4, 14, 3, 34, '#7a74a0');
    for (let y = 20; y < 46; y += 7) px(c, 4, y, 32, 1, '#2a2644');
    px(c, 6, 48, 3, 14, '#2a2a3c'); px(c, 31, 48, 3, 14, '#2a2a3c'); px(c, 19, 4, 2, 8, '#2a2a3c'); px(c, 17, 3, 6, 2, PAL.red);
  }, post(PAL.lavender));
  const ant = texFrames(T, 'antenna', 4, 12, 70, (c, i) => {
    px(c, 5, 6, 2, 64, '#2a2a3c'); px(c, 1, 22, 10, 1, '#3c3c58'); px(c, 2, 34, 8, 1, '#3c3c58'); px(c, 3, 46, 6, 1, '#3c3c58');
    if (i < 2) { glow(c, 6, 4, 6, PAL.red, 0.8, 3); px(c, 5, 2, 3, 3, '#ff9aa8'); } else px(c, 5, 2, 3, 3, '#5a1a2a');
  });
  makeAnim(scene, 'antenna', ant, 1.4);
  const holo = texFrames(T, 'holo_roof', 4, 84, 52, (c, i) => {
    c.fillStyle = 'rgba(155,92,255,0.14)'; c.fillRect(0, 0, 84, 52);
    for (const [x, y, w, h] of [[0, 0, 84, 1], [0, 51, 84, 1], [0, 0, 1, 52], [83, 0, 1, 52]]) px(c, x, y, w, h, PAL.lavender);
    // city outline that "breathes"
    const heights = [14, 24, 18, 32, 22, 28, 16, 26, 12];
    heights.forEach((hh, k) => px(c, 6 + k * 8, 46 - hh - ((k + i) % 3), 6, hh + ((k + i) % 3), k % 2 ? PAL.pink : PAL.blue));
    drawText(c, 'LATE', 8, 6, PAL.white, 1);
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(1, 4 + i * 11, 82, 1);
  });
  makeAnim(scene, 'holo_roof', holo, 4);
  tex(T, 'roof_bench', 52, 26, (c) => {
    px(c, 3, 9, 46, 4, '#e0d6ff'); px(c, 3, 3, 46, 3, '#e0d6ff'); px(c, 3, 3, 46, 1, '#ffffff');
    px(c, 5, 6, 3, 14, '#3c3c58'); px(c, 44, 6, 3, 14, '#3c3c58'); px(c, 3, 13, 46, 1, PAL.pink); px(c, 6, 20, 4, 6, '#2a2a3c'); px(c, 42, 20, 4, 6, '#2a2a3c');
  }, post(PAL.pink));
  tex(T, 'roof_rail', 32, 18, (c) => {
    px(c, 0, 2, 32, 2, PAL.chrome); px(c, 0, 2, 32, 1, '#ffffff'); px(c, 0, 4, 32, 1, PAL.electric);
    for (const x of [1, 15, 29]) px(c, x, 2, 2, 16, '#3c3c58');
    px(c, 0, 9, 32, 1, 'rgba(185,185,203,0.5)');
  });
  tex(T, 'fire_escape', 76, 12, (c) => {
    px(c, 0, 0, 76, 3, '#3c3c58'); px(c, 0, 0, 76, 1, PAL.chrome);
    for (let x = 2; x < 76; x += 6) px(c, x, 3, 1, 5, '#2a2a3c');
    px(c, 0, 8, 76, 1, PAL.electric);
  });
  // memory gate: a holographic barrier that dissolves when enough memories are opened
  const gate = texFrames(T, 'gate_holo', 4, 14, 64, (c, i) => {
    px(c, 0, 0, 14, 64, 'rgba(67,217,255,0.12)');
    px(c, 0, 0, 2, 64, PAL.blue); px(c, 12, 0, 2, 64, PAL.pink);
    for (let y = (i * 4) % 8; y < 64; y += 8) px(c, 2, y, 10, 1, 'rgba(255,255,255,0.55)');
    for (let y = 4; y < 64; y += 16) { px(c, 5, y + (i % 2) * 2, 4, 4, PAL.lavender); }
    glow(c, 7, 32, 12, PAL.blue, 0.1, 2);
  });
  makeAnim(scene, 'gate_holo', gate, 6);
  tex(T, 'gate_post', 18, 18, (c) => { px(c, 2, 2, 14, 14, '#2a2a3c'); px(c, 4, 4, 10, 10, '#16161f'); px(c, 7, 7, 4, 4, PAL.blue); px(c, 2, 2, 14, 1, PAL.chrome); });

  const sign = (key, text, color, scale = 1) => { const cv = neonSign(text, color, { scale }); if (T.exists(key)) T.remove(key); T.addCanvas(key, cv); };
  sign('sign_city', 'CITY', PAL.blue, 2); sign('sign_late', 'OPEN LATE', PAL.pink, 1); sign('sign_roof', 'ROOF', PAL.lavender, 2);
  sign('sign_dawn', 'DAWN SOON', PAL.warm, 1);
  void rgba; void textWidth;
}
