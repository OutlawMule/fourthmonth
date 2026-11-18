import { describe, it, expect } from 'vitest';
import {
  createDefaultProgress, sanitizeProgress, mergeProgress, progressEqual, completeStage, collectFragment,
  markAnswered, unmarkAnswered, extendedEndingStatus, recordEnding, resumeStageId, unlockStage, PROGRESS_VERSION,
} from '../src/utils/progress.js';
import { allOptionalFragments, STAGE_ORDER } from '../src/data/stages.js';
import { extendedEndingQuestionKeys } from '../src/data/questions.js';

const later = (p, ms = 1000) => ({ ...p, updatedAt: new Date(Date.parse(p.updatedAt) + ms).toISOString() });

describe('progress: validation of saved data', () => {
  it('starts with only stage 1 unlocked and a version number', () => {
    const p = createDefaultProgress();
    expect(p.version).toBe(PROGRESS_VERSION);
    expect(p.unlockedStages).toEqual(['stage1']);
    expect(p.completedStages).toEqual([]);
    expect(p.selectedCharacter).toBe('mule');
  });

  it.each([null, undefined, 42, 'text', [], true])('replaces unusable data (%j) with a fresh save', (raw) => {
    const r = sanitizeProgress(raw);
    expect(r.repaired).toBe(true);
    expect(r.progress).toMatchObject({ unlockedStages: ['stage1'], completedStages: [] });
  });

  it('drops tampered values instead of trusting them', () => {
    const { progress, repaired } = sanitizeProgress({
      selectedCharacter: 'hacker',
      unlockedStages: ['stage1', 'stage99', 42, null],
      completedStages: ['stage2'],              // completed but never unlocked
      collected: { stage1: ['froze', 'froze', '<script>', 'x'.repeat(200)], stage77: ['a'] },
      answered: ['loved.small', 'has space', { evil: true }],
      stats: { deaths: -5, defeats: 'many', bestCombo: 1e12 },
      endings: { standard: 'yes', extended: true },
    });
    expect(repaired).toBe(true);
    expect(progress.selectedCharacter).toBe('mule');
    expect(progress.unlockedStages).toEqual(['stage1', 'stage2', 'stage3']);   // completing stage2 opens stage3
    expect(progress.collected).toEqual({ stage1: ['froze'] });
    expect(progress.answered).toEqual(['loved.small']);
    expect(progress.stats).toEqual({ deaths: 0, defeats: 0, bestCombo: 1e9 });
    expect(progress.endings).toEqual({ standard: false, extended: true });
  });

  it('always keeps stage 1 open and never leaves a resume point in a locked stage', () => {
    const { progress } = sanitizeProgress({ unlockedStages: [], run: { stageId: 'stage3', checkpoint: 2 } });
    expect(progress.unlockedStages).toEqual(['stage1']);
    expect(progress.run).toBeNull();
  });

  it('caps list sizes so a hostile save cannot grow without limit', () => {
    const many = Array.from({ length: 500 }, (_, i) => `k${i}`);
    expect(sanitizeProgress({ answered: many }).progress.answered.length).toBeLessThanOrEqual(80);
  });

  it('stores question keys only, never answer text', () => {
    let p = createDefaultProgress();
    p = markAnswered(p, 'loved.small');
    expect(JSON.stringify(p)).not.toMatch(/answer_text|"text"/);
    expect(markAnswered(p, 'this is not a key because it has spaces')).toBe(p);
    expect(unmarkAnswered(p, 'loved.small').answered).toEqual([]);
  });
});

describe('progress: rules', () => {
  it('cannot complete a stage that is still locked', () => {
    const p = createDefaultProgress();
    expect(completeStage(p, 'stage3')).toBe(p);
    expect(unlockStage(p, 'nope')).toBe(p);
  });

  it('completing a stage unlocks the next one and its journal entry, and is idempotent', () => {
    const once = completeStage(createDefaultProgress(), 'stage1');
    expect(once.unlockedStages).toEqual(['stage1', 'stage2']);
    expect(once.journal).toEqual(['stage1']);
    expect(progressEqual(completeStage(once, 'stage1'), once)).toBe(true);
  });

  it('awards a collectible once and rejects fragments that do not exist', () => {
    const a = collectFragment(createDefaultProgress(), 'stage1', 'froze');
    expect(a.added).toBe(true);
    expect(collectFragment(a.progress, 'stage1', 'froze').added).toBe(false);
    expect(collectFragment(a.progress, 'stage1', 'made-up').added).toBe(false);
    expect(collectFragment(a.progress, 'stage9', 'froze').added).toBe(false);
  });

  it('records the extended ending as including the standard one', () => {
    expect(recordEnding(createDefaultProgress(), 'extended').endings).toEqual({ standard: true, extended: true });
    expect(recordEnding(createDefaultProgress(), 'bogus').endings).toEqual({ standard: false, extended: false });
  });

  it('resumes in the first unfinished stage, then the last stage when everything is done', () => {
    let p = createDefaultProgress();
    expect(resumeStageId(p)).toBe('stage1');
    for (const id of STAGE_ORDER) p = completeStage(p, id);
    expect(resumeStageId(p)).toBe('stage4');
  });

  it('needs every optional fragment AND every rooftop question for the extended ending', () => {
    let p = createDefaultProgress();
    expect(extendedEndingStatus(p).ready).toBe(false);
    for (const f of allOptionalFragments()) p = collectFragment(p, f.stageId, f.key).progress;
    expect(extendedEndingStatus(p)).toMatchObject({ ready: false, missingFragments: [] });
    const keys = extendedEndingQuestionKeys();
    for (const k of keys.slice(0, -1)) p = markAnswered(p, k);
    expect(extendedEndingStatus(p).missingAnswers).toEqual([keys.at(-1)]);
    p = markAnswered(p, keys.at(-1));
    expect(extendedEndingStatus(p).ready).toBe(true);
  });
});

describe('progress: merging device and account copies', () => {
  const local = () => {
    let p = createDefaultProgress('2026-01-01T00:00:00.000Z');
    p = collectFragment(p, 'stage1', 'froze').progress;
    p = completeStage(p, 'stage1');
    // startedAt is pinned: the helpers above stamp it with the real clock, which would make two
    // calls of local() differ by a millisecond and the symmetry test flaky.
    return { ...p, startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', stats: { deaths: 9, defeats: 1, bestCombo: 2 }, selectedCharacter: 'mule' };
  };
  const cloud = () => {
    let p = createDefaultProgress('2026-03-01T00:00:00.000Z');
    p = collectFragment(p, 'stage1', 'rush').progress;
    p = markAnswered(p, 'loved.small');
    return { ...p, startedAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z', stats: { deaths: 1, defeats: 5, bestCombo: 7 }, selectedCharacter: 'princess' };
  };

  it('keeps everything either side earned (sets are united)', () => {
    const m = mergeProgress(local(), cloud());
    expect(m.collected.stage1.sort()).toEqual(['froze', 'rush']);
    expect(m.completedStages).toEqual(['stage1']);
    expect(m.unlockedStages).toEqual(['stage1', 'stage2']);
    expect(m.answered).toEqual(['loved.small']);
  });

  it('takes the larger counter, never the smaller', () => {
    expect(mergeProgress(local(), cloud()).stats).toEqual({ deaths: 9, defeats: 5, bestCombo: 7 });
  });

  it('lets the NEWER copy decide single values, so old local data cannot overwrite newer cloud data', () => {
    expect(mergeProgress(local(), cloud()).selectedCharacter).toBe('princess');
    expect(mergeProgress(cloud(), local()).selectedCharacter).toBe('princess');       // order does not matter
    const newerLocal = later(local(), 365 * 86400000);
    expect(mergeProgress(newerLocal, cloud()).selectedCharacter).toBe('mule');
  });

  it('is symmetric, idempotent and never loses anything', () => {
    const ab = mergeProgress(local(), cloud());
    const ba = mergeProgress(cloud(), local());
    expect(progressEqual(ab, ba)).toBe(true);
    expect(progressEqual(mergeProgress(ab, ab), ab)).toBe(true);
    expect(progressEqual(mergeProgress(ab, local()), ab)).toBe(true);
    expect(progressEqual(mergeProgress(ab, cloud()), ab)).toBe(true);
  });

  it('survives a damaged copy on either side', () => {
    expect(progressEqual(mergeProgress(local(), { nonsense: true }), mergeProgress(local(), null))).toBe(true);
    expect(mergeProgress(null, null).unlockedStages).toEqual(['stage1']);
  });

  it('progressEqual ignores only the timestamp', () => {
    const a = local();
    expect(progressEqual(a, later(a))).toBe(true);
    expect(progressEqual(a, { ...a, achievements: ['letter'] })).toBe(false);
  });
});
