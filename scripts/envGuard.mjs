// Build-time guard: refuse to build (or start the dev server) while a Supabase SECRET key sits in a
// VITE_ variable.
//
// Vite copies VITE_ variables into the JavaScript that every visitor downloads. The game's own key
// guard (src/services/keyGuard.js) refuses to USE a secret/service-role key, but by then it would
// already be public. So vite.config.js calls this first and stops the build.
//
// It looks at every VITE_ variable, whatever it is called, and only at the shape of the value (a
// "sb_secret_..." key, or a legacy token whose role is service_role). It never prints a value.
import { checkPublicKey } from '../src/services/keyGuard.js';

/** Names (sorted) of the variables whose value is a Supabase secret/service-role key. */
export function findSecretsInPublicEnv(env) {
  const names = [];
  for (const [name, value] of Object.entries(env ?? {})) {
    if (typeof value !== 'string' || !value.trim()) continue;
    if (checkPublicKey(value).reason === 'secret-key') names.push(name);
  }
  return names.sort();
}

/** The text shown when the build is stopped. Contains variable NAMES only, never a value. */
export function secretsMessage(names) {
  const list = names.map((n) => `    ${n}`).join('\n');
  return [
    '',
    'Stopped on purpose: a Supabase SECRET (service-role) key is in a VITE_ variable.',
    '',
    list,
    '',
    'Anything in a VITE_ variable is copied into the game\'s public JavaScript, so every visitor could',
    'read it and bypass all of the privacy rules. To fix it:',
    '  1. Delete that variable from .env.local and from the Vercel project\'s Environment Variables.',
    '  2. Put only the PUBLISHABLE key (sb_publishable_..., or the legacy "anon" key) in',
    '     VITE_SUPABASE_PUBLISHABLE_KEY.',
    '  3. If the secret key was ever pasted anywhere shared or public, create a new one in the',
    '     Supabase dashboard and stop using the old one.',
    '',
  ].join('\n');
}
