// Story content and data-driven rules: the letter, the four stages, the questions, the endings.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LETTER, letterText } from '../src/data/letter.js';
import { STAGES, STAGE_ORDER, LOCATIONS, evaluateStage } from '../src/data/stages.js';
import { CATEGORIES, QUESTIONS, rooftopObjects, extendedEndingQuestionKeys, questionsInCategory } from '../src/data/questions.js';
import { ENDINGS } from '../src/data/memories.js';
import { INTRO_T, INTRO_SECONDS_BEFORE_ENTER } from '../src/game/introTiming.js';
import { validateQuestions, buildSeedSql, SEED_FILE } from '../scripts/generate-question-seed.mjs';

const here = dirname(fileURLToPath(import.meta.url));

describe('the first-meeting letter is preserved exactly', () => {
  const original = readFileSync(join(here, 'fixtures', 'letter.original.txt'), 'utf8').replace(/\n$/, '');

  it('matches the text as it was supplied, character for character', () => {
    expect(letterText()).toBe(original);
  });
  it('keeps every paragraph separate and untouched', () => {
    expect([...LETTER.paragraphs]).toEqual(original.split('\n\n'));
    expect(LETTER.paragraphs).toHaveLength(3);
  });
  it('still contains the spelling and grammar mistakes (nothing was silently corrected)', () => {
    const t = letterText();
    for (const mistake of ['svare', 'colided', 'wven', "didn't know to do", 'i thought you were so cool', 'then i saw you rush']) expect(t).toContain(mistake);
  });
  it('is read-only at runtime', () => {
    expect(Object.isFrozen(LETTER)).toBe(true);
    expect(Object.isFrozen(LETTER.paragraphs)).toBe(true);
  });
  it('the Stage 01 fragment excerpts are verbatim pieces of the letter', () => {
    const t = letterText();
    for (const f of STAGES.stage1.fragments) expect(t, `excerpt for ${f.key}`).toContain(f.excerpt);
  });
});

describe('exactly four stages across three locations', () => {
  it('has the four stages in order with the specified titles', () => {
    expect(STAGE_ORDER).toEqual(['stage1', 'stage2', 'stage3', 'stage4']);
    expect(STAGE_ORDER.map((id) => STAGES[id].title)).toEqual([
      'The Night Our Worlds Collided', 'The Log', 'After Everyone Else Is Asleep', 'Learning Your World',
    ]);
    expect(Object.keys(STAGES)).toHaveLength(4);
  });
  it('uses three locations', () => {
    expect(Object.keys(LOCATIONS)).toHaveLength(3);
    expect(new Set(STAGE_ORDER.map((id) => STAGES[id].location)).size).toBe(3);
  });
  it('chains the unlocks stage 1 -> 2 -> 3 -> 4 -> end', () => {
    expect(STAGE_ORDER.map((id) => STAGES[id].unlocks)).toEqual(['stage2', 'stage3', 'stage4', null]);
  });
  it('Stage 01 has the three required fragments the story names', () => {
    expect(STAGES.stage1.fragments.filter((f) => f.required).map((f) => f.label)).toEqual(['I froze.', 'She rushed to me.', 'The thumb.']);
  });
});

describe('a stage can only be completed by playing it', () => {
  const full1 = { fragments: ['froze', 'rush', 'thumb'], defeats: 5, flags: { meetingRead: true } };
  it('Stage 01 needs 3 fragments, 5 Lightwork defeated and the meeting', () => {
    expect(evaluateStage('stage1', {}).complete).toBe(false);
    expect(evaluateStage('stage1', full1).complete).toBe(true);
    for (const drop of [{ fragments: ['froze', 'rush'] }, { defeats: 4 }, { flags: {} }]) {
      expect(evaluateStage('stage1', { ...full1, ...drop }).complete, JSON.stringify(drop)).toBe(false);
    }
  });
  it('Stage 02 needs the log, the time skip and three conversation fragments', () => {
    const ok = { fragments: ['talk1', 'talk2', 'talk3'], flags: { logVisited: true, timeSkipDone: true } };
    expect(evaluateStage('stage2', ok).complete).toBe(true);
    expect(evaluateStage('stage2', { ...ok, flags: { logVisited: true } }).complete).toBe(false);
  });
  it('Stage 03 needs the car and the talk', () => {
    expect(evaluateStage('stage3', { flags: { carArrived: true, midnightTalk: true } }).complete).toBe(true);
    expect(evaluateStage('stage3', { flags: { carArrived: true } }).complete).toBe(false);
  });
  it('Stage 04 needs four memory objects AND the rooftop', () => {
    expect(evaluateStage('stage4', { counters: { memoryObjects: 4 }, flags: { rooftopReached: true } }).complete).toBe(true);
    expect(evaluateStage('stage4', { counters: { memoryObjects: 3 }, flags: { rooftopReached: true } }).complete).toBe(false);
    expect(evaluateStage('stage4', { counters: { memoryObjects: 8 }, flags: {} }).complete).toBe(false);
  });
  it('an unknown stage is never complete', () => {
    expect(evaluateStage('stage9', { flags: { everything: true } }).complete).toBe(false);
  });
});

describe('the questionnaire is data-driven and matches the specification', () => {
  it('has the eight relationship categories, each opened by one rooftop object', () => {
    expect(rooftopObjects().map((c) => c.key)).toEqual(['loved', 'activities', 'experiences', 'communication', 'upset', 'memories', 'learning', 'hopes']);
    expect(new Set(rooftopObjects().map((c) => c.object)).size).toBe(8);
  });
  it('every rooftop category has questions and every question belongs to a known category', () => {
    for (const c of rooftopObjects()) expect(questionsInCategory(c.key).length, c.key).toBeGreaterThanOrEqual(2);
    const cats = new Set(CATEGORIES.map((c) => c.key));
    for (const q of QUESTIONS) expect(cats.has(q.category), q.key).toBe(true);
  });
  it('includes the example questions from the brief', () => {
    const texts = QUESTIONS.map((q) => q.text);
    for (const t of [
      'What is something small that makes you feel loved?', "What's one thing you wish we did together more often?",
      "When you're upset, do you prefer comfort, space, or a conversation?", "What's a memory of us you never want to forget?",
      "What's something new you want us to try together?", "What's something about me you are still learning?",
      'What do you want our next chapter to look like?',
    ]) expect(texts, t).toContain(t);
  });
  it('supports short, long and multiple-choice answers', () => {
    expect(new Set(QUESTIONS.map((q) => q.type))).toEqual(new Set(['short', 'long', 'choice']));
  });
  it('the extended ending asks for the rooftop questions only', () => {
    const keys = extendedEndingQuestionKeys();
    expect(keys.length).toBeGreaterThanOrEqual(16);
    for (const k of keys) expect(rooftopObjects().map((c) => c.key)).toContain(QUESTIONS.find((q) => q.key === k).category);
  });
  it('sample answers, where present, are labelled as fictional so none is mistaken for a real answer', () => {
    for (const q of QUESTIONS.filter((x) => x.sample)) expect(q.sample, q.key).toMatch(/^Sample \(fictional\)/);
  });
  it('passes the seed generator checks and the database seed matches it exactly', () => {
    expect(validateQuestions()).toEqual([]);
    expect(readFileSync(SEED_FILE, 'utf8')).toBe(buildSeedSql());
  });
});

describe('endings', () => {
  const text = (k) => ENDINGS[k].lines.join(' ');
  it('never claims the relationship is perfect or that a game solves real problems', () => {
    for (const k of ['standard', 'extended']) {
      for (const line of ENDINGS[k].lines) if (/perfect/i.test(line)) expect(line, line).toMatch(/not a perfect/i);
      expect(text(k)).not.toMatch(/\b(always|forever|never fight|fixes?|solved)\b/i);
    }
    expect(text('standard')).toMatch(/no game can solve/i);
  });
  it('is about learning, communicating and showing up', () => {
    expect(text('standard')).toMatch(/learning/i);
    expect(text('standard')).toMatch(/show up/i);
    expect(text('extended')).toMatch(/communicat/i);
  });
  it('tells the player how to reach the extended ending', () => {
    expect(ENDINGS.extendedHint).toMatch(/optional fragment/i);
    expect(ENDINGS.extendedHint).toMatch(/question/i);
  });
});

describe('the opening intro', () => {
  it('shows ENTER after 6 to 10 seconds', () => {
    expect(INTRO_SECONDS_BEFORE_ENTER).toBe(INTRO_T.enter);
    expect(INTRO_T.enter).toBeGreaterThanOrEqual(6);
    expect(INTRO_T.enter).toBeLessThanOrEqual(10);
  });
  it('runs its scenes in order', () => {
    const order = ['logoIn', 'fracture', 'stream', 'asm', 'fireflies', 'drift', 'title', 'enter'];
    for (let i = 1; i < order.length; i += 1) expect(INTRO_T[order[i]], `${order[i]} after ${order[i - 1]}`).toBeGreaterThanOrEqual(INTRO_T[order[i - 1]]);
  });
});
