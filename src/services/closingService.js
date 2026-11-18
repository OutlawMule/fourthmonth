// Editable ending message (app.closing). The default text lives in src/data/memories.js
// (ENDINGS); players can rewrite it on the ending screen. The edited copy is kept on this
// device and, when signed in, in the database (story_memories: stage4 / closing-message),
// where the paired partner can read it, because it is part of the shared story.
import { loadClosing, saveClosing, clearClosing } from '../utils/storage.js';
import { sanitizeClosing, sanitizeEnding, mergeClosing, resolveEnding, CLOSING_KINDS } from '../utils/closing.js';
import { describeError } from '../utils/validation.js';

const STAGE = 'stage4';
const KEY = 'closing-message';

export function createClosingService({ bus, auth, relationship, getClient }) {
  let cloudCopy = {};

  const current = () => mergeClosing(loadClosing(), cloudCopy);

  async function loadCloud() {
    const s = auth.status();
    if (!s.signedIn) { cloudCopy = {}; return; }
    const c = await getClient();
    const id = relationship.state.relationshipId;
    if (!c || !id) return;
    const { data, error } = await c.from('story_memories').select('content').eq('relationship_id', id).eq('stage_id', STAGE).eq('memory_key', KEY).maybeSingle();
    if (error) throw error;
    cloudCopy = sanitizeClosing(data?.content);
  }

  async function pushCloud(next) {
    const c = await getClient();
    const space = await relationship.ensureSpace();
    if (!c || !space.ok) throw new Error(space.error ?? 'not_authenticated');
    const content = sanitizeClosing(next);
    if (!CLOSING_KINDS.some((k) => content[k])) {
      const { error } = await c.from('story_memories').delete().eq('relationship_id', space.id).eq('stage_id', STAGE).eq('memory_key', KEY);
      if (error) throw error;
      cloudCopy = {};
      return;
    }
    const { data, error } = await c.from('story_memories')
      .upsert({ relationship_id: space.id, stage_id: STAGE, memory_key: KEY, content }, { onConflict: 'relationship_id,stage_id,memory_key' })
      .select('content').single();
    if (error) throw error;
    cloudCopy = sanitizeClosing(data.content);       // what the database confirmed
  }

  async function commit(next) {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    const hasAny = CLOSING_KINDS.some((k) => stamped[k]);
    const okDevice = hasAny ? saveClosing(stamped) : (clearClosing(), true);
    if (!okDevice) return { ok: false, error: 'Could not save on this device. Browser storage looks blocked or full.' };
    // `where` lists the places the text now lives, most specific first: ['shared', 'device'], ['account', 'device'] or ['device'].
    const where = ['device'];
    let notice = null;
    if (auth.status().signedIn) {
      try { await pushCloud(stamped); where.unshift(relationship.state.status === 'active' ? 'shared' : 'account'); }
      catch (err) { notice = `It could not be saved to your account yet: ${describeError(err)}`; }
    }
    bus.emit('closing:changed');
    return { ok: true, where, notice };
  }

  return {
    /** The text to show for an ending right now (edited copy if there is one, else the default). */
    peek: (kind) => resolveEnding(kind, current()),
    isEdited: (kind) => Boolean(current()[kind]),
    /** Refreshes the account copy first (best effort; the device copy always works), then returns the text to show. */
    async load(kind = 'standard') {
      try { await loadCloud(); } catch { /* offline or not paired: the device copy / default text is used */ }
      return resolveEnding(kind, current());
    },
    async save(kind, ending) {
      if (!CLOSING_KINDS.includes(kind)) return { ok: false, error: 'Unknown ending.' };
      const e = sanitizeEnding(ending);
      if (!e) return { ok: false, error: 'Add a title and at least one line of text.' };
      return commit({ ...current(), [kind]: e });
    },
    /** Back to the original text for one ending. */
    async reset(kind) {
      if (!CLOSING_KINDS.includes(kind)) return { ok: false, error: 'Unknown ending.' };
      const next = { ...current() };
      delete next[kind];
      return commit(next);
    },
  };
}
