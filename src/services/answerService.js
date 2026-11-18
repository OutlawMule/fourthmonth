// Questionnaire answers (app.answers). One interface, two places an answer can live:
//
//   'device'   this browser only (localStorage). Works for guests and offline. Never sent anywhere.
//   'private'  the database, readable only by the author (Row Level Security).
//   'shared'   the database, readable by the author and their paired partner once submitted.
//
// Rules this module enforces for the UI:
//  * An answer is reported as saved only after the place it was written to confirms it
//    (localStorage write succeeded / the database returned the stored row).
//  * The progress counter (`answered`, used for the extended ending) is updated only after
//    that confirmation, and stores question keys only, never answer text.
//  * Nothing here logs answer text, and nothing puts it in a URL or an error message.
//  * Moving an answer between the device and the account never leaves it in two places
//    without telling the player.
import { getQuestion } from '../data/questions.js';
import { validateAnswer, hasContent, describeError } from '../utils/validation.js';
import { loadLocalAnswers, saveLocalAnswers, clearLocalAnswers } from '../utils/storage.js';
import { PRIVACIES, whereOf, privacyChoices, defaultPrivacy } from '../utils/answerLabels.js';

const REFRESH_DEBOUNCE_MS = 300;

export function createAnswerService({ bus, app, auth, relationship, cloud }) {
  let local = loadLocalAnswers();        // device answers: { [questionKey]: { text, choice, status, updatedAt } }
  const mine = new Map();                // account answers (cache of what the database confirmed)
  let partner = new Map();               // partner's shared answers
  let partnerSig = '';
  let loadedFor = null;                  // user id the caches belong to
  let lastRefreshError = null;
  let debounce = null;

  const pm = () => app.progress;
  const emit = (reason, questionKey) => bus.emit('answers:changed', { reason, questionKey });

  const modeNow = () => {
    const s = auth.status();
    return { configured: s.configured, signedIn: s.signedIn, paired: relationship.state.status === 'active' };
  };

  // ------------------------------------------------------------------------- shaping
  function fromLocal(key) {
    const r = local[key];
    return r ? { questionKey: key, text: r.text, choice: r.choice, status: r.status, privacy: 'device', where: 'device', updatedAt: r.updatedAt, mine: true } : null;
  }
  function fromCloud(key) {
    const r = mine.get(key);
    if (!r) return null;
    const privacy = r.visibility === 'shared' ? 'shared' : 'private';
    return { questionKey: key, text: r.text, choice: r.choice, status: r.status, privacy, where: whereOf(privacy, r.status), updatedAt: r.updatedAt, mine: true };
  }
  const newer = (a, b) => (Date.parse(a.updatedAt ?? 0) >= Date.parse(b.updatedAt ?? 0) ? a : b);

  function peekMine(key) {
    const a = fromCloud(key), b = fromLocal(key);
    return a && b ? newer(a, b) : a ?? b ?? null;
  }
  function peekAllMine() {
    const keys = new Set([...Object.keys(local), ...mine.keys()]);
    return [...keys].map(peekMine).filter(Boolean);
  }
  const peekPartner = (key) => partner.get(key) ?? null;

  // --------------------------------------------------------------- progress counter
  function markAnswered(key, status) {
    try { pm()?.setAnswered(key, status === 'submitted'); } catch { /* progress must never break saving */ }
  }
  /** Keeps the "answered" counter honest after loading: every submitted answer counts. */
  function syncAnsweredFlags() {
    for (const a of peekAllMine()) if (a.status === 'submitted' && !pm()?.state.answered.includes(a.questionKey)) markAnswered(a.questionKey, 'submitted');
  }

  // ----------------------------------------------------------------------- loading
  async function load() {
    const s = auth.status();
    if (!s.signedIn || !cloud.available()) {
      const had = mine.size || partner.size;
      mine.clear(); partner = new Map(); partnerSig = ''; loadedFor = null;
      if (had) emit('load');
      syncAnsweredFlags();
      return { ok: true };
    }
    try {
      const rows = await cloud.listMine();
      mine.clear();
      for (const r of rows) mine.set(r.questionKey, r);
      loadedFor = s.userId;
      lastRefreshError = null;
      syncAnsweredFlags();
      emit('load');
      await refreshPartner();
      return { ok: true };
    } catch (err) {
      lastRefreshError = describeError(err);
      return { ok: false, error: lastRefreshError };
    }
  }

  async function refreshPartner() {
    const s = auth.status();
    if (!s.signedIn || relationship.state.status !== 'active' || !cloud.available()) {
      if (partner.size) { partner = new Map(); partnerSig = ''; emit('partner'); }
      return { ok: true };
    }
    try {
      const rows = await cloud.listPartner();
      const next = new Map(rows.map((r) => [r.questionKey, { questionKey: r.questionKey, text: r.text, choice: r.choice, updatedAt: r.updatedAt, mine: false }]));
      const sig = [...next.values()].map((r) => `${r.questionKey}|${r.updatedAt}`).sort().join(',');
      lastRefreshError = null;
      if (sig !== partnerSig) { partner = next; partnerSig = sig; emit('partner'); }   // identical refetch = no event (duplicate-safe)
      return { ok: true };
    } catch (err) {
      lastRefreshError = describeError(err);
      return { ok: false, error: lastRefreshError };
    }
  }

  // ------------------------------------------------------------------------ writing
  const chains = new Map();
  /** One write at a time per question, so a double click can never apply out of order. */
  function serial(key, fn) {
    const prev = chains.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    chains.set(key, next);
    const clear = () => { if (chains.get(key) === next) chains.delete(key); };
    next.then(clear, clear);
    return next;
  }

  const fail = (error) => ({ ok: false, error });

  async function removeCloudCopy(key) {
    try { await cloud.remove(key); mine.delete(key); return { ok: true }; } catch (err) { return { ok: false, error: describeError(err) }; }
  }
  function removeLocalCopy(key) {
    if (!local[key]) return true;
    const next = { ...local };
    delete next[key];
    if (!saveLocalAnswers(next)) return false;
    local = next;
    return true;
  }

  async function doSave(key, input, { privacy, status }) {
    if (!getQuestion(key)) return fail('Unknown question.');
    if (!PRIVACIES.includes(privacy)) return fail('Choose where to save this answer.');
    if (status !== 'draft' && status !== 'submitted') return fail('Unknown answer status.');
    const v = validateAnswer(key, input, { allowEmpty: status === 'draft' });
    if (!v.ok) return fail(v.error);
    if (status === 'draft' && !hasContent(v.value)) return fail('Write something first to save a draft.');
    const { text, choice } = v.value;
    const hadCloud = mine.has(key);
    const hadLocal = Boolean(local[key]);

    if (privacy === 'device') {
      const next = { ...local, [key]: { text, choice, status, updatedAt: new Date().toISOString() } };
      if (!saveLocalAnswers(next)) return fail('Could not save on this device. Browser storage looks blocked or full.');
      local = next;                                  // confirmed by the write above
      let notice = null;
      if (hadCloud) {
        const r = await removeCloudCopy(key);        // moving to the device: do not leave a copy in the account unannounced
        if (!r.ok) notice = 'Saved on this device, but the earlier copy in your account could not be removed. Open this question again to retry.';
      }
      markAnswered(key, status);
      emit('save', key);
      return { ok: true, answer: peekMine(key), notice };
    }

    const m = modeNow();
    if (!m.signedIn) return fail('Sign in to save to your account, or choose "Only on this device".');
    if (privacy === 'shared' && !m.paired) return fail('Sharing needs a partner. Pair first, or keep this answer private.');
    let row;
    try {
      row = await cloud.upsert(key, { text, choice, visibility: privacy === 'shared' ? 'shared' : 'private', status });
    } catch (err) {
      return fail(describeError(err));                // nothing is reported as saved, nothing is marked answered
    }
    mine.set(key, row);                               // the row the database returned
    let notice = null;
    if (hadLocal && !removeLocalCopy(key)) notice = 'Saved to your account. The older copy on this device could not be removed.';
    markAnswered(key, status);
    emit('save', key);
    return { ok: true, answer: peekMine(key), notice };
  }

  async function doRemove(key) {
    if (!getQuestion(key)) return fail('Unknown question.');
    if (local[key] && !removeLocalCopy(key)) return fail('Could not update this device. Browser storage looks blocked.');
    if (mine.has(key) || modeNow().signedIn) {
      const r = await removeCloudCopy(key);
      if (!r.ok) { emit('remove', key); return fail(r.error); }
    }
    markAnswered(key, 'draft');                       // un-count it
    emit('remove', key);
    return { ok: true };
  }

  // -------------------------------------------------------------------------- API
  const service = {
    mode: modeNow,
    privacyChoices: () => privacyChoices(modeNow()),
    defaultPrivacy: () => defaultPrivacy(modeNow()),

    peekMine,
    peekAllMine,
    peekPartner,
    peekAllPartner: () => [...partner.values()],
    /** True when any account answers have been loaded for the signed-in user. */
    get loaded() { return loadedFor != null && loadedFor === auth.userId; },
    get lastError() { return lastRefreshError; },
    /** 'live' (Realtime connected), 'polling' (timer + focus refetch), or 'off' (not signed in / not paired). */
    syncInfo() {
      const rs = relationship.state;
      const m = modeNow();
      return {
        live: Boolean(m.signedIn && rs.status === 'active' && rs.live),
        mode: !m.signedIn ? 'off' : rs.status !== 'active' ? 'off' : rs.live ? 'live' : 'polling',
        lastSyncAt: rs.lastSyncAt,
        partnerName: rs.partner?.display_name ?? null,
        error: lastRefreshError,
      };
    },

    load,
    refreshPartner,
    save: (key, input, opts = {}) => serial(key, () => doSave(key, input, { privacy: opts.privacy ?? defaultPrivacy(modeNow()), status: opts.status ?? 'submitted' })),
    remove: (key) => serial(key, () => doRemove(key)),

    /** Deletes every device-only answer. Never touches the account or the partner's view. */
    clearDevice() {
      const keys = Object.keys(local);
      clearLocalAnswers();
      local = loadLocalAnswers();                      // re-read: if removal failed (blocked storage) we say so
      if (Object.keys(local).length) return { ok: false, error: 'Could not clear this device. Browser storage looks blocked.' };
      for (const k of keys) if (mine.get(k)?.status !== 'submitted') markAnswered(k, 'draft');
      emit('clear');
      return { ok: true, count: keys.length };
    },
    deviceAnswerCount: () => Object.keys(local).length,

    /**
     * After the player deleted their online data: drop the in-memory account copies so nothing stale
     * is shown. (The database rows are already gone; device answers are untouched.)
     */
    forgetAccountAnswers() {
      const keys = [...mine.keys()];
      mine.clear(); partner = new Map(); partnerSig = ''; loadedFor = null;
      for (const k of keys) if (!local[k]) markAnswered(k, 'draft');
      emit('load');
    },

    /** Subscribe to changes (own saves, partner updates, sign-in/out). Returns an unsubscribe function. */
    subscribe(fn) { return bus.on('answers:changed', fn); },
  };

  // ------------------------------------------------------------------------ wiring
  bus.on('auth:signed-in', () => { load(); });
  bus.on('auth:signed-out', () => {
    mine.clear(); partner = new Map(); partnerSig = ''; loadedFor = null;   // the device copy stays; the account copy is gone from memory
    emit('load');
  });
  bus.on('relationship:changed', () => { clearTimeout(debounce); debounce = setTimeout(refreshPartner, REFRESH_DEBOUNCE_MS); });
  bus.on('partner-answers:signal', () => { clearTimeout(debounce); debounce = setTimeout(refreshPartner, REFRESH_DEBOUNCE_MS); });
  return service;
}
