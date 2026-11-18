// Authentication facade (app.auth). Supabase Auth owns the session: supabase-js keeps the
// refresh token in its own storage and renews it; this module never touches or stores
// credentials, and never puts anything personal in a URL.
//
// When Supabase is not configured every method still exists and reports a clear
// "not set up" result, so the rest of the game never needs to special-case it.
import { validateEmail, validatePassword, validateDisplayName, describeAuthError, describeError } from '../utils/validation.js';

const NOT_CONFIGURED = 'Online features are not set up in this build. You are playing as a guest: everything is saved on this device.';

/** URL the auth emails send people back to: the site root, no query or hash. */
function returnUrl() {
  try { return new URL('./', window.location.href).href; } catch { return undefined; }
}

export function createAuthService({ bus, getClient, isConfigured, configProblem }) {
  const state = {
    ready: !isConfigured(),   // false until the saved session (if any) has been looked up
    user: null,               // { id, email }
    profile: null,            // { display_name, selected_character }
    recovery: false,          // true while the user arrived through a password-reset link
    offline: false,
  };
  let client = null;
  let started = false;

  const emit = () => bus.emit('auth:changed', service.status());

  async function loadProfile() {
    if (!client || !state.user) return;
    try {
      const { data, error } = await client.from('profiles').select('display_name, selected_character').eq('id', state.user.id).maybeSingle();
      if (error) throw error;
      if (data) { state.profile = data; return; }
      // First sign-in after a data deletion (or before the signup trigger ran): create it.
      const display = String(state.user.email ?? 'Player').split('@')[0].slice(0, 32) || 'Player';
      const { data: created } = await client.from('profiles').insert({ id: state.user.id, display_name: display }).select('display_name, selected_character').maybeSingle();
      state.profile = created ?? { display_name: display, selected_character: 'mule' };
    } catch {
      state.profile = state.profile ?? { display_name: String(state.user.email ?? 'Player').split('@')[0], selected_character: 'mule' };
    }
  }

  function applySession(session) {
    const u = session?.user ?? null;
    const changed = (u?.id ?? null) !== (state.user?.id ?? null);
    state.user = u ? { id: u.id, email: u.email ?? '' } : null;
    if (!u) state.profile = null;
    return changed;
  }

  function scrubUrl() {
    // supabase-js already strips the one-time code; this is a second, harmless guarantee that no
    // token or code stays in the address bar or browser history.
    try {
      const { search, hash } = window.location;
      if (/(^|[?&#])(code|access_token|refresh_token|token_hash|error_description)=/.test(search + hash)) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch { /* ignore */ }
  }

  const service = {
    get configured() { return isConfigured(); },
    get userId() { return state.user?.id ?? null; },

    status() {
      return {
        configured: isConfigured(),
        problem: configProblem?.() ?? null,
        ready: state.ready,
        signedIn: Boolean(state.user),
        userId: state.user?.id ?? null,
        email: state.user?.email ?? '',
        name: state.profile?.display_name ?? (state.user ? String(state.user.email).split('@')[0] : null),
        character: state.profile?.selected_character ?? null,
        recovery: state.recovery,
        paired: Boolean(service.isPaired?.()),   // filled in by services/index.js
      };
    },

    /** Restores a saved session and starts listening for auth changes. Safe to call once. */
    async init() {
      if (started) return;
      started = true;
      if (!isConfigured()) { state.ready = true; emit(); return; }
      client = await getClient();
      if (!client) { state.ready = true; state.offline = true; emit(); return; }
      client.auth.onAuthStateChange((event, session) => {
        // Do not call back into supabase inside this callback (it can deadlock): defer.
        setTimeout(async () => {
          const changed = applySession(session);
          if (event === 'PASSWORD_RECOVERY') { state.recovery = true; bus.emit('auth:recovery'); }
          if (event === 'SIGNED_OUT') state.recovery = false;
          if (state.user && (changed || !state.profile)) await loadProfile();
          emit();
          if (changed) bus.emit(state.user ? 'auth:signed-in' : 'auth:signed-out', service.status());
        }, 0);
      });
      try {
        const { data } = await client.auth.getSession();
        const changed = applySession(data?.session);
        if (state.user) await loadProfile();
        state.ready = true;
        scrubUrl();
        emit();
        if (changed && state.user) bus.emit('auth:signed-in', service.status());
      } catch {
        state.ready = true;
        state.offline = true;
        emit();
      }
    },

    async signUp({ email, password, displayName }) {
      if (!isConfigured()) return { ok: false, error: NOT_CONFIGURED };
      const e = validateEmail(email); if (!e.ok) return { ok: false, error: e.error, field: 'email' };
      const p = validatePassword(password); if (!p.ok) return { ok: false, error: p.error, field: 'password' };
      const n = validateDisplayName(displayName); if (!n.ok) return { ok: false, error: n.error, field: 'name' };
      client ??= await getClient();
      if (!client) return { ok: false, error: describeError({ message: 'failed to fetch' }) };
      try {
        const { data, error } = await client.auth.signUp({
          email: e.value, password: p.value,
          options: { data: { display_name: n.value }, emailRedirectTo: returnUrl() },
        });
        if (error) return { ok: false, error: describeAuthError(error) };
        // With email confirmation on, there is no session yet. The same neutral message is shown whether or
        // not the address already had an account, so this form cannot be used to discover who has one.
        if (!data.session) return { ok: true, needsConfirmation: true };
        return { ok: true, needsConfirmation: false };
      } catch (err) {
        return { ok: false, error: describeAuthError(err) };
      }
    },

    async signIn({ email, password }) {
      if (!isConfigured()) return { ok: false, error: NOT_CONFIGURED };
      const e = validateEmail(email); if (!e.ok) return { ok: false, error: e.error, field: 'email' };
      if (typeof password !== 'string' || !password) return { ok: false, error: 'Enter your password.', field: 'password' };
      client ??= await getClient();
      if (!client) return { ok: false, error: describeError({ message: 'failed to fetch' }) };
      try {
        const { error } = await client.auth.signInWithPassword({ email: e.value, password });
        if (error) return { ok: false, error: describeAuthError(error) };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: describeAuthError(err) };
      }
    },

    async signOut() {
      if (!client) return { ok: true };
      try {
        const { error } = await client.auth.signOut();
        if (error) throw error;
      } catch {
        // Even if the network call failed, drop the local session so this device is signed out.
        try { await client.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
      }
      applySession(null);
      state.recovery = false;
      emit();
      bus.emit('auth:signed-out', service.status());
      return { ok: true };
    },

    async sendPasswordReset(email) {
      if (!isConfigured()) return { ok: false, error: NOT_CONFIGURED };
      const e = validateEmail(email); if (!e.ok) return { ok: false, error: e.error, field: 'email' };
      client ??= await getClient();
      if (!client) return { ok: false, error: describeError({ message: 'failed to fetch' }) };
      try {
        const { error } = await client.auth.resetPasswordForEmail(e.value, { redirectTo: returnUrl() });
        // Same neutral answer for unknown addresses (no account enumeration). Real failures still surface.
        if (error && !/not found|no user/i.test(error.message ?? '')) return { ok: false, error: describeAuthError(error) };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: describeAuthError(err) };
      }
    },

    async updatePassword(password) {
      if (!client || !state.user) return { ok: false, error: 'Sign in first.' };
      const p = validatePassword(password); if (!p.ok) return { ok: false, error: p.error };
      try {
        const { error } = await client.auth.updateUser({ password: p.value });
        if (error) return { ok: false, error: describeAuthError(error) };
        state.recovery = false;
        emit();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: describeAuthError(err) };
      }
    },

    async updateDisplayName(name) {
      if (!client || !state.user) return { ok: false, error: 'Sign in first.' };
      const n = validateDisplayName(name); if (!n.ok) return { ok: false, error: n.error };
      try {
        const { error } = await client.from('profiles').update({ display_name: n.value }).eq('id', state.user.id);
        if (error) throw error;
        state.profile = { ...(state.profile ?? {}), display_name: n.value };
        emit();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: describeError(err) };
      }
    },

    /** Mirrors the player's chosen character onto their profile so a partner can see it. Best effort. */
    async updateCharacter(character) {
      if (!client || !state.user || !['mule', 'princess'].includes(character)) return;
      try {
        const { error } = await client.from('profiles').update({ selected_character: character }).eq('id', state.user.id);
        if (!error) state.profile = { ...(state.profile ?? {}), selected_character: character };
      } catch { /* ignore: cosmetic */ }
    },

    /**
     * Deletes everything this player has online (answers, progress, profile, invitations, their place
     * in the relationship space) through the delete_my_data() database function. It cannot delete the
     * sign-in itself: removing an auth user needs admin rights that the browser never has.
     */
    async deleteMyData() {
      if (!client || !state.user) return { ok: false, error: 'Sign in first.' };
      try {
        const { error } = await client.rpc('delete_my_data');
        if (error) throw error;
        state.profile = null;
        return { ok: true };
      } catch (err) {
        return { ok: false, error: describeError(err) };
      }
    },

    /** Leaves the password-reset screen without changing anything. */
    dismissRecovery() { state.recovery = false; emit(); },
  };
  return service;
}
