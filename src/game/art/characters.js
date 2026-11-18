// Draws Big Boss Mule and Princess from the shared rig. They are two distinct designs
// (build, skin tone, hair, outfit, accessories, silhouette) - not a recolor.
import { PAL, SKIN } from './palette.js';
import { px, line, disc, glow, fillPoly, Atlas, inkAndRim, ART } from './pixel.js';
import { FRAME, skeleton, animCatalogue } from './rig.js';

const r = Math.round;
export const BUILD = { mule: { torso: 12 }, princess: { torso: 11 } };

function limb(ctx, a, e, h, t, upper, lower) {
  line(ctx, a[0], a[1], e[0], e[1], upper, t);
  line(ctx, e[0], e[1], h[0], h[1], lower, Math.max(2, t - 1));
}

function leg(ctx, hip, l, o) {
  line(ctx, hip[0], hip[1], l.k[0], l.k[1], o.thigh, o.t);
  line(ctx, l.k[0], l.k[1], l.f[0], l.f[1] - 2, o.shin, Math.max(2, o.t - (o.taper ?? 1)));
  if (o.knee) o.knee(ctx, l.k);
  // shoe
  const [fx, fy] = l.f;
  px(ctx, fx - 1, fy - 2, 6, 3, o.shoe);
  px(ctx, fx - 1, fy, 6, 1, o.sole);
  px(ctx, fx + 2, fy - 2, 2, 1, o.shoeHi);
}

// ------------------------------------------------------------------ shared face
function face(ctx, C, skin, expr, who) {
  const [cx, cy] = C;
  px(ctx, cx - 4, cy - 5, 8, 10, skin.base);
  px(ctx, cx - 5, cy - 4, 10, 8, skin.base);
  px(ctx, cx - 4, cy + 4, 8, 1, skin.shade);
  px(ctx, cx - 5, cy + 1, 1, 3, skin.shade);
  px(ctx, cx + 3, cy - 1, 1, 2, skin.light);
  px(ctx, cx + 5, cy, 1, 2, skin.light); // nose in profile
  const dark = who === 'mule' ? '#120a08' : '#1a0f12';
  const white = '#F4EEFF';
  const big = who === 'princess';
  const eye = (dx, dy, w = 2, h = 1) => px(ctx, cx + dx, cy + dy, w, h, white);
  switch (expr) {
    case 'wide':
      px(ctx, cx + 1, cy - 1, 3, 3, white); px(ctx, cx + 3, cy, 1, 1, dark);
      px(ctx, cx + 1, cy - 3, 3, 1, dark);
      px(ctx, cx + 3, cy + 3, 2, 2, dark);
      break;
    case 'hurt':
      px(ctx, cx + 2, cy, 3, 1, dark); px(ctx, cx + 1, cy - 2, 3, 1, dark);
      px(ctx, cx + 3, cy + 3, 2, 2, dark);
      break;
    case 'nervous':
      eye(2, big ? -1 : 0, 2, big ? 2 : 1); px(ctx, cx + 2, cy + (big ? 0 : 0), 1, 1, dark);
      px(ctx, cx + 1, cy - 3, 3, 1, dark);
      px(ctx, cx + 3, cy + 3, 1, 1, dark); px(ctx, cx + 4, cy + 4, 1, 1, dark);
      break;
    case 'smile':
      eye(2, big ? -1 : 0, 2, big ? 2 : 1); px(ctx, cx + 3, cy + (big ? 0 : 0), 1, 1, dark);
      px(ctx, cx + 1, cy - (big ? 2 : 2), 3, 1, dark);
      px(ctx, cx + 2, cy + 3, 3, 1, who === 'mule' ? '#7a3a4a' : '#E0568F'); px(ctx, cx + 5, cy + 2, 1, 1, dark);
      break;
    case 'determined':
      eye(2, big ? -1 : 0, 2, big ? 2 : 1); px(ctx, cx + 3, cy, 1, 1, dark);
      px(ctx, cx + 1, cy - 3, 1, 1, dark); px(ctx, cx + 2, cy - 2, 2, 1, dark);
      px(ctx, cx + 3, cy + 3, 2, 1, who === 'mule' ? '#1a0e0a' : '#E0568F');
      break;
    default:
      eye(2, big ? -1 : 0, 2, big ? 2 : 1); px(ctx, cx + 3, cy, 1, 1, dark);
      if (big) px(ctx, cx + 4, cy - 2, 1, 1, dark); // lash
      px(ctx, cx + 1, cy - 2, 3, 1, dark);
      px(ctx, cx + 3, cy + 3, 2, 1, who === 'mule' ? '#1a0e0a' : '#E0568F');
  }
}

// ----------------------------------------------------------------------------- board
function board(ctx, H, b) {
  const cx = H[0], cy = H[1] + b.dy;
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  line(ctx, cx - c * 9, cy - s * 9, cx + c * 9, cy + s * 9, '#1B1B2A', 2);
  line(ctx, cx - c * 9, cy - s * 9 + 1, cx + c * 9, cy + s * 9 + 1, PAL.electric, 1);
  for (const along of [-6, 6]) {
    const wx = cx + along * c - s * 2.6, wy = cy + along * s + c * 2.6;
    px(ctx, wx - 1, wy - 1, 2, 2, PAL.chrome);
    px(ctx, wx - 1, wy + 0, 2, 1, PAL.pink);
  }
}

// ------------------------------------------------------------------------------- Mule
const M = {
  jacket: '#16161F', jacketLo: '#0E0E16', jacketHi: '#2A2A40', steel: '#3C3C58', pants: '#101018', pantsLo: '#0A0A10',
  hair: '#0A0A10', hairHi: '#2B2B3D', braidA: '#0A0A10', braidB: '#24243A', glove: '#0E0E16',
};

export function drawMule(ctx, pose) {
  const sk = skeleton(pose, BUILD.mule);
  const { H, N, C, S } = sk;
  const skin = SKIN.mule;

  if (pose.board) board(ctx, H, { ...pose.board, dy: pose.board.dy });
  else if (pose.carry) {
    line(ctx, S[0] - 5, S[1] - 4, H[0] - 5, H[1] + 4, '#1B1B2A', 2);
    px(ctx, H[0] - 5, H[1] + 4, 2, 2, PAL.chrome);
    px(ctx, S[0] - 6, S[1] - 5, 2, 2, PAL.chrome);
    line(ctx, S[0] - 4, S[1] - 3, H[0] - 4, H[1] + 3, PAL.electric, 1);
  }

  // back arm (skin + fingerless glove)
  limb(ctx, [S[0] - 1, S[1]], sk.armB.e, sk.armB.h, 3, M.jacketLo, skin.shade);
  px(ctx, sk.armB.h[0] - 1, sk.armB.h[1] - 1, 3, 3, M.glove);

  const legOpts = (back) => ({
    thigh: back ? M.pantsLo : M.pants, shin: back ? M.pantsLo : M.pants, t: 4, taper: 1,
    shoe: '#0C0C12', sole: PAL.electric, shoeHi: '#3C3C58',
    knee: (c, k) => { px(c, k[0] - 1, k[1] - 1, 3, 3, M.steel); px(c, k[0] - 1, k[1] + 1, 3, 1, PAL.electric); },
  });
  leg(ctx, [H[0] - 1, H[1]], sk.legB, legOpts(true));

  // torso
  fillPoly(ctx, [[N[0] - 5, N[1] + 1], [N[0] + 5, N[1] + 1], [H[0] + 4, H[1]], [H[0] - 4, H[1]]], M.jacket);
  fillPoly(ctx, [[N[0] + 2, N[1] + 1], [N[0] + 5, N[1] + 1], [H[0] + 4, H[1]], [H[0] + 2, H[1]]], M.jacketHi);
  line(ctx, N[0], N[1] + 3, H[0] + 1, H[1] - 3, PAL.electric, 1); // neon seam
  px(ctx, H[0] - 4, H[1] - 2, 9, 2, '#08080D');
  px(ctx, H[0] + 1, H[1] - 2, 2, 2, PAL.electric);
  px(ctx, N[0] - 1, N[1] - 1, 3, 3, skin.shade); // neck

  leg(ctx, [H[0] + 1, H[1]], sk.legF, legOpts(false));
  // pelvis cover
  px(ctx, H[0] - 4, H[1] - 1, 8, 4, M.pants);

  // braids hang behind the head and over the shoulder
  [[-8, 11], [-6, 13], [-4, 10]].forEach(([dx, len], k) => {
    for (let j = 0; j < len; j++) {
      const sw = r((pose.sway * j) / len);
      px(ctx, C[0] + dx + sw, C[1] + 1 + j, 2, 1, (j + k) % 2 ? M.braidB : M.braidA);
    }
  });

  // head
  face(ctx, C, skin, pose.expr, 'mule');
  px(ctx, C[0] - 5, C[1] - 6, 9, 2, M.hair);
  px(ctx, C[0] - 6, C[1] - 5, 4, 8, M.hair);
  px(ctx, C[0] + 2, C[1] - 5, 3, 1, M.hair);
  px(ctx, C[0] - 3, C[1] - 6, 3, 1, M.hairHi);
  px(ctx, C[0] - 2, C[1], 2, 3, PAL.chrome);     // cybernetic ear unit
  px(ctx, C[0] - 2, C[1] + 1, 1, 1, PAL.electric);

  // shoulder armor + front arm (chrome cyber forearm)
  px(ctx, S[0] - 3, S[1] - 2, 7, 4, M.steel);
  px(ctx, S[0] - 3, S[1] - 2, 7, 1, PAL.chrome);
  px(ctx, S[0] - 3, S[1] + 1, 7, 1, PAL.electric);
  limb(ctx, [S[0], S[1]], sk.armF.e, sk.armF.h, 4, M.jacket, PAL.chrome);
  line(ctx, sk.armF.e[0], sk.armF.e[1], sk.armF.h[0], sk.armF.h[1], PAL.electric, 1);
  px(ctx, sk.armF.h[0] - 1, sk.armF.h[1] - 1, 4, 3, M.glove);
  px(ctx, sk.armF.h[0] + 1, sk.armF.h[1] - 1, 2, 1, skin.light);
}

// --------------------------------------------------------------------------- Princess
const Q = {
  jacket: '#5B2BA8', jacketHi: '#7C45D6', tank: '#14141F', skirt: '#1B1030', skirtHi: '#2A1850', boot: '#14141F',
  hair: '#17101F', hairHi: '#3A2552', tie: PAL.pink,
};

export function drawPrincess(ctx, pose) {
  const sk = skeleton(pose, BUILD.princess);
  const { H, N, C, S } = sk;
  const skin = SKIN.princess;

  // back arm
  limb(ctx, [S[0] - 1, S[1]], sk.armB.e, sk.armB.h, 3, '#43207F', skin.shade);
  px(ctx, sk.armB.h[0] - 1, sk.armB.h[1] - 1, 2, 3, skin.shade);

  const legOpts = (back) => ({
    thigh: back ? skin.shade : skin.base, shin: Q.boot, t: 3, taper: 0,
    shoe: Q.boot, sole: PAL.lavender, shoeHi: PAL.pink,
    knee: (c, k) => { px(c, k[0] - 1, k[1], 3, 1, PAL.pink); },
  });
  leg(ctx, [H[0] - 1, H[1]], sk.legB, legOpts(true));

  // torso: tank + cropped jacket
  fillPoly(ctx, [[N[0] - 4, N[1] + 1], [N[0] + 3, N[1] + 1], [H[0] + 3, H[1] - 1], [H[0] - 3, H[1] - 1]], Q.tank);
  fillPoly(ctx, [[N[0] - 4, N[1] + 1], [N[0] + 4, N[1] + 1], [N[0] + 3, N[1] + 7], [N[0] - 3, N[1] + 7]], Q.jacket);
  px(ctx, N[0] + 1, N[1] + 2, 2, 5, Q.jacketHi);
  px(ctx, N[0] - 3, N[1] + 7, 7, 1, PAL.pink);              // jacket hem trim
  px(ctx, N[0] + 2, N[1] + 1, 1, 6, PAL.lavender);           // zip
  px(ctx, N[0] - 1, N[1] - 1, 3, 3, skin.shade);             // neck

  leg(ctx, [H[0] + 1, H[1]], sk.legF, legOpts(false));

  // pleated skirt (flares while running)
  const fl = pose.skirt;
  fillPoly(ctx, [[H[0] - 4, H[1] - 2], [H[0] + 4, H[1] - 2], [H[0] + 6 + fl, H[1] + 4], [H[0] - 6 - fl, H[1] + 4]], Q.skirt);
  px(ctx, H[0] - 2, H[1], 1, 4, Q.skirtHi); px(ctx, H[0] + 1, H[1], 1, 4, Q.skirtHi); px(ctx, H[0] + 4, H[1], 1, 3, Q.skirtHi);
  px(ctx, H[0] - 6 - fl, H[1] + 4, 12 + fl * 2, 1, PAL.electric);

  // hair behind the head: curly mass + puff
  px(ctx, C[0] - 7, C[1] - 4, 4, 11, Q.hair);
  px(ctx, C[0] - 8, C[1] - 1, 2, 7, Q.hair);
  px(ctx, C[0] - 7 + (pose.sway > 0 ? 1 : 0), C[1] + 7, 3, 2, Q.hair);
  disc(ctx, C[0] - 3, C[1] - 9, 4, Q.hair);
  px(ctx, C[0] - 5, C[1] - 11, 3, 2, Q.hairHi);
  px(ctx, C[0] - 5, C[1] - 6, 4, 1, Q.tie);                  // scrunchie

  face(ctx, C, skin, pose.expr, 'princess');
  px(ctx, C[0] - 5, C[1] - 6, 10, 2, Q.hair);                 // hair over forehead
  px(ctx, C[0] - 1, C[1] - 5, 6, 2, Q.hair);                  // bangs
  px(ctx, C[0] + 4, C[1] - 4, 1, 1, Q.hair);
  px(ctx, C[0] - 2, C[1] + 1, 2, 2, PAL.chrome);              // ear cuff
  px(ctx, C[0] - 2, C[1] + 1, 1, 1, PAL.pink);
  px(ctx, C[0], C[1] - 1, 1, 1, PAL.pink);                    // AR lens glint

  // front arm: violet sleeve, bare forearm, pink wristband
  limb(ctx, [S[0], S[1]], sk.armF.e, sk.armF.h, 3, Q.jacket, skin.base);
  px(ctx, sk.armF.h[0] - 1, sk.armF.h[1] - 1, 3, 3, skin.base);
  px(ctx, sk.armF.e[0], sk.armF.e[1], 1, 1, PAL.pink);
}

// ------------------------------------------------------------------------------- fx
function drawFx(ctx, pose, sk) {
  const f = pose.fx;
  if (!f) return;
  const [sx, sy] = sk.S;
  if (f.type === 'arc') {
    const x = sx + f.x, y = sy + f.y;
    line(ctx, x - 7, y - (f.big ? 7 : 3), x - 1, y - (f.big ? 3 : 1), PAL.lavender, 1);
    line(ctx, x - 6, y + (f.big ? 4 : 2), x - 1, y + 1, PAL.electric, 1);
    px(ctx, x, y - 2, 3, 5, PAL.white);
    px(ctx, x + 2, y - 1, 2, 3, PAL.lavender);
  } else if (f.type === 'orb') {
    const [hx, hy] = sk.armF.h;
    glow(ctx, hx, hy, 6, PAL.pink, 0.9, 3);
    disc(ctx, hx, hy, 2, PAL.white);
  } else if (f.type === 'burst') {
    const x = sx + f.x, y = sy + f.y;
    glow(ctx, x, y, 7, PAL.pink, 0.9, 3);
    disc(ctx, x, y, 3, PAL.white);
    line(ctx, x - 8, y - 4, x - 3, y - 1, PAL.lavender, 1);
    line(ctx, x - 8, y + 4, x - 3, y + 1, PAL.lavender, 1);
  } else if (f.type === 'sweat') {
    px(ctx, sk.C[0] - 7, sk.C[1] - 4, 2, 3, '#9FE8FF');
    px(ctx, sk.C[0] - 7, sk.C[1] - 4, 1, 1, '#FFFFFF');
  }
}

// ------------------------------------------------------------------------------ atlas
export function buildCharacterAtlas(key) {
  const atlas = new Atlas(key, FRAME, FRAME, 16);
  const drawFn = key === 'mule' ? drawMule : drawPrincess;
  const rim = key === 'mule' ? PAL.electric : PAL.pink;
  for (const a of animCatalogue(key)) {
    for (let i = 0; i < a.n; i++) {
      const pose = a.pose(i);
      atlas.add(
        `${a.name}_${i}`,
        (ctx) => drawFn(ctx, pose),
        (cv) => {
          inkAndRim(cv, { rim, rimStrength: 0.55 });
          drawFx(cv.getContext('2d'), pose, skeleton(pose, BUILD[key]));
        },
      );
    }
  }
  ART.set(atlas);
  return atlas;
}

export function characterAnimDefs(key) {
  return animCatalogue(key).map((a) => ({
    key: `${key}:${a.name}`,
    frames: Array.from({ length: a.n }, (_, i) => ({ key, frame: `${a.name}_${i}` })),
    frameRate: a.rate,
    repeat: a.repeat,
  }));
}
