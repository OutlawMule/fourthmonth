// Pure checks on the two public values the browser is allowed to hold. No network,
// no DOM: unit-tested in tests/keyGuard.test.js.
//
// The browser may only ever hold the Supabase *publishable* (sb_publishable_...) or the
// legacy *anon* key. A service-role / secret key bypasses Row Level Security, so if one
// is pasted into a VITE_ variable by mistake the client refuses to start rather than
// shipping it to every visitor.

function decodeJwtPayload(token) {
  const part = String(token).split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Returns { ok:true } or { ok:false, reason }. `reason` is safe to show to the developer. */
export function checkPublicKey(key) {
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k) return { ok: false, reason: 'missing' };
  if (/^YOUR-|^<|PASTE|CHANGE-?ME/i.test(k)) return { ok: false, reason: 'placeholder' };
  if (/^sb_secret_/i.test(k)) return { ok: false, reason: 'secret-key' };
  if (/^sb_publishable_/i.test(k)) return { ok: true, kind: 'publishable' };
  if (k.split('.').length === 3) {
    const payload = decodeJwtPayload(k);
    if (!payload) return { ok: false, reason: 'unreadable-jwt' };
    if (payload.role === 'service_role') return { ok: false, reason: 'secret-key' };
    if (payload.role && payload.role !== 'anon') return { ok: false, reason: 'unexpected-role' };
    return { ok: true, kind: 'anon-jwt' };
  }
  return { ok: false, reason: 'unrecognised' };
}

/** Project URL: https only, except a local Supabase CLI stack on localhost / 127.0.0.1. */
export function checkProjectUrl(url) {
  const u = typeof url === 'string' ? url.trim() : '';
  if (!u) return { ok: false, reason: 'missing' };
  if (/YOUR-PROJECT|PASTE|CHANGE-?ME/i.test(u)) return { ok: false, reason: 'placeholder' };
  let parsed;
  try { parsed = new URL(u); } catch { return { ok: false, reason: 'invalid-url' }; }
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return { ok: false, reason: 'not-https' };
  if (parsed.username || parsed.password) return { ok: false, reason: 'credentials-in-url' };
  return { ok: true, value: parsed.origin };
}

const MESSAGES = {
  missing: 'Not set up',
  placeholder: 'Still has the placeholder text from .env.example',
  'secret-key': 'This is a secret/service-role key. Only the publishable (anon) key may be used in the browser',
  'unreadable-jwt': 'The key could not be read',
  'unexpected-role': 'The key has an unexpected role',
  unrecognised: 'The key format is not recognised',
  'invalid-url': 'The project URL is not a valid URL',
  'not-https': 'The project URL must start with https://',
  'credentials-in-url': 'The project URL must not contain a username or password',
};
export const describeConfigProblem = (reason) => MESSAGES[reason] ?? 'Invalid configuration';

/** Reads the two Vite env values and says whether online features can start. */
export function readSupabaseConfig(env) {
  const url = checkProjectUrl(env?.VITE_SUPABASE_URL);
  const key = checkPublicKey(env?.VITE_SUPABASE_PUBLISHABLE_KEY);
  if (url.ok && key.ok) {
    return { configured: true, url: url.value, key: String(env.VITE_SUPABASE_PUBLISHABLE_KEY).trim(), problem: null };
  }
  const unset = (url.reason === 'missing' && key.reason === 'missing');
  const problem = unset ? null : !url.ok ? `URL: ${describeConfigProblem(url.reason)}` : `Key: ${describeConfigProblem(key.reason)}`;
  return { configured: false, url: null, key: null, problem };
}
