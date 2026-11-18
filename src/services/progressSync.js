// Cloud copy of the player's GAME progress (app.sync). Local progress stays the source of truth
// for playing; signing in merges the two and then keeps the account copy up to date.
//
// Merge strategy (pure code in src/utils/progress.js, unit-tested):
//   sets (stages, fragments, answered keys, achievements, ...) are united, counters take the
//   larger value, single values (selected character, resume point) take the newer copy.
//   Nothing is ever dropped just because the other copy is older, so neither side can
//   overwrite newer data with older data.
// Only progress is synced here: no answer text ever goes into game_progress, just which
// question keys were answered.
import { mergeProgress, progressEqual, sanitizeProgress } from '../utils/progress.js';
import { describeError } from '../utils/validation.js';

const PUSH_DELAY_MS = 2500;

export function createProgressSync({ bus, auth, relationship, progress, getClient }) {
  const info = { state: 'off', at: null, error: null };   // off | idle | syncing | ok | error
  let lastPushed = null;
  let timer = null;
  let running = null;

  const set = (patch) => { Object.assign(info, patch); bus.emit('sync:status', { ...info }); };
  const signedIn = () => Boolean(auth.status().signedIn);

  async function pull(c) {
    const { data, error } = await c.from('game_progress').select('data').eq('user_id', auth.userId).maybeSingle();
    if (error) throw error;
    const raw = data?.data;
    if (!raw || typeof raw !== 'object' || !Object.keys(raw).length) return false;
    const cloud = sanitizeProgress(raw).progress;
    const merged = mergeProgress(progress.state, cloud);
    if (progressEqual(merged, progress.state)) return false;
    progress.mergeCloud(cloud);     // persists locally and emits progress:changed
    return true;
  }

  async function push(c) {
    const p = progress.state;
    if (lastPushed && progressEqual(lastPushed, p)) return;
    const base = {
      user_id: auth.userId,
      selected_character: p.selectedCharacter,
      unlocked_stages: p.unlockedStages,
      completed_stages: p.completedStages,
      collected_fragments: p.collected,
      data: p,
    };
    const withSpace = relationship.state.relationshipId ? { ...base, relationship_id: relationship.state.relationshipId } : base;
    let { error } = await c.from('game_progress').upsert(withSpace, { onConflict: 'user_id' });
    if (error && withSpace !== base) ({ error } = await c.from('game_progress').upsert(base, { onConflict: 'user_id' })); // stale space id: retry without it
    if (error) throw error;
    lastPushed = JSON.parse(JSON.stringify(p));
    auth.updateCharacter?.(p.selectedCharacter);
  }

  /** Pull + merge, then push the merged result. Concurrent calls share one run. */
  function syncNow() {
    if (!signedIn()) { set({ state: 'off', error: null }); return Promise.resolve({ ok: false, error: 'Sign in to sync your progress.' }); }
    running ??= (async () => {
      set({ state: 'syncing', error: null });
      try {
        const c = await getClient();
        if (!c) throw new Error('failed to fetch');
        await pull(c);
        await push(c);
        set({ state: 'ok', at: new Date().toISOString() });
        return { ok: true };
      } catch (err) {
        const error = describeError(err);
        set({ state: 'error', error });
        return { ok: false, error };
      } finally {
        running = null;
      }
    })();
    return running;
  }

  const schedulePush = () => {
    if (!signedIn()) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) return schedulePush();
      try {
        const c = await getClient();
        if (!c || !signedIn()) return;
        set({ state: 'syncing' });
        await push(c);
        set({ state: 'ok', at: new Date().toISOString(), error: null });
      } catch (err) {
        set({ state: 'error', error: describeError(err) });
      }
    }, PUSH_DELAY_MS);
  };

  bus.on('auth:signed-in', () => { lastPushed = null; syncNow(); });
  bus.on('auth:signed-out', () => { clearTimeout(timer); lastPushed = null; set({ state: 'off', error: null }); });
  bus.on('progress:changed', schedulePush);
  // A deliberate reset (New Game) is pushed straight away so the account copy matches what the player chose.
  bus.on('progress:reset', () => { if (signedIn()) { lastPushed = null; schedulePush(); } });

  return { syncNow, status: () => ({ ...info }) };
}
