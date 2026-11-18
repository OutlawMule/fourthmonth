// Stage 01 - The Night Our Worlds Collided (drag-racing district).
// Pure data (no Phaser): the scene reads it, the tests check that both characters can
// reach every required spot. Ground surface is y = 214; the world is 270 px tall.
const GY = 214;

const ground = (x0, x1) => ({ kind: 'ground', x: x0, y: GY, w: x1 - x0, h: 56 });
const ledge = (x, y, w) => ({ kind: 'ledge', x, y, w });

// Gaps between ground sections are 66 px: every character clears them at walking speed.
export const STAGE1 = {
  id: 'stage1',
  world: { w: 3000, h: 270 },
  theme: 'drag',
  spawn: { x: 48, y: GY },
  bg: {
    sky: 'bg_sky_drag',
    layers: [
      { key: 'bg_far_drag_0', alt: 'bg_far_drag_1', f: 0.12, depth: -90 },
      { key: 'bg_mid_drag_0', alt: 'bg_mid_drag_1', f: 0.3, depth: -80 },
    ],
    flyers: true,
  },
  platforms: [
    ground(0, 720), ground(786, 1190), ground(1256, 1720), ground(1786, 2270), ground(2336, 3000),
    // stairs up to "She rushed to me."
    ledge(860, 166, 64), ledge(944, 122, 64),
    // over the pit between the second and third section: "So cool. So nervous." (bonus)
    ledge(1170, 164, 106),
    // high ledge above the bounce pad
    ledge(1090, 130, 70),
    // high road above the traffic
    ledge(1500, 168, 70),
    // grind rail (Mule gets speed and points; everyone else just stands on it)
    { kind: 'rail', x: 1340, y: 194, w: 130 },
    { kind: 'rail', x: 1690, y: 190, w: 130 },
    // section D tower: "Home too early." (bonus)
    ledge(1880, 170, 70), ledge(1960, 128, 70),
    // before the final laser: "The thumb."
    ledge(2490, 162, 84),
  ],
  fragments: [
    { key: 'froze', x: 300, y: 188 },
    { key: 'rush', x: 976, y: 100 },
    { key: 'thumb', x: 2532, y: 138 },
    { key: 'cool', x: 1224, y: 140 },
    { key: 'early', x: 2000, y: 106 },
  ],
  enemies: [
    { id: 'lw1', type: 'walker', x: 540, y: GY, patrol: [440, 650] },
    { id: 'lw2', type: 'walker', x: 1000, y: GY, patrol: [900, 1120] },
    { id: 'lw3', type: 'drone', x: 1400, y: 140, patrol: [1300, 1580] },
    { id: 'lw4', type: 'walker', x: 2020, y: GY, patrol: [1900, 2090] },
    { id: 'lw5', type: 'drone', x: 2640, y: 150, patrol: [2520, 2740] },
  ],
  chips: [
    { x: 200, y: 196 }, { x: 226, y: 196 }, { x: 252, y: 196 },
    { x: 380, y: 160 }, { x: 396, y: 150 }, { x: 412, y: 160 },
    { x: 745, y: 168 }, { x: 753, y: 162 }, { x: 761, y: 168 },
    { x: 880, y: 148 }, { x: 960, y: 104 },
    { x: 1100, y: 108 }, { x: 1124, y: 108 }, { x: 1148, y: 108 },
    { x: 1360, y: 176 }, { x: 1390, y: 176 }, { x: 1420, y: 176 }, { x: 1450, y: 176 },
    { x: 1520, y: 148 }, { x: 1545, y: 148 },
    { x: 1740, y: 172 }, { x: 1760, y: 172 },
    { x: 1900, y: 150 }, { x: 1990, y: 108 },
    { x: 2140, y: 150 }, { x: 2160, y: 140 }, { x: 2180, y: 150 },
    { x: 2300, y: 168 },
    { x: 2510, y: 144 }, { x: 2560, y: 144 },
    { x: 2860, y: 196 },
  ],
  hearts: [{ x: 1135, y: 112 }, { x: 1840, y: 196 }],
  checkpoints: [{ x: 1270, y: GY }, { x: 1800, y: GY }, { x: 2350, y: GY }],
  hazards: [
    { type: 'traffic', x0: 1290, x1: 1690, y: GY, speed: 92, tex: 'car_b', offset: 0, margin: 24 },
    { type: 'traffic', x0: 1690, x1: 1290, y: GY, speed: -110, tex: 'car_c', offset: -200, margin: 24 },
    { type: 'laser', x: 2150, y: GY, h: 120, onMs: 1300, offMs: 1800, phase: 800 },
    { type: 'laser', x: 2420, y: GY, h: 120, onMs: 1400, offMs: 1700, phase: 0 },
  ],
  pads: [{ x: 1120, y: GY }],
  kickers: [{ x: 640, y: GY }],
  // where the story happens
  anchors: { meet: { x: 2810, y: GY } },
  decor: buildDecor(),
};

function buildDecor() {
  const d = [];
  const add = (o) => d.push(o);
  // street lights
  for (const x of [100, 460, 960, 1340, 1620, 1900, 2200, 2480, 2740, 2960]) {
    add({ tex: 'pole', x, y: GY, depth: 3, glow: 'glow_lav', gx: 4, gy: 76, gscale: 2.2, galpha: 0.5, flicker: true });
  }
  // start line
  add({ tex: 'drag_tree', anim: 'drag_tree', x: 190, y: GY, depth: 1 });
  add({ tex: 'sign_drag', x: 120, y: 78, oy: 0.5, depth: -2 });
  add({ tex: 'sign_race', x: 330, y: 92, oy: 0.5, depth: -2 });
  add({ tex: 'sign_nitro', x: 760, y: 110, oy: 0.5, depth: -2 });
  add({ tex: 'sign_blaq', x: 1220, y: 70, oy: 0.5, depth: -2 });
  add({ tex: 'sign_open', x: 1650, y: 96, oy: 0.5, depth: -2 });
  add({ tex: 'sign_pit', x: 2070, y: 82, oy: 0.5, depth: -2 });
  add({ tex: 'holo_a', anim: 'holo_a', x: 560, y: 150, oy: 0.5, depth: -3, alpha: 0.85 });
  add({ tex: 'holo_b', anim: 'holo_b', x: 1480, y: 90, oy: 0.5, depth: -3, alpha: 0.8 });
  add({ tex: 'holo_a', anim: 'holo_a', x: 2330, y: 120, oy: 0.5, depth: -3, alpha: 0.8 });
  // parked cars + spectators (flavour, behind the player)
  const cars = [['car_a', 70], ['car_d', 360], ['car_c', 860], ['car_b', 1480], ['car_a', 2060], ['car_d', 2570]];
  for (const [t, x] of cars) add({ tex: t, x, y: GY - 1, depth: 0, alpha: 0.95 });
  [[28, 0], [48, 1], [336, 2], [352, 3], [1060, 4], [1170, 0], [1948, 1], [2640, 2], [2660, 3]].forEach(([x, i]) => add({ tex: `spec${i}_0`, anim: `spec${i}`, x, y: GY, depth: 1 }));
  for (const x of [610, 1220, 2300]) add({ tex: 'barrier', x, y: GY, depth: 1 });
  for (const x of [250, 1030, 2260]) add({ tex: 'tires', x, y: GY, depth: 1 });
  for (const x of [20, 700, 1180, 1735, 2280, 2990]) add({ tex: 'fence_neon', x, y: GY, depth: 1 });
  // finish area
  add({ tex: 'sign_meet', x: 2810, y: 118, oy: 0.5, depth: -1 });
  return d;
}

export const STAGE1_META = {
  intro: 'Midnight. The drag strip is loud, bright and wet with neon.',
  hint: 'Find 3 memory fragments and clear the Lightwork. The meeting point is at the far end of the strip.',
};
