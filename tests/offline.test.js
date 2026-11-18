// With no Supabase configuration the whole game, including every service, must still work as a guest.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EventBus } from '../src/game/EventBus.js';
import { ProgressManager } from '../src/game/systems/ProgressManager.js';
import { setStorageBackend, KEYS } from '../src/utils/storage.js';
import { createServices } from '../src/services/index.js';
import { isConfigured, getClient } from '../src/services/supabase.js';
import { memoryStorage } from './helpers/memoryStorage.js';

afterEach(() => setStorageBackend(null));

function boot() {
  const storage = memoryStorage(); setStorageBackend(storage);
  const bus = new EventBus();
  const app = { bus, progress: new ProgressManager(bus) };
  return { storage, bus, app, ...createServices(app) };
}

describe('guest mode (Supabase not configured)', () => {
  it('knows it is offline and never creates a client', async () => {
    expect(isConfigured()).toBe(false);
    expect(await getClient()).toBeNull();
  });

  it('reports a clear guest status and is ready immediately', async () => {
    const s = boot();
    expect(s.auth.status()).toMatchObject({ configured: false, signedIn: false, paired: false });
    await s.auth.init();
    expect(s.auth.status().ready).toBe(true);
  });

  it('explains, instead of failing silently, when someone tries to sign in or up', async () => {
    const s = boot();
    const msg = /not set up/i;
    expect(await s.auth.signIn({ email: 'a@b.co', password: 'x' })).toMatchObject({ ok: false, error: expect.stringMatching(msg) });
    expect(await s.auth.signUp({ email: 'a@b.co', password: 'longenough1', displayName: 'A' })).toMatchObject({ ok: false, error: expect.stringMatching(msg) });
    expect(await s.auth.sendPasswordReset('a@b.co')).toMatchObject({ ok: false });
    expect((await s.auth.signOut()).ok).toBe(true);
    expect(await s.relationship.createInvite()).toMatchObject({ ok: false });
    expect(await s.relationship.redeem('ABCDE-FGHJK-MNPQR-STVWX')).toMatchObject({ ok: false });
    expect(await s.sync.syncNow()).toMatchObject({ ok: false });
  });

  it('keeps answers and the edited ending on the device', async () => {
    const s = boot();
    const saved = await s.answers.save('loved.small', { text: 'hello' });          // default privacy for a guest
    expect(saved).toMatchObject({ ok: true, answer: { where: 'device' } });
    expect((await s.answers.save('loved.small', { text: 'hello' }, { privacy: 'private' })).ok).toBe(false);
    expect(s.storage.getItem(KEYS.localAnswers)).toContain('hello');
    const closing = await s.closing.save('standard', { title: 'For us', lines: ['Thank you.'] });
    expect(closing).toMatchObject({ ok: true, where: ['device'] });
    expect(s.closing.peek('standard')).toEqual({ title: 'For us', lines: ['Thank you.'] });
    expect((await s.closing.reset('standard')).ok).toBe(true);
    expect(s.closing.isEdited('standard')).toBe(false);
  });

  it('keeps saving game progress locally and never tries to sync', () => {
    const s = boot();
    const spy = vi.fn();
    s.bus.on('sync:status', spy);
    s.app.progress.newGame('princess');
    expect(JSON.parse(s.storage.getItem(KEYS.progress)).selectedCharacter).toBe('princess');
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ state: 'syncing' }));
  });
});
