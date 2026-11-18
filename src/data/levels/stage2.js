// Stage 02 - The Log (city park). Calm pacing: a pond to hop across, a stream, a
// treehouse climb for the bonus fragment, and the log at the far end.
const GY = 214;
const ground = (x0, x1) => ({ kind: 'ground', x: x0, y: GY, w: x1 - x0, h: 56 });
const ledge = (x, y, w, hidden = false) => ({ kind: 'ledge', x, y, w, hidden });

export const STAGE2 = {
  id: 'stage2',
  world: { w: 2600, h: 270 },
  theme: 'park',
  spawn: { x: 52, y: GY },
  bg: {
    sky: 'bg_sky_park',
    layers: [
      { key: 'bg_far_park', f: 0.1, depth: -90 },
      { key: 'bg_mid_park', f: 0.28, depth: -80 },
      { key: 'bg_near_park', f: 0.55, depth: -70, tint: 0x9a86cf },
    ],
    flyers: false,
  },
  platforms: [
    ground(0, 640), ground(784, 1460), ground(1526, 2600),
    // stepping stones across the pond (drawn as stone props)
    ledge(662, 210, 32, true), ledge(708, 200, 32, true), ledge(752, 210, 36, true),
    // footbridge arch: "What was going through your mind?"
    ledge(900, 170, 70), ledge(985, 132, 84),
    // lantern walkway
    ledge(1200, 168, 100),
    // gazebo: "What made you feel close to me?"
    ledge(1700, 164, 130),
    // treehouse climb: bonus "What do you wish we had more time for?"
    ledge(1900, 170, 60), ledge(1975, 126, 60), ledge(2050, 84, 80),
  ],
  fragments: [
    { key: 'talk1', x: 470, y: 188 },
    { key: 'talk2', x: 1026, y: 108 },
    { key: 'talk3', x: 1764, y: 140 },
    { key: 'talk4', x: 2090, y: 60 },
  ],
  enemies: [
    { id: 'pk1', type: 'drone', x: 1100, y: 140, patrol: [1000, 1280] },
    { id: 'pk2', type: 'walker', x: 1620, y: GY, patrol: [1550, 1690] },
  ],
  chips: [
    { x: 160, y: 196 }, { x: 186, y: 196 }, { x: 212, y: 196 },
    { x: 360, y: 168 }, { x: 376, y: 158 }, { x: 392, y: 168 },
    { x: 676, y: 188 }, { x: 724, y: 176 }, { x: 768, y: 188 },
    { x: 920, y: 150 }, { x: 1004, y: 112 },
    { x: 1215, y: 148 }, { x: 1245, y: 148 }, { x: 1275, y: 148 },
    { x: 1480, y: 176 }, { x: 1494, y: 168 }, { x: 1508, y: 176 },
    { x: 1720, y: 144 }, { x: 1800, y: 144 },
    { x: 1920, y: 150 }, { x: 1995, y: 106 },
    { x: 2200, y: 196 }, { x: 2226, y: 196 },
  ],
  hearts: [{ x: 880, y: 196 }, { x: 1940, y: 196 }],
  checkpoints: [{ x: 800, y: GY }, { x: 1540, y: GY }],
  hazards: [],
  pads: [],
  kickers: [],
  anchors: { log: { x: 2300, y: GY } },
  ponds: [{ x: 640, w: 144 }, { x: 1460, w: 66 }],
  decor: buildDecor(),
};

function buildDecor() {
  const d = [];
  const add = (o) => d.push(o);
  add({ tex: 'gate_arch', x: 150, y: GY, depth: 1 });
  // trees behind the path
  const trees = [[40, 'tree_c'], [330, 'tree_a'], [560, 'tree_b'], [860, 'tree_a'], [1120, 'tree_c'], [1330, 'tree_b'], [1600, 'tree_a'], [1820, 'tree_c'], [2000, 'tree_b'], [2160, 'tree_a'], [2480, 'tree_c']];
  trees.forEach(([x, t], i) => add({ tex: t, x, y: GY + 2, depth: -4 + (i % 3) * 0.1, alpha: 0.98 }));
  // lanterns with warm light
  for (const x of [250, 600, 840, 1180, 1420, 1650, 1880, 2140, 2400]) {
    add({ tex: 'lantern', x, y: GY, depth: 3, glow: 'glow_lav', gx: 0, gy: 56, gscale: 1.8, galpha: 0.45, flicker: true });
  }
  // flowers
  const fl = ['flower_a', 'flower_b', 'flower_c'];
  for (let x = 90, i = 0; x < 2560; x += 53 + ((i * 17) % 29), i++) {
    const onPond = (x > 640 && x < 784) || (x > 1460 && x < 1526);
    if (onPond) continue;
    add({ tex: `${fl[i % 3]}_0`, anim: fl[i % 3], x, y: GY + 1, depth: 2 });
  }
  for (const x of [200, 520, 900, 1250, 1560, 2060, 2350]) add({ tex: 'bush', x, y: GY + 2, depth: 1 });
  add({ tex: 'bench', x: 400, y: GY, depth: 1 });
  add({ tex: 'bench', x: 1300, y: GY, depth: 1 });
  add({ tex: 'signpost', x: 300, y: GY, depth: 1 });
  add({ tex: 'stump', x: 1090, y: GY, depth: 1 });
  for (const x of [20, 600, 820, 1440, 1560, 2560]) add({ tex: 'fence_low', x, y: GY, depth: 1 });
  // stepping stones sit exactly on the (hidden) one-way platforms
  for (const [x, y] of [[678, 210], [724, 200], [770, 210]]) add({ tex: 'stone', x, y, oy: 0.25, depth: 2 });
  // the log, with soft lights over it
  add({ tex: 'log_glow', x: 2300, y: GY + 6, depth: 0, glow: null, alpha: 0.9 });
  add({ tex: 'log', x: 2300, y: GY + 2, depth: 2 });
  add({ tex: 'string_lights', x: 2300, y: 130, oy: 0, depth: 3 });
  add({ tex: 'lantern', x: 2236, y: GY, depth: 3, glow: 'glow_warm', gy: 56, gscale: 2, galpha: 0.4, flicker: true });
  add({ tex: 'lantern', x: 2364, y: GY, depth: 3, glow: 'glow_warm', gy: 56, gscale: 2, galpha: 0.4, flicker: true });
  return d;
}

export const STAGE2_META = {
  intro: 'A quiet corner of the city. Some places just feel familiar.',
  hint: 'Walk the park and gather conversation fragments, then find the log.',
};
