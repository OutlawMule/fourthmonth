import { describe, it, expect } from 'vitest';
import { checkPublicKey, checkProjectUrl, readSupabaseConfig } from '../src/services/keyGuard.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role })}.signature`;

describe('the browser only accepts a public Supabase key', () => {
  it('accepts a publishable key and the legacy anon key', () => {
    expect(checkPublicKey('sb_publishable_abcdefghijklmnop')).toMatchObject({ ok: true });
    expect(checkPublicKey(jwt('anon'))).toMatchObject({ ok: true, kind: 'anon-jwt' });
  });
  it('refuses a secret key or a service-role key, so it can never ship to visitors', () => {
    expect(checkPublicKey('sb_secret_abcdefghijklmnop')).toEqual({ ok: false, reason: 'secret-key' });
    expect(checkPublicKey(jwt('service_role'))).toEqual({ ok: false, reason: 'secret-key' });
    expect(checkPublicKey(jwt('supabase_admin')).ok).toBe(false);
  });
  it('refuses empty, placeholder and unreadable values', () => {
    for (const bad of ['', '   ', undefined, null, 'YOUR-PUBLISHABLE-OR-ANON-KEY', 'abc', 'a.b.c', 'not a key']) expect(checkPublicKey(bad).ok, String(bad)).toBe(false);
  });
});

describe('project URL', () => {
  it('requires https (http only for a local Supabase stack)', () => {
    expect(checkProjectUrl('https://abc.supabase.co')).toEqual({ ok: true, value: 'https://abc.supabase.co' });
    expect(checkProjectUrl('http://127.0.0.1:54321').ok).toBe(true);
    expect(checkProjectUrl('http://localhost:54321').ok).toBe(true);
    expect(checkProjectUrl('http://abc.supabase.co').ok).toBe(false);
  });
  it('refuses placeholders, junk and credentials in the URL', () => {
    for (const bad of ['', 'https://YOUR-PROJECT-REF.supabase.co', 'abc', 'https://user:pw@abc.supabase.co', 'javascript:alert(1)']) expect(checkProjectUrl(bad).ok, bad).toBe(false);
  });
});

describe('readSupabaseConfig', () => {
  const env = (url, key) => ({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key });
  it('is configured only when both values are good', () => {
    expect(readSupabaseConfig(env('https://abc.supabase.co', 'sb_publishable_abcdefghijk'))).toMatchObject({ configured: true, url: 'https://abc.supabase.co' });
  });
  it('is quietly off when nothing is set (guest mode)', () => {
    expect(readSupabaseConfig(env('', ''))).toEqual({ configured: false, url: null, key: null, problem: null });
    expect(readSupabaseConfig(undefined).configured).toBe(false);
  });
  it('explains a misconfiguration without ever echoing the key back', () => {
    const r = readSupabaseConfig(env('https://abc.supabase.co', 'sb_secret_topsecretvalue123'));
    expect(r.configured).toBe(false);
    expect(r.problem).toMatch(/secret/i);
    expect(JSON.stringify(r)).not.toContain('topsecretvalue');
  });
});
