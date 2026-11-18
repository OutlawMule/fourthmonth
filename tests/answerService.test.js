// The answer service with a fake database. It proves the rules the UI relies on:
// "saved" is only reported after storage confirms, nothing is marked answered before that,
// the partner view never contains anything that was not shared, and no answer text is logged.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from '../src/game/EventBus.js';
import { ProgressManager } from '../src/game/systems/ProgressManager.js';
import { createAnswerService } from '../src/services/answerService.js';
import { setStorageBackend, KEYS } from '../src/utils/storage.js';
import { memoryStorage } from './helpers/memoryStorage.js';
import { whereOf, statusLine, privacyChoices, defaultPrivacy } from '../src/utils/answerLabels.js';

const SECRET = 'sentinel-private-answer-8271';

function fakeCloud(auth) {
  const c = {
    rows: new Map(), calls: [], partnerRows: [], failNext: null, failRemove: false, delay: 0,
    available: () => auth.status().signedIn,
    async upsert(key, { text, choice, visibility, status }) {
      c.calls.push(['upsert', key, visibility, status]);
      if (c.delay) await new Promise((r) => setTimeout(r, c.delay));
      if (c.failNext) { const e = c.failNext; c.failNext = null; throw e; }
      const row = { questionKey: key, text: text ?? '', choice: choice ?? null, visibility, status, updatedAt: new Date().toISOString() };
      c.rows.set(key, row);
      return row;
    },
    async remove(key) {
      c.calls.push(['remove', key]);
      if (c.failRemove) throw new Error('Failed to fetch');
      c.rows.delete(key);
    },
    async listMine() { return [...c.rows.values()]; },
    async listPartner() { return c.partnerRows; },
  };
  return c;
}

function setup({ signedIn = false, paired = false } = {}) {
  const storage = memoryStorage();
  setStorageBackend(storage);
  const bus = new EventBus();
  const progress = new ProgressManager(bus);
  const authState = { signedIn, userId: signedIn ? 'user-1' : null };
  const auth = { status: () => ({ configured: true, signedIn: authState.signedIn, userId: authState.userId, name: 'Me' }), get userId() { return authState.userId; } };
  const relationship = { state: { status: paired ? 'active' : 'solo', live: false, lastSyncAt: null, partner: { display_name: 'Pat' } } };
  const cloud = fakeCloud(auth);
  const answers = createAnswerService({ bus, app: { progress }, auth, relationship, cloud });
  const events = [];
  bus.on('answers:changed', (e) => events.push(e.reason));
  return { storage, bus, progress, authState, relationship, cloud, answers, events };
}

afterEach(() => { setStorageBackend(null); vi.restoreAllMocks(); });

describe('labels for where an answer lives', () => {
  it('uses the three plain-language places, and never calls a draft "shared"', () => {
    expect(whereOf('device', 'submitted')).toBe('device');
    expect(whereOf('private', 'submitted')).toBe('account');
    expect(whereOf('shared', 'submitted')).toBe('shared');
    expect(whereOf('shared', 'draft')).toBe('account');
    expect(statusLine({ privacy: 'shared', status: 'draft' })).toMatch(/not shared until you submit/);
    expect(statusLine(null)).toBe('Not answered yet');
  });
  it('offers private only when signed in and sharing only when paired', () => {
    const by = (s) => Object.fromEntries(privacyChoices(s).map((c) => [c.value, c.enabled]));
    expect(by({})).toEqual({ device: true, private: false, shared: false });
    expect(by({ configured: true, signedIn: true })).toEqual({ device: true, private: true, shared: false });
    expect(by({ configured: true, signedIn: true, paired: true })).toEqual({ device: true, private: true, shared: true });
    expect(defaultPrivacy({ signedIn: false })).toBe('device');
    expect(defaultPrivacy({ signedIn: true })).toBe('private');   // never shared by default
  });
  it('is honest about who can read a Private answer: hidden from the partner in the game, not from whoever runs the database', () => {
    const priv = privacyChoices({ configured: true, signedIn: true, paired: true }).find((c) => c.value === 'private');
    expect(priv.hint).toMatch(/partner cannot see it in the game/i);
    expect(priv.hint).toMatch(/whoever runs the database/i);
    expect(priv.hint).not.toMatch(/only you/i);
  });
});

describe('guests: answers stay on the device', () => {
  it('saves on the device, counts the question key (not the text) and sends nothing anywhere', async () => {
    const t = setup();
    expect(t.answers.defaultPrivacy()).toBe('device');
    const r = await t.answers.save('loved.small', { text: SECRET }, { privacy: 'device' });
    expect(r).toMatchObject({ ok: true, answer: { where: 'device', status: 'submitted', text: SECRET } });
    expect(t.progress.state.answered).toEqual(['loved.small']);
    expect(t.storage.getItem(KEYS.progress)).not.toContain(SECRET);       // progress never holds answer text
    expect(t.storage.getItem(KEYS.localAnswers)).toContain(SECRET);       // only the device-only answers store does
    expect(t.cloud.calls).toEqual([]);
  });

  it('refuses to save to an account or share when not signed in, and changes nothing', async () => {
    const t = setup();
    for (const privacy of ['private', 'shared']) {
      const r = await t.answers.save('loved.small', { text: SECRET }, { privacy });
      expect(r.ok).toBe(false);
    }
    expect(t.progress.state.answered).toEqual([]);
    expect(t.answers.peekMine('loved.small')).toBeNull();
    expect(t.storage.getItem(KEYS.localAnswers)).toBeNull();
  });

  it('does not say "saved" when the browser cannot store it', async () => {
    const t = setup();
    t.storage.failWrites = true;
    const r = await t.answers.save('loved.small', { text: SECRET }, { privacy: 'device' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Could not save on this device/);
    expect(t.progress.state.answered).toEqual([]);
    expect(t.answers.peekMine('loved.small')).toBeNull();
  });

  it('saves drafts without counting them as answered, then counts them once submitted', async () => {
    const t = setup();
    await t.answers.save('loved.small', { text: 'half a thou' }, { privacy: 'device', status: 'draft' });
    expect(t.answers.peekMine('loved.small')).toMatchObject({ status: 'draft' });
    expect(t.progress.state.answered).toEqual([]);
    await t.answers.save('loved.small', { text: 'a whole thought' }, { privacy: 'device' });
    expect(t.progress.state.answered).toEqual(['loved.small']);
  });

  it('rejects empty, too-long, wrong-option and multi-line input before saving', async () => {
    const t = setup();
    expect((await t.answers.save('loved.small', { text: '  ' })).ok).toBe(false);
    expect((await t.answers.save('act.fav', { text: 'x'.repeat(161) })).ok).toBe(false);
    expect((await t.answers.save('act.fav', { text: 'a\nb' })).ok).toBe(false);
    expect((await t.answers.save('upset.need', { choice: 'Teleport' })).ok).toBe(false);
    expect((await t.answers.save('nope', { text: 'x' })).ok).toBe(false);
    expect(t.progress.state.answered).toEqual([]);
  });
});

describe('signed in: the database has to confirm', () => {
  it('reports success only with the row the database returned, then counts it', async () => {
    const t = setup({ signedIn: true });
    const r = await t.answers.save('loved.small', { text: SECRET }, { privacy: 'private' });
    expect(r).toMatchObject({ ok: true, answer: { where: 'account', privacy: 'private' } });
    expect(t.cloud.rows.get('loved.small').text).toBe(SECRET);
    expect(t.progress.state.answered).toEqual(['loved.small']);
    expect(t.storage.getItem(KEYS.localAnswers)).toBeNull();               // not duplicated on the device
  });

  it('a failed save is reported as failed, is not counted and leaves no local copy', async () => {
    const t = setup({ signedIn: true });
    t.cloud.failNext = new Error('Failed to fetch');
    const r = await t.answers.save('loved.small', { text: SECRET }, { privacy: 'private' });
    expect(r).toMatchObject({ ok: false });
    expect(r.error).toMatch(/Could not reach the server/);
    expect(r.error).not.toContain(SECRET);
    expect(t.answers.peekMine('loved.small')).toBeNull();
    expect(t.progress.state.answered).toEqual([]);
    expect(t.storage.getItem(KEYS.localAnswers)).toBeNull();
  });

  it('refuses to share without a partner and never calls the database for it', async () => {
    const t = setup({ signedIn: true, paired: false });
    const r = await t.answers.save('loved.small', { text: SECRET }, { privacy: 'shared' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/needs a partner/);
    expect(t.cloud.calls).toEqual([]);
  });

  it('shares only a submitted answer: a shared draft is still "saved to your account"', async () => {
    const t = setup({ signedIn: true, paired: true });
    const d = await t.answers.save('loved.small', { text: 'not yet' }, { privacy: 'shared', status: 'draft' });
    expect(d.answer).toMatchObject({ where: 'account', status: 'draft' });
    expect(t.progress.state.answered).toEqual([]);
    const s = await t.answers.save('loved.small', { text: 'ready' }, { privacy: 'shared' });
    expect(s.answer).toMatchObject({ where: 'shared', status: 'submitted' });
    expect(t.progress.state.answered).toEqual(['loved.small']);
  });

  it('writes to one question one at a time, so the last click wins', async () => {
    const t = setup({ signedIn: true });
    t.cloud.delay = 30;
    const first = t.answers.save('act.fav', { text: 'first' }, { privacy: 'private' });
    t.cloud.delay = 0;
    const second = t.answers.save('act.fav', { text: 'second' }, { privacy: 'private' });
    await Promise.all([first, second]);
    expect(t.cloud.rows.get('act.fav').text).toBe('second');
    expect(t.answers.peekMine('act.fav').text).toBe('second');
  });
});

describe('moving an answer between the device and the account', () => {
  it('device -> account removes the device copy only after the database confirmed', async () => {
    const t = setup({ signedIn: true });
    await t.answers.save('loved.small', { text: 'v1' }, { privacy: 'device' });
    expect(t.storage.getItem(KEYS.localAnswers)).toContain('v1');
    t.cloud.failNext = new Error('Failed to fetch');
    expect((await t.answers.save('loved.small', { text: 'v2' }, { privacy: 'private' })).ok).toBe(false);
    expect(t.storage.getItem(KEYS.localAnswers)).toContain('v1');          // still safe on the device
    expect((await t.answers.save('loved.small', { text: 'v2' }, { privacy: 'private' })).ok).toBe(true);
    expect(t.storage.getItem(KEYS.localAnswers)).not.toContain('v1');
    expect(t.answers.peekMine('loved.small')).toMatchObject({ text: 'v2', where: 'account' });
  });

  it('account -> device removes the account copy, and says so if that part fails', async () => {
    const t = setup({ signedIn: true });
    await t.answers.save('loved.small', { text: 'v1' }, { privacy: 'private' });
    const ok = await t.answers.save('loved.small', { text: 'v2' }, { privacy: 'device' });
    expect(ok).toMatchObject({ ok: true, notice: null, answer: { where: 'device', text: 'v2' } });
    expect(t.cloud.rows.has('loved.small')).toBe(false);

    await t.answers.save('act.fav', { text: 'a' }, { privacy: 'private' });
    t.cloud.failRemove = true;
    const warn = await t.answers.save('act.fav', { text: 'b' }, { privacy: 'device' });
    expect(warn.ok).toBe(true);
    expect(warn.notice).toMatch(/could not be removed/);
  });

  it('remove deletes both copies and un-counts the question', async () => {
    const t = setup({ signedIn: true });
    await t.answers.save('loved.small', { text: 'x' }, { privacy: 'private' });
    expect(await t.answers.remove('loved.small')).toEqual({ ok: true });
    expect(t.cloud.rows.size).toBe(0);
    expect(t.answers.peekMine('loved.small')).toBeNull();
    expect(t.progress.state.answered).toEqual([]);
  });
});

describe('the partner view', () => {
  const row = (key, text) => ({ questionKey: key, text, choice: null, updatedAt: '2026-05-01T00:00:00.000Z' });

  it('shows what the partner shared, and only when paired', async () => {
    const t = setup({ signedIn: true, paired: true });
    t.cloud.partnerRows = [row('loved.small', 'their shared answer')];
    await t.answers.refreshPartner();
    expect(t.answers.peekPartner('loved.small')).toMatchObject({ text: 'their shared answer', mine: false });
    t.relationship.state.status = 'solo';
    await t.answers.refreshPartner();
    expect(t.answers.peekAllPartner()).toEqual([]);
  });

  it('a repeated or duplicate refresh does not announce a change twice', async () => {
    const t = setup({ signedIn: true, paired: true });
    t.cloud.partnerRows = [row('loved.small', 'same')];
    await t.answers.refreshPartner();
    await t.answers.refreshPartner();
    await t.answers.refreshPartner();
    expect(t.events.filter((e) => e === 'partner')).toHaveLength(1);
    t.cloud.partnerRows = [row('loved.small', 'same'), row('act.fav', 'new one')];
    await t.answers.refreshPartner();
    expect(t.events.filter((e) => e === 'partner')).toHaveLength(2);
  });

  it('keeps the last good view when a refresh fails, and reports the error', async () => {
    const t = setup({ signedIn: true, paired: true });
    t.cloud.partnerRows = [row('loved.small', 'kept')];
    await t.answers.refreshPartner();
    t.cloud.listPartner = async () => { throw new Error('Failed to fetch'); };
    const r = await t.answers.refreshPartner();
    expect(r.ok).toBe(false);
    expect(t.answers.peekPartner('loved.small').text).toBe('kept');
  });

  it('signing out drops account answers from memory but keeps device answers', async () => {
    const t = setup({ signedIn: true, paired: true });
    await t.answers.save('loved.small', { text: 'in the account' }, { privacy: 'private' });
    await t.answers.save('act.fav', { text: 'on the device' }, { privacy: 'device' });
    t.cloud.partnerRows = [row('hope.next', 'partner')];
    await t.answers.refreshPartner();
    t.authState.signedIn = false; t.authState.userId = null;
    t.bus.emit('auth:signed-out');
    expect(t.answers.peekMine('loved.small')).toBeNull();
    expect(t.answers.peekMine('act.fav')).toMatchObject({ text: 'on the device' });
    expect(t.answers.peekAllPartner()).toEqual([]);
  });
});

describe('loading and clearing', () => {
  it('counts submitted answers found in the account after signing in on a new device', async () => {
    const t = setup({ signedIn: true });
    t.cloud.rows.set('hope.next', { questionKey: 'hope.next', text: 'from another device', choice: null, visibility: 'private', status: 'submitted', updatedAt: '2026-05-01T00:00:00.000Z' });
    t.cloud.rows.set('hope.keep', { questionKey: 'hope.keep', text: 'only a draft', choice: null, visibility: 'private', status: 'draft', updatedAt: '2026-05-01T00:00:00.000Z' });
    expect((await t.answers.load()).ok).toBe(true);
    expect(t.progress.state.answered).toEqual(['hope.next']);
    expect(t.answers.peekMine('hope.keep')).toMatchObject({ status: 'draft', where: 'account' });
  });

  it('clearing device answers never touches the account, and un-counts only what is not safe elsewhere', async () => {
    const t = setup({ signedIn: true });
    await t.answers.save('act.fav', { text: 'device only' }, { privacy: 'device' });
    await t.answers.save('loved.small', { text: 'account' }, { privacy: 'private' });
    expect(t.answers.clearDevice()).toMatchObject({ ok: true, count: 1 });
    expect(t.answers.peekMine('act.fav')).toBeNull();
    expect(t.answers.peekMine('loved.small')).toMatchObject({ text: 'account' });
    expect(t.progress.state.answered).toEqual(['loved.small']);
  });

  it('keeps answers when game progress is reset (a new game never deletes answers)', async () => {
    const t = setup({ signedIn: true });
    await t.answers.save('act.fav', { text: 'keep me' }, { privacy: 'device' });
    await t.answers.save('loved.small', { text: 'and me' }, { privacy: 'private' });
    t.progress.newGame('princess');
    expect(t.answers.peekMine('act.fav')).toMatchObject({ text: 'keep me' });
    expect(t.cloud.rows.has('loved.small')).toBe(true);
    expect(t.storage.getItem(KEYS.localAnswers)).toContain('keep me');
  });
});

describe('privacy hygiene', () => {
  it('never writes answer text to the console, success or failure', async () => {
    const spies = ['log', 'info', 'debug', 'warn', 'error'].map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const t = setup({ signedIn: true, paired: true });
    await t.answers.save('loved.small', { text: SECRET }, { privacy: 'shared' });
    t.cloud.failNext = new Error('Failed to fetch');
    await t.answers.save('act.fav', { text: SECRET }, { privacy: 'private' });
    await t.answers.save('act.more', { text: SECRET }, { privacy: 'device' });
    await t.answers.remove('loved.small');
    t.answers.clearDevice();
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(SECRET);
  });
});
