// The one place that creates the Supabase client. It is created lazily and only when the
// two public values are present and valid, and the supabase-js bundle is loaded with a
// dynamic import so guests who never configure Supabase never download it.
//
//   VITE_SUPABASE_URL              project URL
//   VITE_SUPABASE_PUBLISHABLE_KEY  publishable (or legacy anon) key
//
// Nothing else is read from the environment. A secret/service-role key is rejected.
//
// Each value is read by its exact name ON PURPOSE. Vite copies into the built (public) JavaScript
// only the variables that are written out like this; handing the whole env object to a function
// would copy EVERY VITE_ variable that happens to exist when you build. tests/hygiene.test.js and
// tests/envGuard.test.js keep it that way, and the build itself refuses secret keys (scripts/envGuard.mjs).
import { readSupabaseConfig } from './keyGuard.js';

function readPublicEnv() {
  try {
    return {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    };
  } catch {
    return {}; // not running under Vite (no env object at all): behave as "not configured"
  }
}
const config = readSupabaseConfig(readPublicEnv());
let clientPromise = null;

export const isConfigured = () => config.configured;
/** Why online features are off (null when simply not configured; a message when misconfigured). */
export const configProblem = () => config.problem;

/** Resolves to the supabase-js client, or null when not configured. Never throws. */
export function getClient() {
  if (!config.configured) return Promise.resolve(null);
  clientPromise ??= import('@supabase/supabase-js')
    .then(({ createClient }) => createClient(config.url, config.key, {
      auth: {
        persistSession: true,        // session restore across reloads (stored by supabase-js itself)
        autoRefreshToken: true,
        detectSessionInUrl: true,    // email-confirmation and password-recovery links
        flowType: 'pkce',
      },
      realtime: { params: { eventsPerSecond: 5 } },
    }))
    .catch(() => {
      clientPromise = null; // allow a retry (offline at first load, blocked chunk, ...)
      return null;
    });
  return clientPromise;
}
