// Relationship space + pairing (app.relationship). Everything security-relevant happens in
// SECURITY DEFINER database functions (supabase/migrations/*_secure_pairing.sql); this
// module only calls them and keeps a small in-memory copy of the result.
//
// Live updates: Supabase Realtime on two content-free tables (answer_signals,
// relationship_members). If the socket is down, the same refresh runs on a timer, when the
// tab regains focus, and when the browser comes back online, so nothing depends on Realtime.
import { isValidInviteCodeFormat, normalizeInviteCode, describeError } from '../utils/validation.js';

const POLL_MS = 30000;
const FAST_POLL_MS = 6000;

export function createRelationshipService({ bus, getClient, auth }) {
  const state = {
    status: 'none',        // 'none' | 'solo' (a space with only you) | 'active' (paired)
    relationshipId: null,
    memberCount: 0,
    partner: null,         // { display_name, selected_character } - nothing else about them
    invitation: null,      // { expires_at } when a code is outstanding (the code itself is never stored server-side)
    lastInvite: null,      // { code, expires_at } kept in memory only, never persisted
    live: false,           // Realtime channel connected
    lastSyncAt: null,
    error: null,
  };
  let client = null;
  let channel = null;
  let channelFor = null;
  let pollTimer = null;
  let fast = false;
  let debounce = null;
  let wentDown = false;     // the channel was connected, then dropped (events may have been missed)

  const snapshot = () => ({ ...state, partner: state.partner && { ...state.partner } });
  const changed = () => bus.emit('relationship:changed', snapshot());

  async function ensureClient() { client ??= await getClient(); return client; }

  function apply(row) {
    const before = JSON.stringify([state.status, state.relationshipId, state.memberCount, state.partner, state.invitation]);
    if (!row || !row.relationship_id) {
      Object.assign(state, { status: 'none', relationshipId: null, memberCount: 0, partner: null, invitation: null });
    } else {
      Object.assign(state, {
        relationshipId: row.relationship_id,
        memberCount: Number(row.member_count) || 1,
        status: Number(row.member_count) >= 2 ? 'active' : 'solo',
        partner: row.partner ? { display_name: String(row.partner.display_name ?? 'Partner'), selected_character: row.partner.selected_character ?? null } : null,
        invitation: row.invitation?.expires_at ? { expires_at: row.invitation.expires_at } : null,
      });
      if (state.status === 'active') state.lastInvite = null;
    }
    state.lastSyncAt = new Date().toISOString();
    state.error = null;
    const after = JSON.stringify([state.status, state.relationshipId, state.memberCount, state.partner, state.invitation]);
    return before !== after;
  }

  function reset() {
    stopLive();
    Object.assign(state, { status: 'none', relationshipId: null, memberCount: 0, partner: null, invitation: null, lastInvite: null, live: false, lastSyncAt: null, error: null });
    changed();
  }

  // ------------------------------------------------------------------ realtime + polling
  function stopLive() {
    clearTimeout(debounce);
    if (channel && client) { try { client.removeChannel(channel); } catch { /* ignore */ } }
    channel = null; channelFor = null; state.live = false; wentDown = false;
  }

  function onChannelEvent(table, payload) {
    const mine = auth.userId;
    // Our own writes are already reflected locally; ignore them.
    if (table === 'answer_signals' && payload?.new?.author_id && payload.new.author_id === mine) return;
    clearTimeout(debounce);   // several events in a burst (or a duplicate) collapse into one refetch
    debounce = setTimeout(() => {
      if (table === 'answer_signals') bus.emit('partner-answers:signal');
      else service.refresh({ quiet: true });
    }, 250);
  }

  async function startLive() {
    if (!state.relationshipId || !(await ensureClient())) return;
    if (channel && channelFor === state.relationshipId) return;
    stopLive();
    const id = state.relationshipId;
    channelFor = id;
    channel = client.channel(`space-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answer_signals', filter: `relationship_id=eq.${id}` }, (p) => onChannelEvent('answer_signals', p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'relationship_members', filter: `relationship_id=eq.${id}` }, (p) => onChannelEvent('relationship_members', p))
      .subscribe((status) => {
        const live = status === 'SUBSCRIBED';
        if (live === state.live) return;
        state.live = live;
        if (!live) wentDown = true;
        changed();
        // Reconnected after a gap: some events may have been missed, so refetch once.
        if (live && wentDown) { wentDown = false; bus.emit('partner-answers:signal'); service.refresh({ quiet: true }); }
      });
  }

  function schedulePoll() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (document.hidden || !auth.status().signedIn) return;
      service.refresh({ quiet: true });
      if (state.status === 'active') bus.emit('partner-answers:signal');
    }, fast ? FAST_POLL_MS : POLL_MS);
  }

  // ------------------------------------------------------------------------------ API
  const service = {
    get state() { return snapshot(); },
    get isPaired() { return state.status === 'active'; },

    /** Re-reads the space from the server. */
    async refresh({ quiet = false } = {}) {
      if (!auth.status().signedIn || !(await ensureClient())) return { ok: false };
      try {
        const { data, error } = await client.rpc('get_my_relationship');
        if (error) throw error;
        const did = apply(data);
        await startLive();
        if (did || !quiet) changed();
        return { ok: true };
      } catch (err) {
        state.error = describeError(err);
        if (!quiet) changed();
        return { ok: false, error: state.error };
      }
    },

    /** Makes sure the signed-in user has a relationship space (needed before any cloud answer). */
    async ensureSpace() {
      if (state.relationshipId) return { ok: true, id: state.relationshipId };
      if (!auth.status().signedIn || !(await ensureClient())) return { ok: false, error: 'Sign in to save to your account.' };
      try {
        const { data, error } = await client.rpc('ensure_relationship');
        if (error) throw error;
        await service.refresh({ quiet: true });
        return { ok: true, id: data ?? state.relationshipId };
      } catch (err) {
        return { ok: false, error: describeError(err) };
      }
    },

    async createInvite() {
      if (!auth.status().signedIn || !(await ensureClient())) return { ok: false, error: 'Sign in first.' };
      try {
        const { data, error } = await client.rpc('create_invitation');
        if (error) throw error;
        state.lastInvite = { code: data.code, expires_at: data.expires_at };
        await service.refresh({ quiet: true });
        changed();
        return { ok: true, code: data.code, expires_at: data.expires_at };
      } catch (err) {
        return { ok: false, error: describeError(err) };
      }
    },

    async redeem(code) {
      if (!auth.status().signedIn || !(await ensureClient())) return { ok: false, error: 'Sign in first.' };
      if (!isValidInviteCodeFormat(code)) return { ok: false, error: 'That does not look like an invitation code. It has 20 letters and numbers.' };
      try {
        const { data, error } = await client.rpc('redeem_invitation', { p_code: normalizeInviteCode(code) });
        if (error) throw error;
        if (data?.error) return { ok: false, error: describeError({ message: data.error }) };
        await service.refresh();
        bus.emit('partner-answers:signal');
        return { ok: true };
      } catch (err) {
        return { ok: false, error: describeError(err) };
      }
    },

    async leave() {
      if (!auth.status().signedIn || !(await ensureClient())) return { ok: false, error: 'Sign in first.' };
      try {
        const { error } = await client.rpc('leave_relationship');
        if (error) throw error;
        stopLive();
        await service.refresh();
        bus.emit('partner-answers:signal');
        return { ok: true };
      } catch (err) {
        return { ok: false, error: describeError(err) };
      }
    },

    /** Called by the account screen: poll faster while someone is waiting for a partner to join. */
    watchFast(on) { fast = Boolean(on); if (pollTimer) schedulePoll(); },

    reset,
  };

  // ------------------------------------------------------------------------- wiring
  bus.on('auth:signed-in', () => { service.refresh(); schedulePoll(); });
  bus.on('auth:signed-out', () => { clearInterval(pollTimer); pollTimer = null; reset(); });
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => { if (auth.status().signedIn) { service.refresh({ quiet: true }); if (state.status === 'active') bus.emit('partner-answers:signal'); } });
    window.addEventListener('online', () => { if (auth.status().signedIn) { service.refresh({ quiet: true }); bus.emit('partner-answers:signal'); } });
  }
  return service;
}
