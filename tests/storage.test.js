import { describe, it, expect, afterEach } from 'vitest';
import {
  setStorageBackend, KEYS, readJSON, writeJSON, loadProgress, saveProgress, hasSavedProgress, clearProgress, loadSettings, saveSettings,
  sanitizeLocalAnswers, loadLocalAnswers, saveLocalAnswers, clearLocalAnswers, loadClosing, saveClosing, storageAvailable,
} from '../src/utils/storage.js';
import { createDefaultProgress, PROGRESS_VERSION } from '../src/utils/progress.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/utils/settings.js';
import { memoryStorage } from './helpers/memoryStorage.js';

afterEach(() => setStorageBackend(null));

describe('versioned, validated local storage', () => {
  it('never throws on corrupt JSON and treats it as "nothing saved"', () => {
    const s = memoryStorage(); setStorageBackend(s);
    s.setItem(KEYS.progress, '{not json');
    expect(readJSON(KEYS.progress)).toBeNull();
    expect(loadProgress()).toMatchObject({ existed: false });
    expect(hasSavedProgress()).toBe(false);
  });

  it('reports a failed write instead of pretending it worked', () => {
    const s = memoryStorage({ failWrites: true }); setStorageBackend(s);
    expect(writeJSON(KEYS.progress, { a: 1 })).toBe(false);
    expect(saveProgress(createDefaultProgress())).toBe(false);
    expect(storageAvailable()).toBe(false);
  });

  it('saves progress with its version and loads it back', () => {
    const s = memoryStorage(); setStorageBackend(s);
    const p = { ...createDefaultProgress(), startedAt: new Date().toISOString(), selectedCharacter: 'princess' };
    expect(saveProgress(p)).toBe(true);
    expect(JSON.parse(s.getItem(KEYS.progress)).version).toBe(PROGRESS_VERSION);
    expect(loadProgress()).toMatchObject({ existed: true, repaired: false, progress: { selectedCharacter: 'princess' } });
    expect(hasSavedProgress()).toBe(true);
    clearProgress();
    expect(hasSavedProgress()).toBe(false);
  });

  it('repairs a hand-edited save rather than loading it blindly', () => {
    const s = memoryStorage(); setStorageBackend(s);
    s.setItem(KEYS.progress, JSON.stringify({ selectedCharacter: 'dragon', unlockedStages: ['stage4'], completedStages: ['stage4'] }));
    const { progress, repaired } = loadProgress();
    expect(repaired).toBe(true);
    expect(progress.selectedCharacter).toBe('mule');
    expect(progress.unlockedStages).toContain('stage1');
  });

  it('has Continue disabled without a started save', () => {
    const s = memoryStorage(); setStorageBackend(s);
    saveProgress(createDefaultProgress());   // an untouched default has no startedAt
    expect(hasSavedProgress()).toBe(false);
  });

  it('validates settings on load and keeps the defaults for anything invalid', () => {
    const s = memoryStorage(); setStorageBackend(s);
    s.setItem(KEYS.settings, JSON.stringify({ musicVolume: 99, textScale: 'huge', muted: 'yes', reducedMotion: true }));
    expect(loadSettings()).toMatchObject({ musicVolume: 1, textScale: DEFAULT_SETTINGS.textScale, muted: false, reducedMotion: true });
    expect(saveSettings({ ...DEFAULT_SETTINGS, textScale: 5 })).toBe(true);
    expect(loadSettings().textScale).toBe(1.5);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('device-only answers', () => {
  it('round-trips drafts and submitted answers', () => {
    setStorageBackend(memoryStorage());
    saveLocalAnswers({ 'loved.small': { text: 'hi', choice: null, status: 'draft', updatedAt: '2026-01-01T00:00:00.000Z' } });
    expect(loadLocalAnswers()['loved.small']).toMatchObject({ text: 'hi', status: 'draft' });
    clearLocalAnswers();
    expect(loadLocalAnswers()).toEqual({});
  });
  it('upgrades the older text-only format and drops junk', () => {
    const out = sanitizeLocalAnswers({
      'loved.small': { text: 'old format' },
      'bad key!': { text: 'x' },
      'empty.one': { text: '', choice: null },
      'act.fav': { text: 'y'.repeat(9000), status: 'weird' },
      'comm.style': { text: '', choice: 'Text', status: 'draft' },
      __proto__x: 5,
    });
    expect(Object.keys(out).sort()).toEqual(['act.fav', 'comm.style', 'loved.small']);
    expect(out['loved.small']).toMatchObject({ text: 'old format', status: 'submitted', choice: null });
    expect(out['act.fav'].text).toHaveLength(4000);
    expect(out['act.fav'].status).toBe('submitted');
    expect(sanitizeLocalAnswers([1, 2])).toEqual({});
    expect(sanitizeLocalAnswers('x')).toEqual({});
  });
  it('keeps the edited closing message on the device, validated', () => {
    setStorageBackend(memoryStorage());
    expect(saveClosing({ standard: { title: 'Mine', lines: ['One'] }, junk: 1 })).toBe(true);
    expect(loadClosing()).toEqual({ standard: { title: 'Mine', lines: ['One'] } });
  });
});

describe('what is (not) stored in the browser', () => {
  it('uses only the four documented keys, none of which can hold credentials', () => {
    expect(Object.values(KEYS).sort()).toEqual([
      'mule-princess:v1:closing-message', 'mule-princess:v1:local-answers', 'mule-princess:v1:progress', 'mule-princess:v1:settings',
    ]);
    for (const k of Object.values(KEYS)) expect(k).not.toMatch(/token|password|secret|session|auth/i);
  });
});
