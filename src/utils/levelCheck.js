// Pure level-geometry analysis, used by the tests (and handy when designing levels).
// It answers one question: "can each character, using only the abilities in
// src/data/characters.js, reach every required spot?" It models:
//   * single jumps (Mule, Princess), Princess' mid-air second jump,
//   * walking speed (not skateboard speed - the conservative case),
//   * one-way ledges (reachable from below) and solid ground (reachable from the side),
//   * bounce pads (launch -430), and holo gates that block until opened.
// It does not model enemies or hazards; those can hurt but never block.
import { CHARACTERS } from '../data/characters.js';

const G = 900;
const SAFETY = 0.88; // keep a safety margin: never rely on pixel-perfect jumps

export function jumpApex(v) { return (v * v) / (2 * G); }

/** Horizontal distance covered while rising/falling to a landing `rise` px higher (negative = lower). */
export function jumpReach(charKey, rise, { pad = false } = {}) {
  const c = CHARACTERS[charKey].physics;
  const speed = c.walkSpeed * SAFETY;
  const v = pad ? 430 : -c.jumpVelocity;
  const solve = (vJ, r) => {
    const disc = vJ * vJ - 2 * G * r;
    return disc < 0 ? null : (vJ + Math.sqrt(disc)) / G;
  };
  let t = solve(v, rise);
  if (c.extraJumps > 0 && !pad) {
    // second jump at the apex of the first
    const apex = jumpApex(v);
    const t1 = v / G;
    const t2 = solve(-c.jumpVelocity, rise - apex);
    if (t2 != null && (t == null || t1 + t2 > t)) t = t1 + t2;
  }
  if (t == null) return -1;
  return speed * t;
}

export function maxRise(charKey, { pad = false } = {}) {
  const c = CHARACTERS[charKey].physics;
  const v = pad ? 430 : -c.jumpVelocity;
  let h = jumpApex(v);
  if (c.extraJumps > 0 && !pad) h += jumpApex(-c.jumpVelocity);
  return h * SAFETY;
}

const surfaceOf = (p) => ({ x0: p.x, x1: p.x + p.w, top: p.y, kind: p.kind ?? 'ground', src: p });

/**
 * Computes the set of standable surfaces reachable from the spawn.
 * `open` = set of gate ids treated as open (default none: gates block).
 */
export function reachableSurfaces(level, charKey, { openGates = [] } = {}) {
  const all = (level.platforms ?? []).filter((p) => p.kind !== 'wall').map(surfaceOf);
  for (const p of level.platforms ?? []) if (p.kind === 'wall') all.push({ ...surfaceOf(p), kind: 'wall' });
  const pads = level.pads ?? [];
  const gates = (level.gates ?? []).filter((g) => !openGates.includes(g.id));
  const blocked = (a, b) => gates.some((g) => {
    const lo = Math.min(a.x1, b.x1, a.x0, b.x0), hi = Math.max(a.x0, b.x0, a.x1, b.x1);
    return g.x > lo - 1 && g.x < hi + 1 && g.y0 <= Math.max(a.top, b.top) && g.y1 >= Math.min(a.top, b.top) - 40;
  });

  const start = all.filter((s) => level.spawn.x >= s.x0 && level.spawn.x <= s.x1 && Math.abs(level.spawn.y - s.top) <= 6);
  if (!start.length) throw new Error(`spawn (${level.spawn.x},${level.spawn.y}) is not on any surface`);
  const seen = new Set(start);
  const queue = [...start];
  const usePad = (s) => pads.some((pd) => pd.x >= s.x0 + 4 && pd.x <= s.x1 - 4 && Math.abs(pd.y - s.top) <= 4);
  while (queue.length) {
    const a = queue.shift();
    const withPad = usePad(a);
    for (const b of all) {
      if (seen.has(b) || b === a) continue;
      if (blocked(a, b)) continue;
      const gap = Math.max(0, b.x0 - a.x1, a.x0 - b.x1);
      const rise = a.top - b.top; // positive = b is higher
      const ok = (opts) => {
        if (rise > maxRise(charKey, opts) + 0.5) return false;
        return gap <= jumpReach(charKey, rise, opts) + 0.5;
      };
      if (ok({}) || (withPad && ok({ pad: true }))) { seen.add(b); queue.push(b); }
    }
  }
  return { surfaces: all, reachable: seen };
}

/** True when a collectible/interactable at (x, y) can be touched from a reachable surface. */
export function spotReachable(level, charKey, spot, opts = {}) {
  const { reachable } = reachableSurfaces(level, charKey, opts);
  const apex = maxRise(charKey);
  const tol = spot.tol ?? 14;
  for (const s of reachable) {
    if (spot.x < s.x0 - tol || spot.x > s.x1 + tol) continue;
    const above = s.top - spot.y;        // how far above the surface the spot is
    if (above <= apex + 12 && above >= -26) return true;
  }
  return false;
}

/** Everything a stage requires the player to touch, as a flat list of named spots. */
export function requiredSpots(level) {
  const spots = [];
  for (const f of level.fragments ?? []) spots.push({ name: `fragment:${f.key}`, x: f.x, y: f.y });
  for (const o of level.objects ?? []) spots.push({ name: `object:${o.key}`, x: o.x, y: o.y });
  for (const a of Object.entries(level.anchors ?? {})) spots.push({ name: `anchor:${a[0]}`, x: a[1].x, y: a[1].y });
  for (const c of level.checkpoints ?? []) spots.push({ name: 'checkpoint', x: c.x, y: c.y });
  return spots;
}

/** Validates a whole level for both characters; returns a list of human-readable problems. */
export function validateLevel(level, { openGates = [] } = {}) {
  const problems = [];
  for (const key of Object.keys(CHARACTERS)) {
    for (const spot of requiredSpots(level)) {
      if (!spotReachable(level, key, spot, { openGates })) problems.push(`${key} cannot reach ${spot.name} at (${spot.x}, ${spot.y})`);
    }
  }
  const w = level.world;
  for (const f of level.fragments ?? []) if (f.x < 0 || f.x > w.w) problems.push(`fragment ${f.key} outside the world`);
  for (const e of level.enemies ?? []) if (!e.id) problems.push('enemy without id');
  const ids = (level.enemies ?? []).map((e) => e.id);
  if (new Set(ids).size !== ids.length) problems.push('duplicate enemy ids');
  return problems;
}
