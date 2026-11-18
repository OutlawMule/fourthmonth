// Versioned, validated localStorage access. Never throws (private windows, quota,
// blocked storage). Never stores credentials: Supabase Auth manages its own session.
import { sanitizeProgress, createDefaultProgress, PROGRESS_VERSION } from './progress.js';
import { sanitizeSettings, DEFAULT_SETTINGS } from './settings.js';
import { sanitizeClosing } from './closing.js';

const PREFIX = 'mule-princess:v1:';
export const KEYS = Object.freeze({
  progress: PREFIX + 'progress',
  settings: PREFIX + 'settings',
  localAnswers: PREFIX + 'local-answers', // device-only answers (guest mode / "only on this device")
  closing: PREFIX + 'closing-message',    // optional edited ending text (device copy)
});

/** Pluggable backend so tests can run without a browser. */
let backend = null;
export function setStorageBackend(b) { backend = b; }
function store() {
  if (backend) return backend;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* blocked */ }
  return null;
}

export function readJSON(key) {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null; // corrupt JSON -> treated as "nothing saved"
  }
}

export function writeJSON(key, value) {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key) {
  const s = store();
  if (!s) return;
  try { s.removeItem(key); } catch { /* ignore */ }
}

export function storageAvailable() {
  const s = store();
  if (!s) return false;
  try {
    const k = PREFIX + 'probe';
    s.setItem(k, '1');
    s.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

// ---- progress -------------------------------------------------------------
export function loadProgress() {
  const raw = readJSON(KEYS.progress);
  if (raw == null) return { progress: createDefaultProgress(), existed: false, repaired: false };
  const { progress, repaired } = sanitizeProgress(raw);
  return { progress, existed: true, repaired };
}
export function saveProgress(progress) {
  return writeJSON(KEYS.progress, { ...progress, version: PROGRESS_VERSION });
}
export function hasSavedProgress() {
  const raw = readJSON(KEYS.progress);
  if (!raw) return false;
  const { progress } = sanitizeProgress(raw);
  return progress.startedAt != null;
}
export function clearProgress() { removeKey(KEYS.progress); }

// ---- settings -------------------------------------------------------------
export function loadSettings() {
  const raw = readJSON(KEYS.settings);
  return sanitizeSettings(raw ?? DEFAULT_SETTINGS);
}
export function saveSettings(settings) { return writeJSON(KEYS.settings, sanitizeSettings(settings)); }

// ---- device-only answers ---------------------------------------------------
// Entry shape: { text, choice, status: 'draft' | 'submitted', updatedAt }.
// Older entries that only had { text, updatedAt } load as submitted answers.
export function sanitizeLocalAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,47}$/.test(k) || !v || typeof v !== 'object') continue;
    const text = typeof v.text === 'string' ? v.text.slice(0, 4000) : '';
    const choice = typeof v.choice === 'string' && v.choice ? v.choice.slice(0, 120) : null;
    if (!text && !choice) continue;
    out[k] = {
      text,
      choice,
      status: v.status === 'draft' ? 'draft' : 'submitted',
      updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : null,
    };
  }
  return out;
}
export function loadLocalAnswers() { return sanitizeLocalAnswers(readJSON(KEYS.localAnswers)); }
export function saveLocalAnswers(map) { return writeJSON(KEYS.localAnswers, map); }
export function clearLocalAnswers() { removeKey(KEYS.localAnswers); }

// ---- editable closing message (device copy) ----------------------------------
export function loadClosing() { return sanitizeClosing(readJSON(KEYS.closing)); }
export function saveClosing(value) { return writeJSON(KEYS.closing, sanitizeClosing(value)); }
export function clearClosing() { removeKey(KEYS.closing); }
