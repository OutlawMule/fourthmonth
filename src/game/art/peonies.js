// Procedural pixel-art flowers for the "Pixels & Peonies" intro. A flower is rasterised
// into lit "cells" (one cell = one particle in the intro). Every cell remembers which petal
// it belongs to, so the intro can build the flower petal by petal - outer petals first,
// the stamens last. Nothing here touches Phaser or the DOM, so it is easy to test.
import { rng } from './pixel.js';

const PEONY_RINGS = [
  { n: 7, d: 0.62, l: 0.62, w: 0.58, rot: 0.0 },
  { n: 7, d: 0.47, l: 0.54, w: 0.52, rot: 0.5 },
  { n: 6, d: 0.33, l: 0.46, w: 0.46, rot: 0.2 },
  { n: 5, d: 0.19, l: 0.36, w: 0.38, rot: 0.6 },
];
const BLOSSOM_RINGS = [
  { n: 6, d: 0.55, l: 0.7, w: 0.62, rot: 0.0 },
  { n: 5, d: 0.34, l: 0.55, w: 0.55, rot: 0.5 },
  { n: 4, d: 0.16, l: 0.4, w: 0.42, rot: 0.2 },
];

/**
 * flowerCells({ radius, colors, seed })
 *   colors: { base: [outer..inner], hi: [outer..inner], edge: [outer..inner] }  (css hex strings)
 * Returns { cells: [{ x, y, color, petal }], petals } with x/y in cell units around (0, 0).
 */
export function flowerCells({ radius = 16, colors, seed = 1, rings = null, stamen = ['#FFC857', '#FFF6D8', '#FF9A3C'] }) {
  const R = radius;
  const size = R * 2 + 5;
  const mid = (size - 1) / 2;
  const grid = new Array(size * size).fill(null);
  const rand = rng(seed);
  const list = rings ?? (R >= 11 ? PEONY_RINGS : BLOSSOM_RINGS);
  const at = (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? null : grid[y * size + x]);
  let petal = 0;

  list.forEach((ring, k) => {
    const ci = Math.min(colors.base.length - 1, k);
    for (let j = 0; j < ring.n; j++) {
      const a = ((j + ring.rot) / ring.n) * Math.PI * 2 + (rand() - 0.5) * 0.12;
      const cosA = Math.cos(a), sinA = Math.sin(a);
      const pcx = mid + cosA * ring.d * R, pcy = mid + sinA * ring.d * R;
      const A = (ring.l * R) / 2, B = (ring.w * R) / 2;
      const reach = Math.ceil(Math.max(A, B)) + 1;
      const mine = [];
      for (let y = Math.floor(pcy) - reach; y <= Math.ceil(pcy) + reach; y++) {
        for (let x = Math.floor(pcx) - reach; x <= Math.ceil(pcx) + reach; x++) {
          const dx = x + 0.5 - pcx, dy = y + 0.5 - pcy;
          const u = dx * cosA + dy * sinA;        // along the petal (outwards is +)
          const v = -dx * sinA + dy * cosA;       // across the petal
          const t = u / A, s = v / B;
          if (t * t + s * s * (1 + 0.45 * Math.max(0, t)) > 1) continue;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const lit = Math.abs(v) < B * 0.3 && t > -0.2 && t < 0.55;
          grid[y * size + x] = { color: lit ? colors.hi[ci] : colors.base[ci], petal, edge: colors.edge[ci] };
          mine.push([x, y]);
        }
      }
      // outline: cells of this petal that touch anything that is not this petal
      for (const [x, y] of mine) {
        const c = at(x, y);
        const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => at(x + ox, y + oy)?.petal !== petal);
        if (open && c.petal === petal) c.color = c.edge;
      }
      petal++;
    }
  });

  // stamens in the middle
  const sr = Math.max(1, Math.round(R * 0.17));
  for (let y = -sr - 1; y <= sr + 1; y++) {
    for (let x = -sr - 1; x <= sr + 1; x++) {
      const d = Math.hypot(x, y);
      if (d > sr + 0.4) continue;
      const gx = mid + x, gy = mid + y;
      const k = d > sr - 0.6 ? 2 : (x + y) % 3 === 0 ? 1 : 0;
      grid[gy * size + gx] = { color: stamen[k], petal, edge: stamen[2] };
    }
  }
  petal++;

  const cells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = grid[y * size + x];
      if (c) cells.push({ x: x - mid, y: y - mid, color: c.color, petal: c.petal });
    }
  }
  return { cells, petals: petal };
}

export const FLOWER_COLORS = Object.freeze({
  // purple / violet blossoms
  violet: {
    base: ['#6a2fd0', '#8a4cf0', '#a874ff', '#c9a6ff'],
    hi: ['#8650ec', '#a874ff', '#c9a6ff', '#e8d9ff'],
    edge: ['#35177a', '#45208f', '#5a2d96', '#7a4ac0'],
  },
  // pink / violet peonies
  pink: {
    base: ['#b43bc6', '#d84fc0', '#ff72c6', '#ff9ad6'],
    hi: ['#d05ad8', '#ff8ad0', '#ffb0e0', '#ffd8f0'],
    edge: ['#5e1a78', '#7a2290', '#9a2f9a', '#c25ab0'],
  },
});

/** Merges several flowers (each placed at ox/oy cells) into one cluster of cells with a build order. */
export function buildCluster(parts) {
  const map = new Map();
  let order = 0;
  for (const part of parts) {
    const f = flowerCells(part.flower);
    for (const c of f.cells) map.set(`${c.x + part.ox},${c.y + part.oy}`, { x: c.x + part.ox, y: c.y + part.oy, color: c.color, order: order + c.petal });
    order += f.petals;
  }
  return { cells: [...map.values()], maxOrder: order };
}
