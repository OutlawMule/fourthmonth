#!/usr/bin/env node
// =============================================================================
// LIVE privacy check for YOUR real Supabase project.
//
// `npm test` proves the database rules on an embedded Postgres. This script proves they are
// really in place on the project you deployed, by doing what a curious (or hostile) second
// player could do through the public API with nothing but the publishable key:
//   * read the other player's private answers and drafts            -> must return nothing
//   * change or delete the other player's answers                   -> must have no effect
//   * write rows as someone else, add themselves to a space,
//     read invitation codes, read other profiles                    -> must be refused
//   * use the API with no sign-in at all                            -> must be refused
// Each "must not" check is paired with a "this does work" check, so a broken test cannot pass
// by accident.
//
// USE TWO NEW THROWAWAY ACCOUNTS (never your real ones): the script pairs them, writes clearly
// labelled test answers, and at the end removes everything it made with leave_relationship()
// and delete_my_data() for BOTH accounts. It refuses to run if either account already has a
// relationship, answers or saved progress.
//
// Windows PowerShell:
//   $env:TEST_EMAIL_A = "throwaway-a@example.com"; $env:TEST_PASSWORD_A = "..."
//   $env:TEST_EMAIL_B = "throwaway-b@example.com"; $env:TEST_PASSWORD_B = "..."
//   node scripts/verify-rls.mjs
// The project URL and publishable key are read from the environment or from .env.local.
// The accounts can be made in Supabase: Authentication -> Users -> Add user (tick auto-confirm).
//
// It never uses a service-role key, never prints passwords or tokens, and creates at most one
// invitation per run (the database allows 5 per hour per account).
//
// STATUS: NOT run against a real Supabase project by its author (there was no project to test
// with). Its logic WAS exercised offline with `npm run test:rls-script`: the same calls are
// replayed on an embedded Postgres running your six migrations through a stand-in for the
// Supabase client (all checks pass), and then 15 deliberately weakened rules are each caught by
// the intended check. That cannot prove your hosted project behaves the same way (auth emails,
// the API layer, project settings). If a check fails with a message that looks like a script
// problem rather than a privacy problem, treat the script as suspect and use the manual
// two-window check in docs/MANUAL_TEST_CHECKLIST.md (Part J) as the source of truth.
//
// What two accounts cannot show: whether data of a third, unrelated pair is hidden from them.
// That is covered by the embedded-Postgres tests in tests/rls.test.js.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from '../src/services/keyGuard.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const fileEnv = { ...loadEnvFile(path.join(root, '.env')), ...loadEnvFile(path.join(root, '.env.local')) };
const env = (k) => process.env[k] ?? fileEnv[k];

const cfg = readSupabaseConfig({ VITE_SUPABASE_URL: env('VITE_SUPABASE_URL'), VITE_SUPABASE_PUBLISHABLE_KEY: env('VITE_SUPABASE_PUBLISHABLE_KEY') });
const results = [];
const out = (s) => process.stdout.write(`${s}\n`);
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok) }); out(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`); return Boolean(ok); };
let safeToClean = false;   // becomes true only after the fresh-account guard has passed
let cleanedUp = false;
async function fatal(msg) { out(`\nSTOPPED: ${msg}`); await cleanup(); process.exit(1); }

if (!cfg.configured) await fatal(cfg.problem ? `Supabase settings are not usable (${cfg.problem}).` : 'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set (put them in .env.local).');
const creds = ['TEST_EMAIL_A', 'TEST_PASSWORD_A', 'TEST_EMAIL_B', 'TEST_PASSWORD_B'].map(env);
if (creds.some((v) => !v)) await fatal('Set TEST_EMAIL_A, TEST_PASSWORD_A, TEST_EMAIL_B and TEST_PASSWORD_B (two NEW throwaway accounts). See the top of this file.');
if (creds[0].toLowerCase() === creds[2].toLowerCase()) await fatal('Account A and account B must be two different accounts.');

const mk = () => createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const anon = mk(); const A = mk(); const B = mk();
const marker = randomBytes(4).toString('hex');
const TXT = { privateSubmitted: `rls-test-${marker}-private-submitted`, sharedSubmitted: `rls-test-${marker}-shared-submitted`, sharedDraft: `rls-test-${marker}-shared-draft`, privateDraft: `rls-test-${marker}-private-draft` };

// "refused" = the API returned an error, or nothing came back. Either way the caller got no data.
const refused = (res) => Boolean(res.error) || (Array.isArray(res.data) ? res.data.length === 0 : res.data == null);
const mentions = (res, text) => JSON.stringify(res.data ?? null).includes(text);
const rows = (res) => (Array.isArray(res.data) ? res.data : []);
const why = (res) => (res.error ? `error ${res.error.code ?? ''} ${String(res.error.message ?? '').slice(0, 80)}` : `${rows(res).length} rows`);

async function cleanup() {
  if (!safeToClean || cleanedUp) return;   // never touch an account that failed the freshness check
  cleanedUp = true;
  for (const [who, c] of [['A', A], ['B', B]]) {
    try { await c.rpc('leave_relationship'); } catch { /* may already have left */ }
    try { const { error } = await c.rpc('delete_my_data'); out(error ? `cleanup ${who}: could not delete test data (${error.message})` : `cleanup ${who}: test data removed`); } catch (e) { out(`cleanup ${who}: failed (${e.message})`); }
    try { await c.auth.signOut(); } catch { /* ignore */ }
  }
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

async function main() {
  out(`Checking ${new URL(cfg.url).host} with two throwaway accounts (run id ${marker})\n`);

  // ---------------------------------------------------------------- sign in
  for (const [who, c, i] of [['A', A, 0], ['B', B, 2]]) {
    const { data, error } = await c.auth.signInWithPassword({ email: creds[i], password: creds[i + 1] });
    if (error || !data?.user) await fatal(`Could not sign in account ${who}: ${error?.message ?? 'no user'}. (Create it in Authentication -> Users -> Add user, with auto-confirm ticked.)`);
  }
  const idA = (await A.auth.getUser()).data.user.id;
  const idB = (await B.auth.getUser()).data.user.id;

  // ------------------------------------------------- fresh-account safety guard
  for (const [who, c] of [['A', A], ['B', B]]) {
    const rel = await c.rpc('get_my_relationship');
    const ans = await c.from('answers').select('id', { count: 'exact', head: true });
    const prog = await c.from('game_progress').select('user_id', { count: 'exact', head: true });
    if (rel.error || ans.error || prog.error) await fatal(`Account ${who}: could not read its own data (${(rel.error ?? ans.error ?? prog.error).message}). Did you run all six migrations?`);
    if (rel.data || (ans.count ?? 0) > 0 || (prog.count ?? 0) > 0) await fatal(`Account ${who} already has a relationship, answers or saved progress. This script deletes what it finds at the end, so it only runs on brand-new accounts.`);
  }
  safeToClean = true;
  check('both accounts are new and can read their own (empty) data', true);

  // ------------------------------------------------------------------ pairing
  const ens = await A.rpc('ensure_relationship');
  check('A can create a relationship space', !ens.error && ens.data, why(ens));
  const inv = await A.rpc('create_invitation');
  const code = inv.data?.code;
  check('A can create an invitation (20 characters)', !inv.error && typeof code === 'string' && code.length === 20, inv.error ? why(inv) : '');
  if (!code) await fatal('No invitation code, cannot continue.');
  // B has not joined yet, so nothing but the privilege rule can stop B from writing itself into A's
  // space. (Once B is a member, the same insert would fail on the one-space-per-person key, which
  // proves nothing about the rule, so this has to be tried now, before B redeems the code.)
  const pre = await A.rpc('get_my_relationship');
  const spaceA = pre.data?.relationship_id;
  const sneak = spaceA ? await B.from('relationship_members').insert({ relationship_id: spaceA, user_id: idB }).select() : null;
  const sneakIn = spaceA ? await B.rpc('get_my_relationship') : null;
  check('B cannot add itself to A\'s space by writing to the table (the only way in is the invitation code)', Boolean(sneak) && (Boolean(sneak.error) || rows(sneak).length === 0) && !sneakIn?.data?.relationship_id, !spaceA ? 'could not find A\'s space' : why(sneak));
  const bad = await B.rpc('redeem_invitation', { p_code: 'ZZZZZZZZZZZZZZZZZZZZ' });
  check('B: a made-up code is refused', Boolean(bad.error) || Boolean(bad.data?.error), bad.error ? why(bad) : JSON.stringify(bad.data).slice(0, 60));
  const redeem = await B.rpc('redeem_invitation', { p_code: code });
  check('B can join with the real code', !redeem.error && !redeem.data?.error, redeem.error ? why(redeem) : JSON.stringify(redeem.data ?? {}).slice(0, 60));
  const relA = await A.rpc('get_my_relationship');
  const relB = await B.rpc('get_my_relationship');
  const space = relA.data?.relationship_id;
  check('both accounts now see the same space with 2 members', space && space === relB.data?.relationship_id && relA.data?.member_count === 2 && relB.data?.member_count === 2, `${relA.data?.member_count}/${relB.data?.member_count} members`);
  const again = await B.rpc('redeem_invitation', { p_code: code });
  check('the code cannot be used a second time', Boolean(again.error) || Boolean(again.data?.error), '');
  if (!space) await fatal('The two accounts are not paired, cannot continue.');

  // ------------------------------------------------------- write A's test data
  // Only the free-text question types are used here: the database (rightly) refuses to submit a
  // pick-an-option question without a chosen option, and this test needs text it can search for.
  const qs = await A.from('questions').select('id, question_key, response_type, sort_order').eq('active', true);
  const free = rows(qs)
    .filter((q) => q.response_type === 'short' || q.response_type === 'long')
    .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0) || String(x.question_key).localeCompare(String(y.question_key)));
  check('A can read the question list (at least 5 free-text questions are seeded)', !qs.error && free.length >= 5, qs.error ? why(qs) : `${rows(qs).length} questions, ${free.length} free-text`);
  if (free.length < 5) await fatal('Fewer than 5 free-text questions found. Run migration 6 (seed questions).');
  // q1-q4 are answered by A. q5 is left unanswered on purpose: B's forgery attempt below targets it,
  // so the only thing that can refuse it is the security rule (not a "this row already exists" error).
  const [q1, q2, q3, q4, q5] = free;
  const put = (q, text, visibility, status) => A.from('answers').upsert({ relationship_id: space, question_id: q.id, author_id: idA, answer_text: text, visibility, status }, { onConflict: 'relationship_id,question_id,author_id' }).select('question_id');
  const w = await Promise.all([
    put(q1, TXT.privateSubmitted, 'private', 'submitted'),
    put(q2, TXT.sharedSubmitted, 'shared', 'submitted'),
    put(q3, TXT.sharedDraft, 'shared', 'draft'),
    put(q4, TXT.privateDraft, 'private', 'draft'),
  ]);
  const wrote = check('A can save four test answers (private, shared, shared draft, private draft)', w.every((r) => !r.error && rows(r).length === 1), w.find((r) => r.error) ? why(w.find((r) => r.error)) : '');
  // If the setup failed, every "B must not see it" check below would pass for the wrong reason
  // (there would be nothing to see), so stop here instead of printing misleading PASS lines.
  if (!wrote) await fatal('The test answers could not be saved, so the privacy checks that follow would prove nothing. Fix the problem above and run the script again.');
  const mine = await A.from('answers').select('question_id, answer_text');
  check('control: A can read all four of its own answers back', rows(mine).length === 4, why(mine));

  // ---------------------------------------------------- what B can read
  const seen = await B.from('answers').select('*');
  check('control: B CAN read the answer A shared and submitted', mentions(seen, TXT.sharedSubmitted), why(seen));
  check('B cannot read A\'s PRIVATE submitted answer', !mentions(seen, TXT.privateSubmitted));
  check('B cannot read A\'s SHARED DRAFT (not submitted yet)', !mentions(seen, TXT.sharedDraft));
  check('B cannot read A\'s PRIVATE draft', !mentions(seen, TXT.privateDraft));
  check('B only gets exactly one row back (the shared, submitted one)', rows(seen).length === 1, `${rows(seen).length} rows`);
  // The change-notification table is content-free by design, and silent for private answers and drafts.
  const sig = await B.from('answer_signals').select('*');
  const sigQs = rows(sig).map((r) => r.question_id);
  check('B gets a content-free signal for the shared answer only (none for private answers or drafts)', !sig.error && sigQs.includes(q2.id) && ![q1.id, q3.id, q4.id].some((id) => sigQs.includes(id)) && !mentions(sig, marker), sig.error ? why(sig) : `${sigQs.length} signal rows`);
  const targeted = await B.from('answers').select('*').eq('author_id', idA).eq('visibility', 'private');
  check('asking for A\'s private rows by name returns nothing', refused(targeted) && !mentions(targeted, 'rls-test'), why(targeted));
  const byQuestion = await B.from('answers').select('*').eq('question_id', q1.id);
  check('asking for the private answer\'s question by id returns nothing', !mentions(byQuestion, TXT.privateSubmitted), why(byQuestion));
  const search = await B.from('answers').select('*').ilike('answer_text', `%${marker}-private%`);
  check('searching answer text for A\'s private words returns nothing', refused(search), why(search));

  // ---------------------------------------------------- what B cannot change
  const upd = await B.from('answers').update({ answer_text: 'hacked by B' }).eq('author_id', idA).select();
  const delRes = await B.from('answers').delete().eq('author_id', idA).select();
  const ins = await B.from('answers').insert({ relationship_id: space, question_id: q5.id, author_id: idA, answer_text: 'forged by B', visibility: 'shared', status: 'submitted' }).select();
  check('B cannot change A\'s answers', refused(upd), why(upd));
  check('B cannot delete A\'s answers', refused(delRes), why(delRes));
  check('B cannot write an answer in A\'s name', Boolean(ins.error) || rows(ins).length === 0, why(ins));
  const after = await A.from('answers').select('question_id, answer_text');
  check('control: A\'s four answers are all still there, unchanged', rows(after).length === 4 && !mentions(after, 'hacked by B') && !mentions(after, 'forged by B') && mentions(after, TXT.privateSubmitted), why(after));

  // ------------------------------------------- tables and functions B must not use
  const members = await B.from('relationship_members').select('user_id');
  check('control: B can see who is in its own space (2 members)', rows(members).length === 2, why(members));
  const invs = await B.from('invitations').select('*');
  check('B cannot read the invitations table (codes are stored only as hashes the browser cannot read)', refused(invs) && !mentions(invs, code), why(invs));
  const invsA = await A.from('invitations').select('*');
  check('even A cannot read invitations back (the code is shown once, at creation)', refused(invsA) && !mentions(invsA, code), why(invsA));
  const attempts = await B.from('invitation_attempts').select('*');
  check('B cannot read the failed-attempts log', refused(attempts), why(attempts));
  // 'closed' is a value the table accepts, so only the privilege rule (not a value check) can refuse this.
  const relUpd = await B.from('relationships').update({ status: 'closed' }).eq('id', space).select();
  check('B cannot edit the relationship row', refused(relUpd), why(relUpd));
  const profA = await B.from('profiles').select('*').eq('id', idA);
  check('B cannot read A\'s profile row (partner name arrives only through get_my_relationship)', refused(profA), why(profA));
  const profOwn = await B.from('profiles').select('id').eq('id', idB);
  check('control: B can read its own profile row', rows(profOwn).length === 1, why(profOwn));
  // A perfectly valid row, so the only possible reason for a refusal is the privilege/policy itself.
  const qWrite = await B.from('questions').insert({ question_key: `rls.${marker}`, category: 'test', question_text: 'rls test', response_type: 'short' }).select();
  check('B cannot add questions (the question list is read-only for players)', Boolean(qWrite.error) || rows(qWrite).length === 0, why(qWrite));

  // ------------------------------------------------------------ no sign-in at all
  const aa = await anon.from('answers').select('*');
  check('a visitor with no sign-in cannot read answers', refused(aa) && !mentions(aa, 'rls-test'), why(aa));
  const aq = await anon.from('questions').select('*');
  check('a visitor with no sign-in cannot read the question list', refused(aq), why(aq));
  const ai = await anon.rpc('create_invitation');
  check('a visitor with no sign-in cannot create invitations', Boolean(ai.error) && !ai.data?.code, ai.error ? why(ai) : 'it returned data!');
  const ar = await anon.rpc('redeem_invitation', { p_code: code });
  check('a visitor with no sign-in cannot redeem a code', Boolean(ar.error) || Boolean(ar.data?.error), ar.error ? why(ar) : JSON.stringify(ar.data ?? null).slice(0, 60));

  // -------------------------------------------------- leaving removes shared access
  const leave = await A.rpc('leave_relationship');
  check('A can leave the space', !leave.error, leave.error ? why(leave) : '');
  const seenAfter = await B.from('answers').select('*');
  check('after A leaves, B can no longer read A\'s shared answer', !mentions(seenAfter, TXT.sharedSubmitted), why(seenAfter));
  const mineAfter = await A.from('answers').select('question_id');
  check('control: A can still read its own answers after leaving', rows(mineAfter).length >= 1, why(mineAfter));
  // Someone who has left must lose every kind of access to the old space, not only to the answers.
  const oldMembers = await A.from('relationship_members').select('user_id').eq('relationship_id', space);
  const oldRel = await A.from('relationships').select('id').eq('id', space);
  const oldSignals = await A.from('answer_signals').select('id').eq('relationship_id', space);
  check('after leaving, A cannot read the old space (its members, its row or its change signals)', refused(oldMembers) && refused(oldRel) && refused(oldSignals), `${rows(oldMembers).length}/${rows(oldRel).length}/${rows(oldSignals).length} rows`);
  const stillB = await B.from('answer_signals').select('id').eq('relationship_id', space);
  check('control: B still belongs to the old space and can read its signals (so the check above had something to hide)', rows(stillB).length >= 1, why(stillB));
}

try {
  await main();
} catch (e) {
  out(`\nThe script itself crashed (this is not a privacy result): ${e?.message ?? e}`);
  results.push({ name: 'script ran to the end', ok: false });
} finally {
  await cleanup();
}

const failed = results.filter((r) => !r.ok);
out(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length) {
  out('FAILED:'); for (const f of failed) out(`  - ${f.name}`);
  out('\nDo not share the game link until every check passes. Check that all six migrations ran, in order, without errors.');
  process.exit(2);
}
out('All checks passed: through the real API, one signed-in player could not read, change or delete the other player\'s private data.');
