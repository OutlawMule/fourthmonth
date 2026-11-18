// Stage definitions: titles, locations, objectives, collectibles and the rules that
// decide when a stage is complete. The game, the HUD, the archive and the tests all
// read from this file. There are exactly four stages across three locations.

export const STAGE_ORDER = Object.freeze(['stage1', 'stage2', 'stage3', 'stage4']);

export const LOCATIONS = Object.freeze({
  drag: { key: 'drag', name: 'Drag-racing district' },
  park: { key: 'park', name: 'City park' },
  residential: { key: 'residential', name: 'Residential neighborhood' },
});

export const STAGES = Object.freeze({
  stage1: {
    id: 'stage1',
    number: 1,
    scene: 'DragRaceScene',
    location: 'drag',
    title: 'The Night Our Worlds Collided',
    memoryDate: '5 July',
    objective: 'Find 3 memory fragments, clear the Lightwork, reach the meeting point.',
    music: 'drag',
    // Letter excerpts are verbatim substrings of src/data/letter.js (a test enforces that).
    fragments: [
      { key: 'froze', label: 'I froze.', required: true, excerpt: "i froze and i didn't know to do" },
      { key: 'rush', label: 'She rushed to me.', required: true, excerpt: 'then i saw you rush to me' },
      { key: 'thumb', label: 'The thumb.', required: true, excerpt: 'me giving you back my thumb when you let go of it' },
      { key: 'cool', label: 'So cool. So nervous.', required: false, excerpt: 'one of us was so cool other one was so nervous.' },
      { key: 'early', label: 'Home too early.', required: false, excerpt: 'you had to go home a too early' },
    ],
    required: { fragments: ['froze', 'rush', 'thumb'], defeats: 5, flags: ['meetingRead'] },
    unlocks: 'stage2',
  },

  stage2: {
    id: 'stage2',
    number: 2,
    scene: 'LogScene',
    location: 'park',
    title: 'The Log',
    memoryDate: null,
    objective: 'Walk the park, gather conversation fragments, and reach the log.',
    music: 'park',
    // Conversation fragments double as the prompts you can pick at the log.
    fragments: [
      { key: 'talk1', label: 'What do you remember most about this day?', required: true, prompt: 'log.remember' },
      { key: 'talk2', label: 'What was going through your mind?', required: true, prompt: 'log.mind' },
      { key: 'talk3', label: 'What made you feel close to me?', required: true, prompt: 'log.close' },
      { key: 'talk4', label: 'What do you wish we had more time for?', required: false, prompt: 'log.time' },
    ],
    required: { fragments: ['talk1', 'talk2', 'talk3'], defeats: 0, flags: ['logVisited', 'timeSkipDone'] },
    unlocks: 'stage3',
  },

  stage3: {
    id: 'stage3',
    number: 3,
    scene: 'MidnightScene',
    location: 'residential',
    title: 'After Everyone Else Is Asleep',
    memoryDate: null,
    objective: 'Cross the quiet neighborhood and reach the meeting point outside her house.',
    music: 'night',
    fragments: [
      { key: 'streetlight', label: 'The streetlight hum', required: false, unlocksVariation: 'rain', note: 'Unlocks the rainy-night replay.' },
      { key: 'driveway', label: 'The driveway', required: false, unlocksVariation: 'fog', note: 'Unlocks the foggy-night replay.' },
    ],
    required: { fragments: [], defeats: 0, flags: ['carArrived', 'midnightTalk'] },
    variations: [
      { key: 'clear', label: 'Clear night', unlockedBy: null },
      { key: 'rain', label: 'Rainy night', unlockedBy: 'streetlight' },
      { key: 'fog', label: 'Foggy night', unlockedBy: 'driveway' },
    ],
    unlocks: 'stage4',
  },

  stage4: {
    id: 'stage4',
    number: 4,
    scene: 'LearningScene',
    location: 'residential',
    title: 'Learning Your World',
    memoryDate: null,
    objective: 'Open at least 4 memory objects, then climb to the rooftop.',
    music: 'roof',
    fragments: [
      { key: 'skyline', label: 'The skyline', required: false },
      { key: 'rooftop-light', label: 'The rooftop lights', required: false },
      { key: 'dawn', label: 'Before the dawn', required: false },
    ],
    // `memoryObjects` is a counter the scene increments for each distinct object opened.
    required: { fragments: [], defeats: 0, counters: { memoryObjects: 4 }, flags: ['rooftopReached'] },
    unlocks: null,
  },
});

export function getStage(id) {
  return STAGES[id] ?? null;
}

export function stageIndex(id) {
  return STAGE_ORDER.indexOf(id);
}

export function nextStageId(id) {
  const i = stageIndex(id);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

export function allFragmentKeys(stageId) {
  return (STAGES[stageId]?.fragments ?? []).map((f) => f.key);
}

export function requiredFragmentKeys(stageId) {
  return STAGES[stageId]?.required.fragments ?? [];
}

export function optionalFragmentKeys(stageId) {
  return (STAGES[stageId]?.fragments ?? []).filter((f) => !f.required).map((f) => f.key);
}

/**
 * Pure stage-completion rule. `run` = { fragments: string[], defeats: number,
 * flags: Record<string, boolean>, counters: Record<string, number> }.
 * Returns { complete, missing[] } so the HUD can tell the player what is left.
 */
export function evaluateStage(stageId, run = {}) {
  const stage = STAGES[stageId];
  if (!stage) return { complete: false, missing: ['unknown stage'] };
  const have = new Set(run.fragments ?? []);
  const flags = run.flags ?? {};
  const counters = run.counters ?? {};
  const missing = [];
  const req = stage.required;

  const missingFrags = req.fragments.filter((k) => !have.has(k));
  if (missingFrags.length) missing.push(`${missingFrags.length} fragment${missingFrags.length > 1 ? 's' : ''}`);
  if ((run.defeats ?? 0) < (req.defeats ?? 0)) missing.push(`${req.defeats - (run.defeats ?? 0)} Lightwork`);
  for (const [name, need] of Object.entries(req.counters ?? {})) {
    if ((counters[name] ?? 0) < need) missing.push(`${need - (counters[name] ?? 0)} more memory object${need - (counters[name] ?? 0) > 1 ? 's' : ''}`);
  }
  for (const f of req.flags ?? []) if (!flags[f]) missing.push(FLAG_LABELS[f] ?? f);
  return { complete: missing.length === 0, missing };
}

/** Player-facing names for the story flags the stage rules wait for. */
export const FLAG_LABELS = Object.freeze({
  meetingRead: 'the meeting',
  logVisited: 'sit at the log',
  timeSkipDone: 'let the night pass',
  carArrived: 'the car arriving',
  midnightTalk: 'a little time together',
  rooftopReached: 'reach the rooftop',
});

/** Fragment keys across the whole game that count towards the extended ending. */
export function allOptionalFragments() {
  const out = [];
  for (const id of STAGE_ORDER) for (const k of optionalFragmentKeys(id)) out.push({ stageId: id, key: k });
  return out;
}
