// Stage 03 - After Everyone Else Is Asleep (residential street at night). Quiet, with
// garden walls, bins and parked cars to hop over, a few motion-sensor floodlights, and
// the driveway meeting point outside her house.
const GY = 214;
const ground = (x0, x1) => ({ kind: 'ground', x: x0, y: GY, w: x1 - x0, h: 56 });
const ledge = (x, y, w, hidden = false) => ({ kind: 'ledge', x, y, w, hidden });
const wall = (x, y, w) => ({ kind: 'wall', x, y, w, h: GY - y + 56 });

export const STAGE3 = {
  id: 'stage3',
  world: { w: 2900, h: 270 },
  theme: 'res',
  spawn: { x: 48, y: GY },
  bg: {
    sky: 'bg_sky_res',
    layers: [
      { key: 'bg_far_res', f: 0.1, depth: -90 },
      { key: 'bg_mid_res', f: 0.3, depth: -80 },
    ],
    flyers: false,
  },
  platforms: [
    ground(0, 2900),
    // garden walls and recycling stacks to hop over
    wall(520, 178, 56), wall(1020, 172, 60), wall(1560, 178, 56), wall(2060, 176, 60),
    // parked-car roofs (hidden platforms under the car props)
    ledge(300, 193, 52, true), ledge(1330, 193, 52, true), ledge(1840, 193, 52, true),
    // garage roof steps: "The streetlight hum" (bonus)
    ledge(700, 168, 70), ledge(790, 124, 80),
    // porch roof by the driveway: "The driveway" (bonus)
    ledge(2230, 168, 64), ledge(2310, 126, 80),
  ],
  fragments: [
    { key: 'streetlight', x: 836, y: 100 },
    { key: 'driveway', x: 2350, y: 102 },
  ],
  enemies: [
    { id: 'ns1', type: 'drone', x: 1220, y: 140, patrol: [1100, 1450] },
    { id: 'ns2', type: 'drone', x: 1980, y: 140, patrol: [1860, 2180] },
  ],
  chips: [
    { x: 140, y: 196 }, { x: 166, y: 196 }, { x: 192, y: 196 },
    { x: 310, y: 172 }, { x: 330, y: 172 },
    { x: 532, y: 156 }, { x: 548, y: 156 },
    { x: 720, y: 146 }, { x: 812, y: 104 },
    { x: 1040, y: 150 }, { x: 1056, y: 150 },
    { x: 1342, y: 172 }, { x: 1362, y: 172 },
    { x: 1580, y: 156 },
    { x: 1850, y: 172 }, { x: 1870, y: 172 },
    { x: 2080, y: 154 },
    { x: 2250, y: 146 }, { x: 2330, y: 104 },
    { x: 2600, y: 196 },
  ],
  hearts: [{ x: 640, y: 196 }, { x: 1700, y: 196 }],
  checkpoints: [{ x: 900, y: GY }, { x: 1780, y: GY }],
  hazards: [
    { type: 'flood', x: 620, y: GY, post: 70, w: 54, onMs: 1500, offMs: 2100, phase: 300 },
    { type: 'flood', x: 1180, y: GY, post: 70, w: 54, onMs: 1500, offMs: 2100, phase: 1400 },
    { type: 'flood', x: 1680, y: GY, post: 70, w: 54, onMs: 1500, offMs: 2100, phase: 900 },
  ],
  pads: [],
  kickers: [],
  anchors: { driveway: { x: 2480, y: GY }, house: { x: 2700, y: GY } },
  decor: buildDecor(),
};

function buildDecor() {
  const d = [];
  const add = (o) => d.push(o);
  // street lights (the first is the humming one)
  for (const x of [120, 430, 880, 1260, 1620, 1960, 2300, 2620, 2840]) {
    add({ tex: 'pole', x, y: GY, depth: 3, glow: 'glow_lav', gx: 4, gy: 76, gscale: 2.2, galpha: 0.42, flicker: true });
  }
  // houses along the far side of the street
  const houses = [[10, 'house_a'], [250, 'house_b'], [520, 'house_c'], [790, 'house_a'], [1060, 'house_b'], [1330, 'house_c'], [1640, 'house_a'], [1900, 'house_b'], [2180, 'house_c']];
  for (const [x, t] of houses) add({ tex: t, x: x + 80, y: GY - 14, depth: -6, ox: 0.5, alpha: 0.95 });
  add({ tex: 'house_her', x: 2720, y: GY - 12, depth: -6 });
  // fences, hedges and street furniture
  for (let x = 20; x < 2560; x += 190) add({ tex: 'fence_pick', x, y: GY - 2, depth: -1 });
  for (const x of [200, 880, 1500, 2150]) add({ tex: 'hedge', x, y: GY, depth: 1 });
  for (const x of [90, 470, 1150, 1450, 2040]) add({ tex: 'bin', x, y: GY, depth: 1 });
  for (const x of [380, 980, 1700]) add({ tex: 'mailbox', x, y: GY, depth: 1 });
  for (const x of [610, 1790]) add({ tex: 'hydrant', x, y: GY, depth: 1 });
  // parked cars the character can hop onto
  for (const [x, t] of [[326, 'car_b'], [1356, 'car_d'], [1866, 'car_a']]) add({ tex: t, x, y: GY - 1, depth: 1 });
  // garden walls get hedges on top
  for (const [x, w] of [[520, 56], [1020, 60], [1560, 56], [2060, 60]]) add({ tex: 'hedge', x: x + w / 2, y: 180, depth: 3, scale: 0.9 });
  // driveway at the end of the street
  add({ tex: 'driveway', x: 2540, y: GY + 4, depth: 0 });
  add({ tex: 'sign_home', x: 2640, y: 120, oy: 0.5, depth: -2 });
  return d;
}

export const STAGE3_META = {
  intro: 'Late. The street has gone quiet and the porch lights are low.',
  hint: 'Cross the neighborhood and wait at the driveway outside her house.',
};
