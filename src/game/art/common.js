// Shared procedural textures: particles, collectibles, checkpoints, projectiles.
import { PAL, lighten, darken } from './palette.js';
import { makeCanvas, px, disc, glow, line } from './pixel.js';

/** Register a drawn canvas as a Phaser texture (replacing any previous one). */
export function tex(textures, key, w, h, draw, post) {
  const { canvas, ctx } = makeCanvas(w, h);
  draw(ctx, canvas, w, h);
  if (post) post(canvas);
  if (textures.exists(key)) textures.remove(key);
  textures.addCanvas(key, canvas);
  return canvas;
}

/** Register n frame textures `${key}_${i}`; returns the frame keys. */
export function texFrames(textures, key, n, w, h, draw, post) {
  const keys = [];
  for (let i = 0; i < n; i++) {
    const k = `${key}_${i}`;
    tex(textures, k, w, h, (ctx, cv) => draw(ctx, i, cv, w, h), post);
    keys.push(k);
  }
  return keys;
}

export function makeAnim(scene, key, frameKeys, frameRate = 8, repeat = -1) {
  if (scene.anims.exists(key)) scene.anims.remove(key);
  scene.anims.create({ key, frames: frameKeys.map((k) => ({ key: k })), frameRate, repeat });
}

export function buildCommon(scene) {
  const T = scene.textures;

  tex(T, 'px', 2, 2, (c) => px(c, 0, 0, 2, 2, '#ffffff'));
  tex(T, 'spark', 4, 4, (c) => { px(c, 1, 0, 2, 4, '#fff'); px(c, 0, 1, 4, 2, '#fff'); });
  tex(T, 'dot', 3, 3, (c) => { px(c, 0, 1, 3, 1, '#fff'); px(c, 1, 0, 1, 3, '#fff'); });
  tex(T, 'glow_lav', 48, 48, (c) => glow(c, 24, 24, 23, PAL.lavender, 0.9, 6));
  tex(T, 'glow_pink', 48, 48, (c) => glow(c, 24, 24, 23, PAL.pink, 0.9, 6));
  tex(T, 'glow_blue', 48, 48, (c) => glow(c, 24, 24, 23, PAL.blue, 0.9, 6));
  tex(T, 'glow_warm', 48, 48, (c) => glow(c, 24, 24, 23, PAL.warm, 0.9, 6));
  tex(T, 'cone_light', 64, 48, (c) => {
    for (let y = 0; y < 48; y++) {
      const w = 4 + y * 1.2, a = 0.28 * (1 - y / 48);
      c.fillStyle = `rgba(255,244,214,${a})`;
      c.fillRect(Math.round(32 - w / 2), y, Math.round(w), 1);
    }
  });

  // light chips (score pickups): a spinning diamond
  const chips = texFrames(T, 'chip', 4, 10, 10, (c, i) => {
    const w = [4, 3, 1, 3][i];
    for (let y = 0; y < 10; y++) {
      const half = Math.max(0, w - Math.abs(y - 5) * (w / 5));
      px(c, 5 - half, y, Math.max(1, half * 2), 1, i === 2 ? PAL.white : y < 5 ? PAL.blue : '#2aa5c4');
    }
    px(c, 4, 2, 1, 1, '#fff');
  });
  makeAnim(scene, 'chip', chips, 8);

  // memory fragments: a crystalline shard with an inner glow
  const frags = texFrames(T, 'frag', 6, 20, 26, (c, i) => {
    const pulse = 0.5 + 0.5 * Math.sin((i / 6) * Math.PI * 2);
    glow(c, 10, 13, 10, PAL.lavender, 0.5 + pulse * 0.4, 4);
    const pts = [[10, 1], [15, 8], [13, 20], [10, 24], [7, 20], [5, 8]];
    c.fillStyle = PAL.electric;
    c.beginPath(); pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
    px(c, 8, 6, 4, 12, PAL.lavender);
    px(c, 9, 4, 2, 4, PAL.white);
    px(c, 12, 10, 1, 6, PAL.pink);
    px(c, 7, 12 + (i % 3), 1, 2, PAL.white);
  });
  makeAnim(scene, 'frag', frags, 8);

  // heart pickup
  tex(T, 'heart_pick', 12, 12, (c) => {
    const p = ['.##..##.', '########', '########', '.######.', '..####..', '...##...'];
    p.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && px(c, 2 + x, 2 + y, 1, 1, y < 2 && x < 3 ? '#ffd0e8' : PAL.pink)));
  });

  // checkpoint beacon
  tex(T, 'beacon_off', 16, 36, (c) => {
    px(c, 7, 8, 2, 28, '#3C3C58'); px(c, 5, 32, 6, 4, '#2A2A3C');
    px(c, 4, 4, 8, 6, '#2A2A3C'); px(c, 6, 6, 4, 2, '#5A5A78');
  });
  const beacon = texFrames(T, 'beacon_on', 4, 16, 36, (c, i) => {
    glow(c, 8, 7, 8, PAL.pink, 0.4 + (i % 2) * 0.2, 3);
    px(c, 7, 8, 2, 28, '#3C3C58'); px(c, 5, 32, 6, 4, '#2A2A3C');
    px(c, 4, 4, 8, 6, '#2A2A3C'); px(c, 6, 5, 4, 4, i % 2 ? PAL.white : PAL.pink);
    px(c, 7, 8, 2, 24, i % 2 ? PAL.electric : '#6f3ec2');
  });
  makeAnim(scene, 'beacon_on', beacon, 6);

  // player projectiles
  const pulse = texFrames(T, 'pulse', 2, 12, 12, (c, i) => {
    glow(c, 6, 6, 6, PAL.pink, 0.8, 3); disc(c, 6, 6, 3 - i * 0, PAL.pink); disc(c, 6, 6, 2, PAL.white);
  });
  makeAnim(scene, 'pulse', pulse, 12);
  const burst = texFrames(T, 'burst', 2, 22, 22, (c, i) => {
    glow(c, 11, 11, 11, PAL.pink, 0.9, 4); disc(c, 11, 11, 6 - i, PAL.pink); disc(c, 11, 11, 4, PAL.lavender); disc(c, 11, 11, 2, PAL.white);
  });
  makeAnim(scene, 'burst', burst, 12);
  tex(T, 'slash', 24, 16, (c) => {
    line(c, 2, 14, 22, 2, PAL.lavender, 1); line(c, 3, 13, 21, 3, PAL.white, 1); line(c, 4, 15, 22, 4, PAL.electric, 1);
  });

  // generic particle squares in palette colours
  for (const [k, col] of Object.entries({ p_lav: PAL.lavender, p_pink: PAL.pink, p_blue: PAL.blue, p_vio: PAL.electric, p_white: '#ffffff', p_warm: PAL.warm })) {
    tex(T, k, 2, 2, (c) => px(c, 0, 0, 2, 2, col));
  }
  void lighten; void darken;
}
