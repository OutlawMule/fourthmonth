// Stage 04 - Learning Your World. The neighborhood street (four memory objects), a
// holographic gate that stays shut until at least four have been opened, a zig-zag
// climb up the side of a building (two more objects) and the rooftop (the last two,
// the bench where the dawn is watched).
// Coordinates: the street is at y = 214; the roof is at y = -292. The world's top is placed
// so that, standing on the roof, the floor sits at the same screen height as the street.
const GY = 214;
const ROOF = -292;
const ground = (x0, x1) => ({ kind: 'ground', x: x0, y: GY, w: x1 - x0, h: 56 });
const ledge = (x, y, w, hidden = false) => ({ kind: 'ledge', x, y, w, hidden });

// zig-zag fire escape: 46 px per step, alternating between two columns
const climb = [];
const STEP = 46;
for (let i = 1; i <= 10; i++) climb.push(ledge(i % 2 ? 1580 : 1690, GY - STEP * i, 84));

export const STAGE4 = {
  id: 'stage4',
  world: { w: 3000, h: 270, top: ROOF - 214 },
  theme: 'roof',
  spawn: { x: 52, y: GY },
  bg: {
    sky: 'bg_sky_roof_0',
    layers: [
      { key: 'bg_far_roof_0', alt: 'bg_far_roof_1', f: 0.1, fy: 0.22, depth: -90 },
      { key: 'bg_mid_roof_0', alt: 'bg_mid_roof_1', f: 0.24, fy: 0.45, depth: -80 },
    ],
    flyers: true,
  },
  platforms: [
    ground(0, 1800),
    ledge(1020, 168, 80),         // a little higher ground for the "Things to try" object
    ledge(640, 170, 70), ledge(1240, 170, 70),
    ...climb,
    // the rooftop: a solid block that doubles as the building's facade
    { kind: 'ground', x: 1800, y: ROOF, w: 1200, h: GY - ROOF + 56 },
  ],
  // The eight memory objects. `key` matches CATEGORIES[].object in src/data/questions.js.
  objects: [
    { key: 'affection', x: 360, y: GY, area: 'street' },
    { key: 'activities', x: 760, y: GY, area: 'street' },
    { key: 'experiences', x: 1060, y: 168, area: 'street' },
    { key: 'communication', x: 1380, y: GY, area: 'street' },
    { key: 'comfort', x: 1622, y: GY - STEP * 5, area: 'climb' },
    { key: 'memories', x: 1622, y: GY - STEP * 9, area: 'climb' },
    { key: 'learning', x: 2150, y: ROOF, area: 'roof' },
    { key: 'hopes', x: 2560, y: ROOF, area: 'roof' },
  ],
  // optional rooftop-light bonuses (fragments listed in data/stages.js)
  fragments: [
    { key: 'skyline', x: 1060, y: 146 },
    { key: 'rooftop-light', x: 2350, y: ROOF - 40 },
    { key: 'dawn', x: 2740, y: ROOF - 22 },
  ],
  enemies: [],
  chips: [
    { x: 200, y: 196 }, { x: 226, y: 196 }, { x: 252, y: 196 },
    { x: 560, y: 196 }, { x: 650, y: 150 }, { x: 676, y: 150 },
    { x: 900, y: 196 }, { x: 926, y: 196 },
    { x: 1250, y: 150 }, { x: 1276, y: 150 },
    { x: 1596, y: GY - STEP * 3 - 18 }, { x: 1706, y: GY - STEP * 4 - 18 },
    { x: 1596, y: GY - STEP * 7 - 18 }, { x: 1706, y: GY - STEP * 8 - 18 },
    { x: 1900, y: ROOF - 18 }, { x: 1926, y: ROOF - 18 }, { x: 2260, y: ROOF - 18 }, { x: 2286, y: ROOF - 18 },
  ],
  hearts: [{ x: 640 + 35, y: 150 }],
  checkpoints: [{ x: 820, y: GY }, { x: 1440, y: GY }, { x: 1730, y: GY - STEP * 6 }, { x: 1860, y: ROOF }],
  hazards: [],
  pads: [],
  kickers: [],
  gates: [{ id: 'memory', x: 1500, y0: GY - 128, y1: GY }],
  anchors: { dawn: { x: 2820, y: ROOF } },
  decor: buildDecor(),
};

function buildDecor() {
  const d = [];
  const add = (o) => d.push(o);
  for (const x of [140, 500, 900, 1300, 1700]) add({ tex: 'pole', x, y: GY, depth: 3, glow: 'glow_warm', gx: 4, gy: 76, gscale: 2.2, galpha: 0.4, flicker: true });
  const houses = [[20, 'house_b'], [270, 'house_a'], [560, 'house_c'], [850, 'house_a'], [1120, 'house_b'], [1390, 'house_c']];
  for (const [x, t] of houses) add({ tex: t, x: x + 80, y: GY - 14, depth: -6, alpha: 0.95 });
  for (let x = 30; x < 1480; x += 200) add({ tex: 'fence_pick', x, y: GY - 2, depth: -1 });
  for (const x of [230, 610, 1180]) add({ tex: 'hedge', x, y: GY, depth: 1 });
  for (const x of [90, 680, 1330]) add({ tex: 'bin', x, y: GY, depth: 1 });
  for (const x of [440, 990]) add({ tex: 'mailbox', x, y: GY, depth: 1 });
  // the memory gate (visual only; the scene adds the solid body and removes it when opened)
  add({ tex: 'gate_post', x: 1500, y: GY, depth: 4 });
  add({ tex: 'gate_post', x: 1500, y: GY - 128 + 18, depth: 4 });
  add({ tex: 'sign_roof', x: 1500, y: GY - 150, oy: 0.5, depth: 4 });
  // signs on the facade
  add({ tex: 'sign_city', x: 1840, y: 120, oy: 0.5, depth: 4 });
  add({ tex: 'sign_late', x: 1850, y: -80, oy: 0.5, depth: 4 });
  add({ tex: 'fire_escape', x: 1580, y: GY - 6, depth: 0, ox: 0, alpha: 0.5 });
  // roof furniture
  const R = ROOF;
  for (const x of [1900, 2330, 2700]) add({ tex: 'ac_unit', x, y: R, depth: 1 });
  add({ tex: 'tank', x: 2020, y: R, depth: 0 });
  for (const x of [1860, 2460, 2930]) add({ tex: 'antenna_0', anim: 'antenna', x, y: R, depth: 0 });
  add({ tex: 'holo_roof_0', anim: 'holo_roof', x: 2250, y: R - 8, depth: 1, alpha: 0.9 });
  add({ tex: 'roof_bench', x: 2820, y: R, depth: 1 });
  add({ tex: 'roof_rail', x: 1816, y: R, depth: 2 });
  add({ tex: 'roof_rail', x: 2984, y: R, depth: 2 });
  for (const x of [2090, 2420, 2660]) add({ tex: 'roof_rail', x, y: R, depth: 2, alpha: 0.7 });
  add({ tex: 'sign_dawn', x: 2700, y: R - 110, oy: 0.5, depth: -2 });
  return d;
}

export const STAGE4_META = {
  intro: 'Up here the whole city is a quiet hum.',
  hint: 'Open at least four memory objects, then climb to the rooftop.',
};
