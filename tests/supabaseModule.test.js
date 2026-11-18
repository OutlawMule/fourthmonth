// The module that decides whether online features exist. It runs at game start, so if it fails to
// load the whole game never leaves the loading screen; that is exactly what these tests guard.
import { describe, it, expect, vi, afterEach } from 'vitest';

const URL_OK = 'https://abcdefghijklmnop.supabase.co';

async function freshModule() {
  vi.resetModules();
  return import('../src/services/supabase.js');
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('src/services/supabase.js', () => {
  it('loads and says "not configured" (no complaint) when the two variables are empty: a guest-only build', async () => {
    const m = await freshModule();
    expect(m.isConfigured()).toBe(false);
    expect(m.configProblem()).toBeNull();
    expect(await m.getClient()).toBeNull();
  });

  it('reports configured when both public values are valid', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', URL_OK);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_TESTTESTTESTTEST1234567890');
    const m = await freshModule();
    expect(m.isConfigured()).toBe(true);
    expect(m.configProblem()).toBeNull();
  });

  it('refuses a secret key and says why, without echoing it', async () => {
    const secret = 'sb_secret_TESTTESTTESTTEST1234567890';
    vi.stubEnv('VITE_SUPABASE_URL', URL_OK);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', secret);
    const m = await freshModule();
    expect(m.isConfigured()).toBe(false);
    expect(m.configProblem()).toMatch(/secret/i);
    expect(m.configProblem()).not.toContain(secret);
    expect(await m.getClient()).toBeNull();
  });

  it('points at the URL when only the URL is wrong', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://example.com');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_TESTTESTTESTTEST1234567890');
    const m = await freshModule();
    expect(m.isConfigured()).toBe(false);
    expect(m.configProblem()).toMatch(/URL/);
  });
});
