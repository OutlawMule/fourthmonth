// The browser must only ever receive the two public values. Two lines of defence are tested here:
//   1. the game reads exactly those two variables BY NAME, so Vite never copies any other VITE_
//      variable (for example a mistakenly added service-role key) into the public JavaScript;
//   2. the build and the dev server refuse to run while a secret key sits in any VITE_ variable.
// The second half runs the real `vite build` (about two seconds each).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecretsInPublicEnv, secretsMessage } from '../scripts/envGuard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_OK = 'https://abcdefghijklmnop.supabase.co';
const PUBLISHABLE = 'sb_publishable_TESTTESTTESTTEST1234567890';
const SECRET = 'sb_secret_TESTTESTTESTTEST1234567890';
const jwt = (role) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'c2lnbmF0dXJl'].join('.');

describe('findSecretsInPublicEnv', () => {
  it('accepts the two normal public values', () => {
    expect(findSecretsInPublicEnv({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).toEqual([]);
    expect(findSecretsInPublicEnv({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') })).toEqual([]);
  });

  it('flags a secret key whatever the variable is called', () => {
    expect(findSecretsInPublicEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: SECRET })).toEqual(['VITE_SUPABASE_PUBLISHABLE_KEY']);
    expect(findSecretsInPublicEnv({ VITE_B: SECRET, VITE_A: SECRET, VITE_OK: PUBLISHABLE })).toEqual(['VITE_A', 'VITE_B']);
  });

  it('flags a legacy service_role token but not an anon token', () => {
    expect(findSecretsInPublicEnv({ VITE_SUPABASE_KEY: jwt('service_role') })).toEqual(['VITE_SUPABASE_KEY']);
    expect(findSecretsInPublicEnv({ VITE_SUPABASE_KEY: jwt('anon') })).toEqual([]);
  });

  it('ignores empty, missing, placeholder and non-text values', () => {
    expect(findSecretsInPublicEnv({ A: '', B: '   ', C: undefined, D: null, E: 12, F: 'YOUR-PUBLISHABLE-OR-ANON-KEY', G: 'https://YOUR-PROJECT-REF.supabase.co' })).toEqual([]);
    expect(findSecretsInPublicEnv(undefined)).toEqual([]);
  });

  it('shows only variable names in its message, never a value', () => {
    const msg = secretsMessage(['VITE_SUPABASE_PUBLISHABLE_KEY']);
    expect(msg).toContain('VITE_SUPABASE_PUBLISHABLE_KEY');
    expect(msg).toMatch(/PUBLISHABLE key/);
    expect(msg).not.toContain(SECRET);
  });
});

describe('the real build', () => {
  const VITE_BIN = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

  function build(extraEnv) {
    const out = mkdtempSync(join(tmpdir(), 'mule-build-'));
    const env = { ...process.env, NODE_ENV: 'production', ...extraEnv };
    for (const k of Object.keys(env)) if (k.startsWith('VITEST')) delete env[k];
    const r = spawnSync(process.execPath, [VITE_BIN, 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, env, encoding: 'utf8', timeout: 120000 });
    const bundleDir = join(out, 'build');
    const bundle = existsSync(bundleDir)
      ? readdirSync(bundleDir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(bundleDir, f), 'utf8')).join('\n')
      : null;
    return { code: r.status, text: `${r.stdout ?? ''}${r.stderr ?? ''}`, bundle, cleanup: () => rmSync(out, { recursive: true, force: true }) };
  }

  it('refuses to build when the publishable-key variable holds a secret key, and prints no value', () => {
    const b = build({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: SECRET });
    try {
      expect(b.code).not.toBe(0);
      expect(b.text).toContain('Stopped on purpose');
      expect(b.text).toContain('VITE_SUPABASE_PUBLISHABLE_KEY');
      expect(b.text).not.toContain(SECRET);
      expect(b.bundle, 'nothing may be written').toBeNull();
    } finally { b.cleanup(); }
  });

  it('refuses to build when a secret key sits in any other VITE_ variable', () => {
    const b = build({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, VITE_SOMETHING_ELSE: SECRET });
    try {
      expect(b.code).not.toBe(0);
      expect(b.text).toContain('VITE_SOMETHING_ELSE');
      expect(b.text).not.toContain(SECRET);
      expect(b.bundle).toBeNull();
    } finally { b.cleanup(); }
  });

  it('ships the two public values and nothing else from the environment', () => {
    const probe = 'probe-value-that-must-not-ship-4242';
    const b = build({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, VITE_EXTRA_PROBE: probe, VITE_ANOTHER_PROBE: `${probe}-2` });
    try {
      expect(b.code, b.text).toBe(0);
      // (booleans, so a failure does not print the whole minified bundle)
      expect(b.bundle.includes(PUBLISHABLE), 'the publishable key must be in the bundle').toBe(true);   // the game needs these two...
      expect(b.bundle.includes('abcdefghijklmnop.supabase.co'), 'the project URL must be in the bundle').toBe(true);
      expect(b.bundle.includes(probe), 'an extra VITE_ variable was copied into the public bundle').toBe(false);  // ...and nothing else
    } finally { b.cleanup(); }
  });

  it('builds with no variables at all (guest-only game) and the bundle holds no key', () => {
    const b = build({ VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' });
    try {
      expect(b.code, b.text).toBe(0);
      expect(/sb_secret_[A-Za-z0-9_-]{10,}/.test(b.bundle), 'a secret key is in the bundle').toBe(false);
      expect(/sb_publishable_[A-Za-z0-9_-]{10,}/.test(b.bundle), 'a key is in a build that was given none').toBe(false);
    } finally { b.cleanup(); }
  });
});
