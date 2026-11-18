// Every collectible, memory object, checkpoint and goal in all four levels must be reachable by
// BOTH characters using their real jump and dash numbers. Gates must be real barriers.
import { describe, it, expect } from 'vitest';
import { validateLevel, requiredSpots } from '../src/utils/levelCheck.js';
import { STAGE1 } from '../src/data/levels/stage1.js';
import { STAGE2 } from '../src/data/levels/stage2.js';
import { STAGE3 } from '../src/data/levels/stage3.js';
import { STAGE4 } from '../src/data/levels/stage4.js';
import { STAGES } from '../src/data/stages.js';

const LEVELS = { stage1: STAGE1, stage2: STAGE2, stage3: STAGE3, stage4: STAGE4 };
const openAll = (l) => ({ openGates: (l.gates ?? []).map((g) => g.id) });

describe.each(Object.entries(LEVELS))('%s', (id, level) => {
  it('can be fully completed by both Mule and Princess', () => {
    expect(validateLevel(level, openAll(level))).toEqual([]);
  });
  it('places every fragment the stage rules mention', () => {
    const placed = new Set((level.fragments ?? []).map((f) => f.key));
    for (const f of STAGES[id].fragments) expect(placed.has(f.key), `${id} fragment ${f.key}`).toBe(true);
  });
  it('has something to reach', () => {
    expect(requiredSpots(level).length).toBeGreaterThan(0);
  });
});

describe('Stage 04 cannot be skipped to the rooftop', () => {
  it('keeps the rooftop out of reach until the memory gate is opened by playing', () => {
    const closed = validateLevel(STAGE4);
    expect(closed.length).toBeGreaterThan(0);
    expect(closed.join('\n')).toMatch(/fragment:dawn|fragment:rooftop-light/);
    expect(validateLevel(STAGE4, { openGates: ['memory'] })).toEqual([]);
  });
});
