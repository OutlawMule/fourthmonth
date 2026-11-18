// "Lightwork": the obstacles that interrupt the characters' time together.
// Walker = a lamp-headed work droid with a baton. Drone = a hovering lamp-eye.
import { PAL } from './palette.js';
import { px, disc, glow, line, inkAndRim, rng } from './pixel.js';
import { texFrames, makeAnim } from './common.js';

const W = 28, H = 28;

function walkerBody(c, o = {}) {
  const { bob = 0, legA = 0, legB = 0, lamp = PAL.blue, lampCore = '#ffffff', arm = 'down', hot = 0, lean = 0 } = o;
  const x = 14 + lean;
  // legs
  px(c, x - 5, 22 + bob, 4, 4 + legA, '#1C1C2A'); px(c, x - 6, 26 + legA, 6, 2, '#0C0C12');
  px(c, x + 1, 22 + bob, 4, 4 + legB, '#1C1C2A'); px(c, x, 26 + legB, 6, 2, '#0C0C12');
  // body
  px(c, x - 6, 12 + bob, 12, 11, '#2A2A3C');
  px(c, x - 6, 12 + bob, 12, 2, '#3C3C58');
  px(c, x - 4, 15 + bob, 8, 5, '#16161F');
  px(c, x - 3, 16 + bob, 2, 2, lamp); px(c, x + 1, 16 + bob, 3, 1, PAL.pink);
  // neck + lamp head
  px(c, x - 3, 11 + bob, 6, 2, PAL.chrome);
  if (hot) glow(c, x, 7 + bob, 11, lamp, 0.9, 4); else glow(c, x, 7 + bob, 9, lamp, 0.45, 3);
  disc(c, x, 7 + bob, 5, lamp);
  disc(c, x, 7 + bob, 3, lampCore);
  px(c, x - 3, 4 + bob, 2, 1, '#ffffff');
  // arm + baton
  if (arm === 'down') { line(c, x + 6, 14 + bob, x + 9, 19 + bob, '#3C3C58', 3); line(c, x + 9, 19 + bob, x + 10, 14 + bob, PAL.chrome, 2); }
  else if (arm === 'up') { line(c, x + 6, 14 + bob, x + 8, 8 + bob, '#3C3C58', 3); line(c, x + 8, 8 + bob, x + 6, 0 + bob, PAL.chrome, 2); px(c, x + 5, 0, 3, 2, PAL.pink); }
  else { line(c, x + 6, 14 + bob, x + 12, 16 + bob, '#3C3C58', 3); line(c, x + 12, 16 + bob, x + 15, 11 + bob, PAL.chrome, 2); px(c, x + 14, 9 + bob, 3, 3, PAL.pink); }
}

function drone(c, o = {}) {
  const { rot = 0, lamp = PAL.pink, dive = false, hot = 0 } = o;
  const cx = 12, cy = dive ? 8 : 9;
  if (dive) for (let y = 0; y < 8; y++) { c.fillStyle = `rgba(255,114,198,${0.25 - y * 0.025})`; c.fillRect(cx - 2 - y, cy + 6 + y, 5 + y * 2, 1); }
  px(c, cx - 10, cy - 5, 8, 1, rot ? PAL.chrome : '#6C6C85'); px(c, cx + 3, cy - 5, 8, 1, rot ? '#6C6C85' : PAL.chrome);
  px(c, cx - 1, cy - 5, 2, 3, '#3C3C58');
  px(c, cx - 8, cy - 2, 16, 9, '#2A2A3C'); px(c, cx - 8, cy - 2, 16, 2, '#3C3C58');
  px(c, cx - 6, cy + 5, 12, 2, '#16161F');
  if (hot) glow(c, cx, cy + 2, 9, lamp, 0.9, 3);
  disc(c, cx, cy + 2, 3, lamp); disc(c, cx, cy + 2, 1, '#fff');
  px(c, cx + 6, cy, 2, 2, PAL.blue);
}

export function buildEnemies(scene) {
  const T = scene.textures;
  const post = (cv) => inkAndRim(cv, { rim: PAL.blue, rimStrength: 0.35 });
  const set = (key, n, draw, rate, repeat = -1) => {
    const keys = texFrames(T, key, n, W, H, draw, post);
    makeAnim(scene, key, keys, rate, repeat);
    return keys;
  };

  set('lw_idle', 2, (c, i) => walkerBody(c, { bob: i }), 3);
  set('lw_walk', 4, (c, i) => walkerBody(c, { bob: i % 2, legA: i === 1 ? -1 : 0, legB: i === 3 ? -1 : 0 }), 6);
  set('lw_windup', 1, (c) => walkerBody(c, { arm: 'up', hot: 1, lampCore: '#ffe9f6', lamp: PAL.pink, lean: -1 }), 1, 0);
  set('lw_strike', 1, (c) => walkerBody(c, { arm: 'out', hot: 1, lamp: PAL.pink, lean: 2 }), 1, 0);
  set('lw_hurt', 1, (c) => walkerBody(c, { lamp: PAL.red, lampCore: '#ffb0b8', lean: -2 }), 1, 0);
  const dieFrames = (key, base) => {
    const keys = texFrames(T, key, 4, W, H, (c, i) => {
      const r = rng(9 + i);
      const t = (i + 1) / 4;
      for (let k = 0; k < 26 - i * 4; k++) {
        const ang = r() * Math.PI * 2, dist = 2 + t * 12 * r();
        const col = r() < 0.4 ? PAL.blue : r() < 0.5 ? '#3C3C58' : PAL.lavender;
        c.globalAlpha = 1 - t * 0.7;
        px(c, 14 + Math.cos(ang) * dist, base + Math.sin(ang) * dist * 0.8, 2, 2, col);
      }
      c.globalAlpha = 1;
      if (i < 2) glow(c, 14, base, 9 - i * 3, PAL.blue, 0.8, 3);
    });
    makeAnim(scene, key, keys, 10, 0);
  };
  dieFrames('lw_die', 14);

  set('drone_hover', 2, (c, i) => drone(c, { rot: i }), 10);
  set('drone_dive', 1, (c) => drone(c, { dive: true, hot: 1 }), 1, 0);
  set('drone_hurt', 1, (c) => drone(c, { lamp: PAL.red }), 1, 0);
  dieFrames('drone_die', 11);
}
