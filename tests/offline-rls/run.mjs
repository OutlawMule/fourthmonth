#!/usr/bin/env node
// Offline test of scripts/verify-rls.mjs:  npm run test:rls-script
//
// 1. Runs the script against your real migrations on an embedded Postgres (no network, no Supabase
//    project, nothing is created anywhere) through a stand-in for the Supabase client. Every check
//    must pass.
// 2. Then weakens ONE privacy rule at a time (see mutations.mjs) and runs the script again. Each
//    run must FAIL, and it must be the intended check that reports it.
// If both hold, the script is not just printing PASS. What this cannot show is how your hosted
// Supabase project behaves; for that, run scripts/verify-rls.mjs itself against it.
//
// ONLY=leak_select,signal_leak   run just those weakenings (the unmodified run always happens)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MUTATIONS } from './mutations.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, '..', '..', 'scripts', 'verify-rls.mjs');
const register = path.join(here, 'register.mjs');
const only = process.env.ONLY ? process.env.ONLY.split(',').map((s) => s.trim()).filter(Boolean) : null;

const baseEnv = {
  PATH: process.env.PATH, HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
  TEST_EMAIL_A: 'alice@example.test', TEST_PASSWORD_A: 'offline-a-12345', TEST_EMAIL_B: 'bob@example.test', TEST_PASSWORD_B: 'offline-b-12345',
  VITE_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789',
};

function run(mutate) {
  const env = { ...baseEnv, ...(mutate ? { MUTATE: mutate } : {}) };
  const r = spawnSync(process.execPath, ['--import', register, script], { env, encoding: 'utf8', timeout: 180000 });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, timedOut: r.error?.code === 'ETIMEDOUT' };
}

let bad = 0;
const say = (s) => process.stdout.write(`${s}\n`);

say('Unmodified rules: every check must pass');
const base = run(null);
const passed = /(\d+) of (\d+) checks passed/.exec(base.out);
const baseOk = base.code === 0 && passed && passed[1] === passed[2] && base.out.includes('Checking abcdefghijklmnop.supabase.co');
say(`  ${baseOk ? 'OK  ' : 'BAD '} exit ${base.code}, ${passed ? `${passed[1]} of ${passed[2]} checks passed` : 'no summary line'}`);
if (!baseOk) { bad += 1; say(base.out.split('\n').filter((l) => /^FAIL|STOPPED|crashed|Error/.test(l)).map((l) => `       ${l}`).join('\n')); }

const names = Object.keys(MUTATIONS).filter((n) => !only || only.includes(n));
if (only) for (const n of only) if (!MUTATIONS[n]) { say(`Unknown weakening in ONLY: ${n}`); bad += 1; }
say(`\nOne weakened rule at a time: the script must fail on the intended check (${names.length} runs)`);
for (const name of names) {
  const m = MUTATIONS[name];
  const r = run(name);
  const failed = r.out.split('\n').filter((l) => l.startsWith('FAIL'));
  const intended = failed.some((l) => l.startsWith(`FAIL  ${m.catches}`));
  const ok = r.code === 2 && intended && !/crashed/.test(r.out);
  if (!ok) bad += 1;
  say(`  ${ok ? 'OK  ' : 'BAD '} ${name.padEnd(22)} exit ${r.code}, ${failed.length} failed check(s)${intended ? '' : `, but NOT "${m.catches}"`}`);
}

say(bad === 0 ? '\nAll good: the script passes on the real rules and notices each deliberate weakening.' : `\n${bad} problem(s). Do not trust scripts/verify-rls.mjs until this is clean.`);
process.exit(bad === 0 ? 0 : 1);
