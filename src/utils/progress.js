// Pure progress model: schema, validation, merge, and the operations the game uses.
// No browser or Phaser APIs here so it is fully unit-testable.
import { STAGE_ORDER, STAGES, allOptionalFragments, stageIndex } from '../data/stages.js';
import { extendedEndingQuestionKeys } from '../data/questions.js';
import { isCharacterKey } from '../data/characters.js';

export const PROGRESS_VERSION = 1;
const MAX_KEYS = 80;
const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,47}$/i;

const iso = (d = new Date()) => d.toISOString();

export function createDefaultProgress(now = iso()) {
  return {
    version: PROGRESS_VERSION,
    startedAt: null,
    updatedAt: now,
    selectedCharacter: 'mule',
    unlockedStages: ['stage1'],
    completedStages: [],
    collected: {},        // stageId -> fragment keys
    answered: [],         // question keys (never the answer text)
    memoryObjects: [],    // rooftop object keys opened
    seenScenes: [],       // cinematic keys already watched
    journal: [],          // stage ids whose journal entry is unlocked
    achievements: [],
    endings: { standard: false, extended: false },
    run: null,            // resume data for the stage in progress
    prefs: { stage3Variation: 'clear' },
    stats: { deaths: 0, defeats: 0, bestCombo: 0 },
  };
}

const uniqStrings = (arr, validate = (s) => KEY_RE.test(s)) => {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const v of arr) if (typeof v === 'string' && validate(v) && !out.includes(v)) out.push(v);
  return out.slice(0, MAX_KEYS);
};
const stageIds = (arr) => uniqStrings(arr, (s) => STAGE_ORDER.includes(s)).sort((a, b) => stageIndex(a) - stageIndex(b));
const nonNegInt = (n, d = 0) => (Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 1e9) : d);
const isoOr = (s, d) => (typeof s === 'string' && !Number.isNaN(Date.parse(s)) ? s : d);

function sanitizeRun(r) {
  if (!r || typeof r !== 'object' || !STAGE_ORDER.includes(r.stageId)) return null;
  const flags = {};
  if (r.flags && typeof r.flags === 'object') {
    for (const [k, v] of Object.entries(r.flags)) if (KEY_RE.test(k) && typeof v === 'boolean') flags[k] = v;
  }
  const counters = {};
  if (r.counters && typeof r.counters === 'object') {
    for (const [k, v] of Object.entries(r.counters)) if (KEY_RE.test(k)) counters[k] = nonNegInt(v);
  }
  return {
    stageId: r.stageId,
    checkpoint: nonNegInt(r.checkpoint),
    defeated: uniqStrings(r.defeated),
    flags,
    counters,
    variation: typeof r.variation === 'string' && KEY_RE.test(r.variation) ? r.variation : 'clear',
  };
}

/** Validates stored data. Returns { progress, repaired } - never throws. */
export function sanitizeProgress(raw) {
  const base = createDefaultProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { progress: base, repaired: true };
  let repaired = false;
  const p = { ...base };

  p.startedAt = isoOr(raw.startedAt, null);
  p.updatedAt = isoOr(raw.updatedAt, base.updatedAt);
  if (isCharacterKey(raw.selectedCharacter)) p.selectedCharacter = raw.selectedCharacter;
  else repaired = true;

  p.unlockedStages = stageIds(raw.unlockedStages);
  p.completedStages = stageIds(raw.completedStages);

  p.collected = {};
  if (raw.collected && typeof raw.collected === 'object' && !Array.isArray(raw.collected)) {
    for (const id of STAGE_ORDER) {
      const keys = uniqStrings(raw.collected[id]);
      if (keys.length) p.collected[id] = keys;
    }
  } else if (raw.collected !== undefined) repaired = true;

  p.answered = uniqStrings(raw.answered);
  p.memoryObjects = uniqStrings(raw.memoryObjects);
  p.seenScenes = uniqStrings(raw.seenScenes);
  p.journal = stageIds(raw.journal);
  p.achievements = uniqStrings(raw.achievements);
  p.endings = {
    standard: raw.endings?.standard === true,
    extended: raw.endings?.extended === true,
  };
  p.run = sanitizeRun(raw.run);
  p.prefs = {
    stage3Variation:
      typeof raw.prefs?.stage3Variation === 'string' && KEY_RE.test(raw.prefs.stage3Variation) ? raw.prefs.stage3Variation : 'clear',
  };
  p.stats = {
    deaths: nonNegInt(raw.stats?.deaths),
    defeats: nonNegInt(raw.stats?.defeats),
    bestCombo: nonNegInt(raw.stats?.bestCombo),
  };

  // Structural invariants: stage1 always open; a completed stage opens its successor;
  // nothing can be completed without being unlocked.
  if (!p.unlockedStages.includes('stage1')) { p.unlockedStages.unshift('stage1'); repaired = true; }
  for (const id of p.completedStages) {
    const next = STAGES[id]?.unlocks;
    if (!p.unlockedStages.includes(id)) { p.unlockedStages.push(id); repaired = true; }
    if (next && !p.unlockedStages.includes(next)) { p.unlockedStages.push(next); repaired = true; }
  }
  p.unlockedStages = stageIds(p.unlockedStages);
  if (p.run && !p.unlockedStages.includes(p.run.stageId)) p.run = null;
  return { progress: p, repaired };
}

// ---- operations (all return a NEW progress object) --------------------------
const touch = (p) => ({ ...p, updatedAt: iso() });
const withStarted = (p) => (p.startedAt ? p : { ...p, startedAt: iso() });

export function selectCharacter(p, key) {
  if (!isCharacterKey(key)) return p;
  return touch({ ...p, selectedCharacter: key });
}

export function isStageUnlocked(p, id) { return p.unlockedStages.includes(id); }
export function isStageCompleted(p, id) { return p.completedStages.includes(id); }

export function unlockStage(p, id) {
  if (!STAGE_ORDER.includes(id) || p.unlockedStages.includes(id)) return p;
  return touch({ ...p, unlockedStages: stageIds([...p.unlockedStages, id]) });
}

/** Marks complete, unlocks the next stage, unlocks the journal entry. Idempotent. */
export function completeStage(p, id) {
  if (!STAGE_ORDER.includes(id) || !p.unlockedStages.includes(id)) return p; // cannot skip ahead
  let n = { ...p };
  if (!n.completedStages.includes(id)) n.completedStages = stageIds([...n.completedStages, id]);
  if (!n.journal.includes(id)) n.journal = stageIds([...n.journal, id]);
  const next = STAGES[id].unlocks;
  if (next && !n.unlockedStages.includes(next)) n.unlockedStages = stageIds([...n.unlockedStages, next]);
  if (n.run?.stageId === id) n.run = null;
  return touch(n);
}

/** Collectibles are unique per (stage, key): a second pickup never re-awards. */
export function collectFragment(p, stageId, key) {
  const stage = STAGES[stageId];
  if (!stage || !stage.fragments.some((f) => f.key === key)) return { progress: p, added: false };
  const have = p.collected[stageId] ?? [];
  if (have.includes(key)) return { progress: p, added: false };
  const progress = touch(withStarted({ ...p, collected: { ...p.collected, [stageId]: [...have, key] } }));
  return { progress, added: true };
}

export function hasFragment(p, stageId, key) { return (p.collected[stageId] ?? []).includes(key); }
export function fragmentCount(p, stageId) { return (p.collected[stageId] ?? []).length; }

export function markSeen(p, key) {
  return p.seenScenes.includes(key) || !KEY_RE.test(key) ? p : touch({ ...p, seenScenes: [...p.seenScenes, key] });
}
export function hasSeen(p, key) { return p.seenScenes.includes(key); }

export function markAnswered(p, questionKey) {
  return p.answered.includes(questionKey) || !KEY_RE.test(questionKey) ? p : touch({ ...p, answered: [...p.answered, questionKey] });
}
export function unmarkAnswered(p, questionKey) {
  return p.answered.includes(questionKey) ? touch({ ...p, answered: p.answered.filter((k) => k !== questionKey) }) : p;
}
export function openMemoryObject(p, key) {
  if (!KEY_RE.test(key) || p.memoryObjects.includes(key)) return { progress: p, added: false };
  return { progress: touch({ ...p, memoryObjects: [...p.memoryObjects, key] }), added: true };
}
export function grantAchievement(p, key) {
  return p.achievements.includes(key) || !KEY_RE.test(key) ? p : touch({ ...p, achievements: [...p.achievements, key] });
}
export function setRun(p, run) { return touch({ ...p, run: run ? sanitizeRun(run) : null }); }
export function bumpStat(p, name, by = 1) {
  if (!(name in p.stats)) return p;
  return { ...p, stats: { ...p.stats, [name]: nonNegInt(p.stats[name] + by) } };
}
export function setBestCombo(p, n) {
  return n > p.stats.bestCombo ? { ...p, stats: { ...p.stats, bestCombo: nonNegInt(n) } } : p;
}
export function recordEnding(p, kind) {
  if (kind !== 'standard' && kind !== 'extended') return p;
  return touch({ ...p, endings: { ...p.endings, [kind]: true, standard: true } });
}

/** Where "Continue" should drop the player. */
export function resumeStageId(p) {
  if (p.run && p.unlockedStages.includes(p.run.stageId)) return p.run.stageId;
  for (const id of STAGE_ORDER) if (p.unlockedStages.includes(id) && !p.completedStages.includes(id)) return id;
  return STAGE_ORDER[STAGE_ORDER.length - 1];
}

/** Extended ending: every optional fragment in the game + every rooftop question answered. */
export function extendedEndingStatus(p) {
  const missingFragments = allOptionalFragments().filter((f) => !hasFragment(p, f.stageId, f.key));
  const missingAnswers = extendedEndingQuestionKeys().filter((k) => !p.answered.includes(k));
  return { ready: missingFragments.length === 0 && missingAnswers.length === 0, missingFragments, missingAnswers };
}

/**
 * Merge two progress objects without losing either side's achievements.
 * Strategy: set-union for everything that only ever grows (unlocks, completions,
 * fragments, answered keys, seen scenes, journal, achievements, endings), max() for
 * counters, and "newest updatedAt wins" for the scalar fields (selected character,
 * resume point, preferences). Older local data therefore can never erase newer cloud
 * data, and vice-versa.
 */
export function mergeProgress(a, b) {
  const A = sanitizeProgress(a).progress;
  const B = sanitizeProgress(b).progress;
  const newer = Date.parse(A.updatedAt) >= Date.parse(B.updatedAt) ? A : B;
  const collected = {};
  for (const id of STAGE_ORDER) {
    const u = uniqStrings([...(A.collected[id] ?? []), ...(B.collected[id] ?? [])]);
    if (u.length) collected[id] = u;
  }
  const merged = {
    ...newer,
    startedAt: [A.startedAt, B.startedAt].filter(Boolean).sort()[0] ?? null,
    updatedAt: newer.updatedAt,
    unlockedStages: stageIds([...A.unlockedStages, ...B.unlockedStages]),
    completedStages: stageIds([...A.completedStages, ...B.completedStages]),
    collected,
    answered: uniqStrings([...A.answered, ...B.answered]),
    memoryObjects: uniqStrings([...A.memoryObjects, ...B.memoryObjects]),
    seenScenes: uniqStrings([...A.seenScenes, ...B.seenScenes]),
    journal: stageIds([...A.journal, ...B.journal]),
    achievements: uniqStrings([...A.achievements, ...B.achievements]),
    endings: { standard: A.endings.standard || B.endings.standard, extended: A.endings.extended || B.endings.extended },
    stats: {
      deaths: Math.max(A.stats.deaths, B.stats.deaths),
      defeats: Math.max(A.stats.defeats, B.stats.defeats),
      bestCombo: Math.max(A.stats.bestCombo, B.stats.bestCombo),
    },
  };
  return sanitizeProgress(merged).progress;
}

/**
 * Equality ignoring updatedAt and the order of the key lists (they are sets) - used to decide
 * whether a cloud write or a local re-save is needed.
 */
export function progressEqual(a, b) {
  const SET_FIELDS = ['unlockedStages', 'completedStages', 'answered', 'memoryObjects', 'seenScenes', 'journal', 'achievements'];
  const norm = (x) => {
    const p = { ...sanitizeProgress(x).progress, updatedAt: 0 };
    for (const f of SET_FIELDS) p[f] = [...p[f]].sort();
    p.collected = Object.fromEntries(Object.entries(p.collected).map(([id, keys]) => [id, [...keys].sort()]));
    return JSON.stringify(p);
  };
  return norm(a) === norm(b);
}
