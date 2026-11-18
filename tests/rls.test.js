// Row Level Security, pairing and privacy tests against a real PostgreSQL engine (PGlite),
// using several different authenticated users acting through the same Postgres roles the
// browser uses. See tests/helpers/db.js for exactly what is (and is not) emulated.
import { describe, it, expect, beforeAll } from 'vitest';
import { createDb, createUser, asUser, asAnon, admin, errorOf, applyMigrations } from './helpers/db.js';

// ------------------------------------------------------------------------------- helpers
const qId = async (db, key) => (await admin(db, 'select id from public.questions where question_key = $1', [key]))[0].id;

/** Exactly the statement PostgREST runs for the client's upsert. */
async function saveAnswer(db, user, rel, key, { text = null, choice = null, visibility = 'private', status = 'submitted' } = {}) {
  const question = await qId(db, key);
  return asUser(db, user, (q) => q.query(
    `insert into public.answers (relationship_id, question_id, author_id, answer_text, answer_choice, visibility, status)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (relationship_id, question_id, author_id) do update set
       relationship_id = excluded.relationship_id, question_id = excluded.question_id, author_id = excluded.author_id,
       answer_text = excluded.answer_text, answer_choice = excluded.answer_choice,
       visibility = excluded.visibility, status = excluded.status
     returning id, visibility, status`,
    [rel, question, user, text, choice, visibility, status],
  ));
}

const myAnswers = (db, user) => asUser(db, user, (q) => q.query(
  `select a.author_id, a.answer_text, a.visibility, a.status, qq.question_key
     from public.answers a join public.questions qq on qq.id = a.question_id order by qq.question_key`));

const rpc = (db, user, fn, ...args) => asUser(db, user, async (q) => {
  const marks = args.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await q.query(`select public.${fn}(${marks}) as r`, args);
  return rows[0].r;
});

async function newInvite(db, user) {
  const r = await rpc(db, user, 'create_invitation');
  return r.code;
}

/** a creates a space + code, b redeems it. Returns the shared relationship id. */
async function pair(db, a, b) {
  const code = await newInvite(db, a);
  const r = await rpc(db, b, 'redeem_invitation', code);
  expect(r).toMatchObject({ status: 'active' });
  return r.relationship_id;
}

const fresh = async () => {
  const db = await createDb();
  const u = {};
  for (const n of ['alice', 'bob', 'carol', 'dave']) u[n] = await createUser(db, n[0].toUpperCase() + n.slice(1));
  return { db, ...u };
};

// =============================================================================== posture
describe('database security posture', () => {
  let db;
  beforeAll(async () => { db = await createDb(); });

  it('has Row Level Security enabled on every table in the public schema', async () => {
    const rows = await admin(db, `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                  where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    expect(rows.map((r) => r.relname)).toEqual(expect.arrayContaining(
      ['profiles', 'relationships', 'relationship_members', 'invitations', 'invitation_attempts', 'game_progress', 'story_memories', 'questions', 'answers', 'answer_signals']));
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });

  it('gives the anon role no access to any table', async () => {
    const tables = (await admin(db, `select tablename from pg_tables where schemaname = 'public'`)).map((r) => r.tablename);
    for (const t of tables) {
      const err = await errorOf(asAnon(db, (q) => q.query(`select * from public.${t}`)));
      expect(err?.code, `anon select on ${t}`).toBe('42501');
    }
  });

  it('gives the anon role no callable functions', async () => {
    for (const fn of ['ensure_relationship()', 'create_invitation()', "redeem_invitation('x')", 'get_my_relationship()', 'leave_relationship()', 'delete_my_data()']) {
      const err = await errorOf(asAnon(db, (q) => q.query(`select public.${fn}`)));
      expect(err?.code, fn).toBe('42501');
    }
  });

  it('hides the invitation tables from signed-in users completely', async () => {
    const alice = await createUser(db, 'Poster');
    for (const t of ['invitations', 'invitation_attempts']) {
      expect((await errorOf(asUser(db, alice, (q) => q.query(`select * from public.${t}`))))?.code, t).toBe('42501');
      expect((await errorOf(asUser(db, alice, (q) => q.query(`delete from public.${t}`))))?.code, t).toBe('42501');
    }
  });

  it('does not let clients write relationships or memberships directly', async () => {
    const u = await createUser(db, 'Writer');
    expect((await errorOf(asUser(db, u, (q) => q.query(`insert into public.relationships default values`))))?.code).toBe('42501');
    const rel = await rpc(db, u, 'ensure_relationship');
    const other = await createUser(db, 'Other');
    expect((await errorOf(asUser(db, other, (q) => q.query(`insert into public.relationship_members (relationship_id, user_id) values ($1, $2)`, [rel, other]))))?.code).toBe('42501');
    expect((await errorOf(asUser(db, u, (q) => q.query(`update public.relationship_members set user_id = $1`, [other]))))?.code).toBe('42501');
    expect((await errorOf(asUser(db, u, (q) => q.query(`update public.relationships set status = 'active' where id = $1`, [rel]))))?.code).toBe('42501');
  });

  it('keeps internal helper functions away from clients', async () => {
    const u = await createUser(db, 'Caller');
    for (const fn of ['_generate_invite_code()', "_normalize_invite_code('x')", 'touch_updated_at()', 'handle_new_user()',
      `_move_user_data('${u}', '${u}', '${u}')`]) {
      const err = await errorOf(asUser(db, u, (q) => q.query(`select public.${fn}`)));
      expect(err?.code, fn).toBe('42501');
    }
  });

  it('makes every security-definer function pin its search_path', async () => {
    const rows = await admin(db, `select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                  where n.nspname = 'public' and p.prosecdef`);
    expect(rows.length).toBeGreaterThan(8);
    for (const r of rows) expect(r.proconfig?.join(',') ?? '', r.proname).toMatch(/search_path=""/);
  });

  it('publishes only the content-free tables to Realtime (never answers)', async () => {
    const rows = (await admin(db, `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`)).map((r) => r.tablename);
    expect(rows.sort()).toEqual(['answer_signals', 'relationship_members']);
  });

  it('can be applied twice (migrations are re-runnable)', async () => {
    await applyMigrations(db);
    expect((await admin(db, 'select count(*)::int as n from public.questions'))[0].n).toBeGreaterThanOrEqual(20);
  });
});

// ============================================================================== profiles
describe('profiles', () => {
  it('are created on sign-up, readable and editable only by their owner, in permitted fields', async () => {
    const { db, alice, bob } = await fresh();
    const mine = await asUser(db, alice, (q) => q.query('select id, display_name, selected_character from public.profiles'));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: alice, display_name: 'Alice', selected_character: 'mule' });

    await asUser(db, alice, (q) => q.query(`update public.profiles set display_name = 'Ally', selected_character = 'princess' where id = $1`, [alice]));
    expect((await admin(db, 'select display_name, selected_character from public.profiles where id = $1', [alice]))[0]).toEqual({ display_name: 'Ally', selected_character: 'princess' });

    // someone else's row: invisible, so the update touches nothing
    const touched = await asUser(db, alice, (q) => q.query(`update public.profiles set display_name = 'hacked' where id = $1 returning id`, [bob]));
    expect(touched).toHaveLength(0);
    expect((await admin(db, 'select display_name from public.profiles where id = $1', [bob]))[0].display_name).toBe('Bob');

    // columns that may not change
    expect((await errorOf(asUser(db, alice, (q) => q.query(`update public.profiles set id = $1 where id = $2`, [bob, alice]))))?.code).toBe('42501');
    expect((await errorOf(asUser(db, alice, (q) => q.query(`update public.profiles set created_at = now() where id = $1`, [alice]))))?.code).toBe('42501');
    // values the schema forbids
    expect((await errorOf(asUser(db, alice, (q) => q.query(`update public.profiles set selected_character = 'admin' where id = $1`, [alice]))))?.code).toBe('23514');
    expect((await errorOf(asUser(db, alice, (q) => q.query(`update public.profiles set display_name = '' where id = $1`, [alice]))))?.code).toBe('23514');
  });

  it('cannot be created for somebody else', async () => {
    const { db, alice, bob } = await fresh();
    await admin(db, 'delete from public.profiles where id = $1', [bob]);
    expect((await errorOf(asUser(db, alice, (q) => q.query(`insert into public.profiles (id, display_name) values ($1, 'Fake')`, [bob]))))?.code).toBe('42501');
    await asUser(db, bob, (q) => q.query(`insert into public.profiles (id, display_name) values ($1, 'Bob again')`, [bob]));
  });
});

// ============================================================================== pairing
describe('pairing', () => {
  it('creates a 20-character code, stores only its hash, and pairs exactly two accounts', async () => {
    const { db, alice, bob } = await fresh();
    const inv = await rpc(db, alice, 'create_invitation');
    expect(inv.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
    expect(Date.parse(inv.expires_at) - Date.now()).toBeGreaterThan(47 * 3600 * 1000);
    expect(Date.parse(inv.expires_at) - Date.now()).toBeLessThanOrEqual(48 * 3600 * 1000);

    // the plain code is nowhere in the database; only SHA-256(code) is
    const rows = await admin(db, `select token_hash, to_jsonb(i)::text as dump from public.invitations i`);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe((await admin(db, `select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h`, [inv.code]))[0].h);
    expect(rows[0].dump).not.toContain(inv.code);

    const waiting = await rpc(db, alice, 'get_my_relationship');
    expect(waiting).toMatchObject({ status: 'pending', member_count: 1, partner: null });
    expect(waiting.invitation.expires_at).toBeTruthy();

    const joined = await rpc(db, bob, 'redeem_invitation', inv.code);
    expect(joined).toMatchObject({ status: 'active', relationship_id: waiting.relationship_id });

    const a = await rpc(db, alice, 'get_my_relationship');
    const b = await rpc(db, bob, 'get_my_relationship');
    expect(a).toMatchObject({ status: 'active', member_count: 2 });
    expect(b.relationship_id).toBe(a.relationship_id);
    // a partner is described by name and character only: no email, no id
    expect(a.partner).toEqual({ display_name: 'Bob', selected_character: 'mule' });
    expect(b.partner).toEqual({ display_name: 'Alice', selected_character: 'mule' });
    expect(a.invitation).toBeNull();
    expect((await admin(db, 'select used_by from public.invitations'))[0].used_by).toBe(bob);
  });

  it('accepts the code the way people type it (lower case, dashes, O for 0, I or L for 1)', async () => {
    const { db, alice, bob } = await fresh();
    const { code } = await rpc(db, alice, 'create_invitation');
    const typed = code.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l').replace(/(.{5})(?=.)/g, '$1-');
    expect(await rpc(db, bob, 'redeem_invitation', `  ${typed}  `)).toMatchObject({ status: 'active' });
  });

  it('answers wrong, malformed, reused, revoked and expired codes identically', async () => {
    const { db, alice, bob, carol, dave } = await fresh();
    const same = { error: 'invalid_or_expired_code' };

    expect(await rpc(db, carol, 'redeem_invitation', 'ABCDE-FGHJK-MNPQR-STVWX')).toEqual(same);   // well formed, wrong
    expect(await rpc(db, carol, 'redeem_invitation', 'short')).toEqual(same);                       // malformed
    expect(await rpc(db, carol, 'redeem_invitation', null)).toEqual(same);                          // missing
    expect(await rpc(db, carol, 'redeem_invitation', "' or 1=1 --")).toEqual(same);                 // junk

    // used: second person trying a code that already paired the first two
    const used = await newInvite(db, alice);
    await rpc(db, bob, 'redeem_invitation', used);
    expect(await rpc(db, carol, 'redeem_invitation', used)).toEqual(same);

    // revoked: a newer code cancels the earlier one
    const { db: db2, alice: a2, bob: b2 } = await fresh();
    const first = await newInvite(db2, a2);
    const second = await newInvite(db2, a2);
    expect(await rpc(db2, b2, 'redeem_invitation', first)).toEqual(same);
    expect(await rpc(db2, b2, 'redeem_invitation', second)).toMatchObject({ status: 'active' });

    // expired
    const { db: db3, alice: a3, bob: b3 } = await fresh();
    const old = await newInvite(db3, a3);
    await admin(db3, `update public.invitations set expires_at = now() - interval '1 minute'`);
    expect(await rpc(db3, b3, 'redeem_invitation', old)).toEqual(same);
    expect((await rpc(db3, a3, 'get_my_relationship')).invitation).toBeNull();
    // ...and the inviter can simply create a fresh one
    expect(await rpc(db3, b3, 'redeem_invitation', await newInvite(db3, a3))).toMatchObject({ status: 'active' });
    void dave;
  });

  it('does not let you redeem your own code', async () => {
    const { db, alice } = await fresh();
    const code = await newInvite(db, alice);
    expect(await rpc(db, alice, 'redeem_invitation', code)).toEqual({ error: 'own_code' });
  });

  it('keeps a third account out of a full space, even with the code', async () => {
    const { db, alice, bob, carol } = await fresh();
    const code = await newInvite(db, alice);
    await rpc(db, bob, 'redeem_invitation', code);
    expect(await rpc(db, carol, 'redeem_invitation', code)).toEqual({ error: 'invalid_or_expired_code' });
    expect((await errorOf(rpc(db, alice, 'create_invitation')))?.message).toMatch(/already_paired/);
    expect((await admin(db, 'select count(*)::int as n from public.relationship_members'))[0].n).toBe(2);
  });

  it('does not let an outsider probe who belongs to which space', async () => {
    const { db, alice, bob, carol } = await fresh();
    const rel = await pair(db, alice, bob);
    const has = (viewer, user) => rpc(db, viewer, 'has_member', rel, user);
    expect(await has(alice, bob)).toBe(true);     // members can ask about their own space
    expect(await has(carol, bob)).toBe(false);    // an outsider learns nothing, even about a real member
    expect(await has(carol, alice)).toBe(false);
  });

  it('enforces the two-person limit inside the database as well', async () => {
    const { db, alice, bob, carol } = await fresh();
    const rel = await pair(db, alice, bob);
    // even a privileged insert (what a future bug in a function could do) is refused by the trigger
    const err = await errorOf(admin(db, `insert into public.relationship_members (relationship_id, user_id) values ($1, $2)`, [rel, carol]));
    expect(err?.message).toMatch(/relationship_full/);
  });

  it('refuses someone who is already paired with another person', async () => {
    const { db, alice, bob, carol, dave } = await fresh();
    await pair(db, alice, bob);
    const code = await newInvite(db, carol);
    expect((await errorOf(rpc(db, alice, 'redeem_invitation', code)))?.message).toMatch(/already_paired/);
    void dave;
  });

  it('rate limits guessing: five failures in 15 minutes lock redemption, even for a valid code', async () => {
    const { db, alice, bob, carol } = await fresh();
    const code = await newInvite(db, alice);
    for (let i = 0; i < 5; i += 1) {
      expect(await rpc(db, carol, 'redeem_invitation', 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZ' + i)).toEqual({ error: 'invalid_or_expired_code' });
    }
    expect((await errorOf(rpc(db, carol, 'redeem_invitation', 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZ9')))?.message).toMatch(/too_many_attempts/);
    expect((await errorOf(rpc(db, carol, 'redeem_invitation', code)))?.message).toMatch(/too_many_attempts/);   // the real code is refused too
    // the limit is per person: Bob is unaffected
    expect(await rpc(db, bob, 'redeem_invitation', code)).toMatchObject({ status: 'active' });
    // and it lifts after the window
    await admin(db, `update public.invitation_attempts set attempted_at = now() - interval '16 minutes' where user_id = $1`, [carol]);
    expect(await rpc(db, carol, 'redeem_invitation', 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZ8')).toEqual({ error: 'invalid_or_expired_code' });
  });

  it('limits how many codes one account can mint per hour', async () => {
    const { db, alice } = await fresh();
    for (let i = 0; i < 5; i += 1) await newInvite(db, alice);
    expect((await errorOf(rpc(db, alice, 'create_invitation')))?.message).toMatch(/too_many_invitations/);
  });

  it('requires a signed-in user for every function', async () => {
    const { db } = await fresh();
    for (const fn of ['ensure_relationship', 'create_invitation', 'get_my_relationship', 'leave_relationship', 'delete_my_data']) {
      const err = await errorOf(db.transaction(async (tx) => {
        await tx.exec('set local role authenticated');           // role without a JWT subject
        await tx.query(`select public.${fn}()`);
      }));
      expect(err?.message, fn).toMatch(/not_authenticated/);
    }
  });

  it('generates codes that do not repeat and use the whole alphabet', async () => {
    const { db } = await fresh();
    const codes = (await admin(db, `select public._generate_invite_code() as c from generate_series(1, 400)`)).map((r) => r.c);
    expect(new Set(codes).size).toBe(400);
    const seen = new Set(codes.join(''));
    expect(seen.size).toBeGreaterThanOrEqual(30);
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
  });

  it('folds a joiner’s own solo answers into the partner’s space, as private answers', async () => {
    const { db, alice, bob } = await fresh();
    const bobSolo = await rpc(db, bob, 'ensure_relationship');
    await saveAnswer(db, bob, bobSolo, 'loved.small', { text: 'bob wrote this before pairing' });
    await asUser(db, bob, (q) => q.query(`insert into public.game_progress (user_id, relationship_id, data) values ($1, $2, '{}'::jsonb)`, [bob, bobSolo]));

    const shared = await pair(db, alice, bob);
    expect(shared).not.toBe(bobSolo);
    expect((await admin(db, 'select count(*)::int as n from public.relationships where id = $1', [bobSolo]))[0].n).toBe(0);   // old space gone
    const mine = await myAnswers(db, bob);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ answer_text: 'bob wrote this before pairing', visibility: 'private' });
    expect((await admin(db, 'select relationship_id from public.answers'))[0].relationship_id).toBe(shared);
    expect((await admin(db, 'select relationship_id from public.game_progress'))[0].relationship_id).toBe(shared);
    expect(await myAnswers(db, alice)).toHaveLength(0);   // Alice sees nothing: it was private
  });
});

// ================================================================================ answers
describe('answers: privacy and ownership', () => {
  it('never shows a private answer or a draft to the partner, however they ask', async () => {
    const { db, alice, bob } = await fresh();
    const rel = await pair(db, alice, bob);
    await saveAnswer(db, alice, rel, 'loved.small', { text: 'PRIVATE-SECRET', visibility: 'private' });
    await saveAnswer(db, alice, rel, 'act.fav', { text: 'DRAFT-SECRET', visibility: 'shared', status: 'draft' });

    expect(await myAnswers(db, bob)).toEqual([]);
    // direct, filtered, counted and joined: all empty for Bob
    expect(await asUser(db, bob, (q) => q.query(`select * from public.answers where author_id = $1`, [alice]))).toEqual([]);
    expect(await asUser(db, bob, (q) => q.query(`select * from public.answers where answer_text like '%SECRET%'`))).toEqual([]);
    expect((await asUser(db, bob, (q) => q.query(`select count(*)::int as n from public.answers`)))[0].n).toBe(0);
    expect(await asUser(db, bob, (q) => q.query(`select * from public.answers where visibility = 'private' or status = 'draft'`))).toEqual([]);
    // Alice sees both of her own
    expect(await myAnswers(db, alice)).toHaveLength(2);
  });

  it('shows a shared, submitted answer to the partner and hides it again when it is made private', async () => {
    const { db, alice, bob } = await fresh();
    const rel = await pair(db, alice, bob);
    await saveAnswer(db, alice, rel, 'loved.small', { text: 'small things', visibility: 'shared', status: 'submitted' });

    const seen = await myAnswers(db, bob);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ author_id: alice, answer_text: 'small things', visibility: 'shared', status: 'submitted' });

    await saveAnswer(db, alice, rel, 'loved.small', { text: 'small things', visibility: 'private', status: 'submitted' });
    expect(await myAnswers(db, bob)).toEqual([]);

    await saveAnswer(db, alice, rel, 'loved.small', { text: 'small things', visibility: 'shared', status: 'draft' });   // back to draft: still hidden
    expect(await myAnswers(db, bob)).toEqual([]);
  });

  it('lets only the author edit or delete an answer, and only as themselves', async () => {
    const { db, alice, bob } = await fresh();
    const rel = await pair(db, alice, bob);
    await saveAnswer(db, alice, rel, 'loved.small', { text: 'original', visibility: 'shared' });

    const edited = await asUser(db, bob, (q) => q.query(`update public.answers set answer_text = 'tampered' returning id`));
    expect(edited).toEqual([]);
    const removed = await asUser(db, bob, (q) => q.query(`delete from public.answers returning id`));
    expect(removed).toEqual([]);
    expect((await admin(db, 'select answer_text from public.answers'))[0].answer_text).toBe('original');

    // inserting an answer in someone else's name
    const q = await qId(db, 'act.fav');
    const spoof = await errorOf(asUser(db, bob, (c) => c.query(
      `insert into public.answers (relationship_id, question_id, author_id, answer_text, visibility, status) values ($1, $2, $3, 'spoofed', 'shared', 'submitted')`, [rel, q, alice])));
    expect(spoof?.code).toBe('42501');
    // taking over an existing answer through an upsert in Alice's name
    await saveAnswer(db, bob, rel, 'loved.small', { text: 'bob', visibility: 'shared' });
    const aliceQuestion = await qId(db, 'loved.small');
    const takeover = await errorOf(asUser(db, bob, (c) => c.query(
      `insert into public.answers (relationship_id, question_id, author_id, answer_text) values ($1, $2, $3, 'x') on conflict (relationship_id, question_id, author_id) do update set answer_text = 'x'`,
      [rel, aliceQuestion, alice])));
    expect(takeover?.code).toBe('42501');
    // Bob's own legitimate answer to the same question is a separate row
    expect((await admin(db, 'select count(*)::int as n from public.answers'))[0].n).toBe(2);

    // the author can edit and delete theirs
    await asUser(db, alice, (c) => c.query(`update public.answers set answer_text = 'edited' where author_id = $1 and answer_text = 'original'`, [alice]));
    expect((await admin(db, `select answer_text from public.answers where author_id = $1`, [alice]))[0].answer_text).toBe('edited');
    const gone = await asUser(db, alice, (c) => c.query(`delete from public.answers where author_id = $1 returning id`, [alice]));
    expect(gone).toHaveLength(1);
  });

  it('does not let an answer be re-pointed at another author, question or space', async () => {
    const { db, alice, bob, carol } = await fresh();
    const rel = await pair(db, alice, bob);
    const carolRel = await rpc(db, carol, 'ensure_relationship');
    await saveAnswer(db, alice, rel, 'loved.small', { text: 'x' });
    const other = await qId(db, 'act.fav');
    for (const [col, val] of [['author_id', bob], ['question_id', other], ['relationship_id', carolRel], ['created_at', '2000-01-01']]) {
      const err = await errorOf(asUser(db, alice, (q) => q.query(`update public.answers set ${col} = $1 where author_id = $2`, [val, alice])));
      expect(err, col).not.toBeNull();
    }
    expect((await admin(db, 'select relationship_id from public.answers'))[0].relationship_id).toBe(rel);
  });

  it('keeps a third account away from everything in a pair’s space', async () => {
    const { db, alice, bob, carol } = await fresh();
    const rel = await pair(db, alice, bob);
    await saveAnswer(db, alice, rel, 'loved.small', { text: 'shared one', visibility: 'shared' });
    await saveAnswer(db, bob, rel, 'act.fav', { text: 'private one', visibility: 'private' });
    await asUser(db, alice, (q) => q.query(`insert into public.story_memories (relationship_id, stage_id, memory_key, content) values ($1, 'stage4', 'closing-message', '{"x":1}')`, [rel]));

    expect(await myAnswers(db, carol)).toEqual([]);
    expect(await asUser(db, carol, (q) => q.query('select * from public.relationships'))).toEqual([]);
    expect(await asUser(db, carol, (q) => q.query('select * from public.relationship_members'))).toEqual([]);
    expect(await asUser(db, carol, (q) => q.query('select * from public.story_memories'))).toEqual([]);
    expect(await asUser(db, carol, (q) => q.query('select * from public.answer_signals'))).toEqual([]);
    expect(await asUser(db, carol, (q) => q.query('select * from public.profiles where id <> $1', [carol]))).toEqual([]);

    // she cannot write into their space either
    const q = await qId(db, 'act.more');
    expect((await errorOf(asUser(db, carol, (c) => c.query(
      `insert into public.answers (relationship_id, question_id, author_id, answer_text) values ($1, $2, $3, 'intruder')`, [rel, q, carol]))))?.code).toBe('42501');
    expect((await errorOf(asUser(db, carol, (c) => c.query(
      `insert into public.story_memories (relationship_id, stage_id, memory_key, content) values ($1, 'stage4', 'x', '{}')`, [rel]))))?.code).toBe('42501');
    expect((await errorOf(asUser(db, carol, (c) => c.query(
      `insert into public.game_progress (user_id, relationship_id, data) values ($1, $2, '{}')`, [carol, rel]))))?.code).toBe('42501');
    expect(await asUser(db, carol, (c) => c.query(`delete from public.story_memories returning id`))).toEqual([]);
  });

  it('refuses to share without a partner, in the database itself', async () => {
    const { db, dave } = await fresh();
    const solo = await rpc(db, dave, 'ensure_relationship');
    const err = await errorOf(saveAnswer(db, dave, solo, 'loved.small', { text: 'hello?', visibility: 'shared' }));
    expect(err?.message).toMatch(/not_paired/);
    await saveAnswer(db, dave, solo, 'loved.small', { text: 'hello', visibility: 'private' });   // private is fine
  });

  it('refuses to write into a space you are not a member of', async () => {
    const { db, alice, carol } = await fresh();
    const rel = await rpc(db, alice, 'ensure_relationship');
    const err = await errorOf(saveAnswer(db, carol, rel, 'loved.small', { text: 'not mine' }));
    expect(err?.code).toBe('42501');
  });

  it('validates answers server-side (length, one line, options, empty submissions, unknown questions)', async () => {
    const { db, alice } = await fresh();
    const rel = await rpc(db, alice, 'ensure_relationship');
    const bad = async (key, args, pattern) => expect((await errorOf(saveAnswer(db, alice, rel, key, args)))?.message, key).toMatch(pattern);

    await bad('act.fav', { text: 'x'.repeat(161) }, /invalid_answer/);              // short: 160 max
    await bad('act.fav', { text: 'two\nlines' }, /invalid_answer/);                // short: one line
    await bad('loved.small', { text: 'x'.repeat(1501) }, /invalid_answer/);        // long: 1500 max
    await bad('loved.show', { choice: 'Not an option' }, /invalid_answer/);        // choice must be one of the options
    await bad('loved.show', { choice: null, text: 'note only' }, /invalid_answer/); // submitted choice needs a pick
    await bad('loved.small', { text: '   ' }, /invalid_answer/);                   // submitted needs content
    await bad('loved.show', { choice: 'Touch', text: 'x'.repeat(401) }, /invalid_answer/);

    // a draft may be empty-ish, and surrounding whitespace is trimmed
    await saveAnswer(db, alice, rel, 'loved.small', { text: '  hello  ', status: 'draft' });
    expect((await admin(db, 'select answer_text from public.answers'))[0].answer_text).toBe('hello');
    await saveAnswer(db, alice, rel, 'loved.show', { choice: 'Touch', text: 'because', status: 'submitted' });
    // text answers never keep a stray choice
    await saveAnswer(db, alice, rel, 'act.more', { text: 'walks' });
    expect((await admin(db, `select answer_choice from public.answers a join public.questions q on q.id = a.question_id where q.question_key = 'act.more'`))[0].answer_choice).toBeNull();

    const nonsense = await errorOf(asUser(db, alice, (q) => q.query(
      `insert into public.answers (relationship_id, question_id, author_id, answer_text) values ($1, gen_random_uuid(), $2, 'x')`, [rel, alice])));
    expect(nonsense).not.toBeNull();
  });

  it('keeps one current answer per author, question and space', async () => {
    const { db, alice } = await fresh();
    const rel = await rpc(db, alice, 'ensure_relationship');
    await saveAnswer(db, alice, rel, 'loved.small', { text: 'one' });
    await saveAnswer(db, alice, rel, 'loved.small', { text: 'two' });   // upsert replaces
    const rows = await admin(db, 'select answer_text from public.answers');
    expect(rows).toEqual([{ answer_text: 'two' }]);
    const q = await qId(db, 'loved.small');
    const dup = await errorOf(admin(db, `insert into public.answers (relationship_id, question_id, author_id, answer_text) values ($1, $2, $3, 'dup')`, [rel, q, alice]));
    expect(dup?.code).toBe('23505');
  });

  it('does not let questions be changed from the browser', async () => {
    const { db, alice } = await fresh();
    expect((await asUser(db, alice, (q) => q.query('select count(*)::int as n from public.questions')))[0].n).toBeGreaterThan(20);
    for (const sql of [`insert into public.questions (question_key, category, question_text, response_type) values ('x.y', 'c', 't', 'short')`,
      `update public.questions set question_text = 'x'`, 'delete from public.questions']) {
      expect((await errorOf(asUser(db, alice, (q) => q.query(sql))))?.code, sql).toBe('42501');
    }
  });
});

// ================================================================================ signals
describe('realtime signals', () => {
  it('announce shared changes to the partner without any answer text, and stay silent for private ones', async () => {
    const { db, alice, bob, carol } = await fresh();
    const rel = await pair(db, alice, bob);
    const before = (await admin(db, 'select count(*)::int as n from public.answer_signals'))[0].n;

    await saveAnswer(db, alice, rel, 'loved.small', { text: 'TOP-SECRET', visibility: 'private' });
    await saveAnswer(db, alice, rel, 'act.fav', { text: 'TOP-SECRET', visibility: 'shared', status: 'draft' });
    expect((await admin(db, 'select count(*)::int as n from public.answer_signals'))[0].n).toBe(before);   // nothing leaked, nothing signalled

    await saveAnswer(db, alice, rel, 'act.fav', { text: 'TOP-SECRET', visibility: 'shared', status: 'submitted' });
    await saveAnswer(db, alice, rel, 'act.fav', { text: 'TOP-SECRET', visibility: 'private', status: 'submitted' });
    await asUser(db, alice, (q) => q.query(`delete from public.answers where author_id = $1`, [alice]));

    const seen = await asUser(db, bob, (q) => q.query('select * from public.answer_signals order by id'));
    expect(seen.map((s) => s.kind)).toEqual(['shared', 'unshared']);          // deleting a private answer adds nothing
    for (const s of seen) {
      expect(Object.keys(s).sort()).toEqual(['author_id', 'created_at', 'id', 'kind', 'question_id', 'relationship_id']);
      expect(JSON.stringify(s)).not.toContain('SECRET');
    }
    expect(await asUser(db, carol, (q) => q.query('select * from public.answer_signals'))).toEqual([]);
  });
});

// ========================================================================== story + progress
describe('story memories and game progress', () => {
  it('lets both members share a story entry, and lets the partner update what the other created', async () => {
    const { db, alice, bob } = await fresh();
    const rel = await pair(db, alice, bob);
    const upsert = (user, content) => asUser(db, user, (q) => q.query(
      `insert into public.story_memories (relationship_id, stage_id, memory_key, content) values ($1, 'stage4', 'closing-message', $2::jsonb)
       on conflict (relationship_id, stage_id, memory_key) do update set content = excluded.content returning created_by, content`,
      [rel, JSON.stringify(content)]));
    const first = await upsert(alice, { standard: { title: 'one', lines: ['a'] } });
    expect(first[0].created_by).toBe(alice);                       // filled by the default, never trusted from the client
    const second = await upsert(bob, { standard: { title: 'two', lines: ['b'] } });
    expect(second[0].created_by).toBe(alice);                      // authorship stays with the creator
    expect((await asUser(db, alice, (q) => q.query('select content from public.story_memories')))[0].content.standard.title).toBe('two');

    // cannot claim to be someone else, or use an unknown stage / key
    const spoof = await errorOf(asUser(db, bob, (q) => q.query(
      `insert into public.story_memories (relationship_id, stage_id, memory_key, content, created_by) values ($1, 'stage1', 'k', '{}', $2)`, [rel, alice])));
    expect(spoof?.code).toBe('42501');
    expect((await errorOf(asUser(db, bob, (q) => q.query(`insert into public.story_memories (relationship_id, stage_id, memory_key, content) values ($1, 'stage9', 'k', '{}')`, [rel]))))?.code).toBe('23514');
    expect((await errorOf(asUser(db, bob, (q) => q.query(`insert into public.story_memories (relationship_id, stage_id, memory_key, content) values ($1, 'stage1', 'BAD KEY', '{}')`, [rel]))))?.code).toBe('23514');
  });

  it('keeps each player’s progress private to them', async () => {
    const { db, alice, bob } = await fresh();
    await pair(db, alice, bob);
    const save = (user, data) => asUser(db, user, (q) => q.query(
      `insert into public.game_progress (user_id, selected_character, data) values ($1, 'princess', $2::jsonb)
       on conflict (user_id) do update set data = excluded.data, selected_character = excluded.selected_character returning user_id`,
      [user, JSON.stringify(data)]));
    await save(alice, { completedStages: ['stage1'] });
    await save(alice, { completedStages: ['stage1', 'stage2'] });   // upsert
    await save(bob, { completedStages: [] });

    const mine = await asUser(db, alice, (q) => q.query('select user_id, data from public.game_progress'));
    expect(mine).toHaveLength(1);
    expect(mine[0].data.completedStages).toEqual(['stage1', 'stage2']);
    // cannot write progress for someone else, nor read it
    const eve = await createUser(db, 'Eve');
    expect((await errorOf(asUser(db, alice, (q) => q.query(`insert into public.game_progress (user_id, data) values ($1, '{}')`, [eve]))))?.code).toBe('42501');
    expect(await asUser(db, alice, (q) => q.query(`update public.game_progress set data = '{"x":1}'::jsonb where user_id = $1 returning user_id`, [bob]))).toEqual([]);
    // oversized or malformed progress is refused
    expect((await errorOf(asUser(db, alice, (q) => q.query(`update public.game_progress set data = '[]'::jsonb where user_id = $1`, [alice]))))?.code).toBe('23514');
    expect((await errorOf(asUser(db, alice, (q) => q.query(`update public.game_progress set user_id = $1 where user_id = $2`, [bob, alice]))))).not.toBeNull();
  });
});

// =================================================================== leaving and deleting
describe('leaving and deleting', () => {
  it('moves a leaver’s answers into a private space of their own and keeps the partner’s', async () => {
    const { db, alice, bob, carol } = await fresh();
    const rel = await pair(db, alice, bob);
    await saveAnswer(db, alice, rel, 'loved.small', { text: 'alice shared', visibility: 'shared' });
    await saveAnswer(db, bob, rel, 'act.fav', { text: 'bob shared', visibility: 'shared' });
    await saveAnswer(db, bob, rel, 'act.more', { text: 'bob private', visibility: 'private' });

    const left = await rpc(db, alice, 'leave_relationship');
    expect(left.relationship_id).not.toBe(rel);

    // Alice: her answer is hers alone and private; she is in a space with nobody else
    expect(await myAnswers(db, alice)).toEqual([expect.objectContaining({ answer_text: 'alice shared', visibility: 'private', author_id: alice })]);
    expect(await rpc(db, alice, 'get_my_relationship')).toMatchObject({ status: 'pending', member_count: 1, partner: null });
    // Bob: still has his own answers, their space is pending, his shared answer reverted to private
    expect((await myAnswers(db, bob)).map((a) => [a.question_key, a.visibility])).toEqual([['act.fav', 'private'], ['act.more', 'private']]);
    expect(await rpc(db, bob, 'get_my_relationship')).toMatchObject({ status: 'pending', member_count: 1, partner: null });

    // Bob pairs with someone new: Carol never sees what was shared with Alice
    await pair(db, bob, carol);
    expect(await myAnswers(db, carol)).toEqual([]);
    // and Alice (a stranger now) sees nothing of Bob's
    expect((await myAnswers(db, alice)).every((a) => a.author_id === alice)).toBe(true);
  });

  it('tells the old space an answer left it (so a partner’s screen can drop it)', async () => {
    const { db, alice, bob } = await fresh();
    const rel = await pair(db, alice, bob);
    await saveAnswer(db, alice, rel, 'loved.small', { text: 'x', visibility: 'shared' });
    await rpc(db, alice, 'leave_relationship');
    const signals = await admin(db, `select kind, relationship_id from public.answer_signals order by id`);
    expect(signals.map((s) => s.kind)).toEqual(['shared', 'unshared']);
    expect(signals[1].relationship_id).toBe(rel);
  });

  it('does not let someone leave a space that has no partner', async () => {
    const { db, alice } = await fresh();
    await rpc(db, alice, 'ensure_relationship');
    expect((await errorOf(rpc(db, alice, 'leave_relationship')))?.message).toMatch(/not_paired/);
  });

  it('deletes everything a person has online and leaves their partner’s data alone', async () => {
    const { db, alice, bob } = await fresh();
    const rel = await pair(db, alice, bob);
    await saveAnswer(db, alice, rel, 'loved.small', { text: 'a1', visibility: 'shared' });
    await saveAnswer(db, bob, rel, 'act.fav', { text: 'b1', visibility: 'shared' });
    await asUser(db, alice, (q) => q.query(`insert into public.game_progress (user_id, data) values ($1, '{}')`, [alice]));
    await asUser(db, alice, (q) => q.query(`insert into public.story_memories (relationship_id, stage_id, memory_key, content) values ($1, 'stage4', 'closing-message', '{}')`, [rel]));
    await asUser(db, bob, (q) => q.query(`insert into public.game_progress (user_id, data) values ($1, '{}')`, [bob]));

    await rpc(db, alice, 'delete_my_data');

    const left = async (table, col, id) => (await admin(db, `select count(*)::int as n from public.${table} where ${col} = $1`, [id]))[0].n;
    expect(await left('answers', 'author_id', alice)).toBe(0);
    expect(await left('game_progress', 'user_id', alice)).toBe(0);
    expect(await left('profiles', 'id', alice)).toBe(0);
    expect(await left('relationship_members', 'user_id', alice)).toBe(0);
    expect((await admin(db, 'select count(*)::int as n from public.story_memories'))[0].n).toBe(0);
    expect((await admin(db, 'select count(*)::int as n from auth.users where id = $1', [alice]))[0].n).toBe(1);   // the sign-in itself stays (needs admin rights)

    // Bob keeps everything of his and the space is open for a new partner; his shared answer is private now
    expect((await myAnswers(db, bob)).map((a) => [a.answer_text, a.visibility])).toEqual([['b1', 'private']]);
    expect(await left('game_progress', 'user_id', bob)).toBe(1);
    expect(await rpc(db, bob, 'get_my_relationship')).toMatchObject({ status: 'pending', member_count: 1 });

    // if the last member deletes, the space itself disappears
    await rpc(db, bob, 'delete_my_data');
    expect((await admin(db, 'select count(*)::int as n from public.relationships'))[0].n).toBe(0);
    expect((await admin(db, 'select count(*)::int as n from public.answers'))[0].n).toBe(0);
  });

  it('can be repeated safely (delete twice, sign in again, start over)', async () => {
    const { db, alice } = await fresh();
    await rpc(db, alice, 'ensure_relationship');
    await rpc(db, alice, 'delete_my_data');
    await rpc(db, alice, 'delete_my_data');
    expect(await rpc(db, alice, 'get_my_relationship')).toBeNull();
    // a returning user gets a new space and can recreate a profile
    await rpc(db, alice, 'ensure_relationship');
    await asUser(db, alice, (q) => q.query(`insert into public.profiles (id, display_name) values ($1, 'Alice') on conflict (id) do nothing`, [alice]));
    expect(await rpc(db, alice, 'get_my_relationship')).toMatchObject({ status: 'pending' });
  });
});

// ==================================================================================== seed
describe('question seed', () => {
  it('matches src/data/questions.js exactly', async () => {
    const { QUESTIONS } = await import('../src/data/questions.js');
    const db = await createDb();
    const rows = await admin(db, 'select question_key, category, question_text, response_type, options, stage_id, active from public.questions order by sort_order');
    expect(rows.map((r) => r.question_key)).toEqual(QUESTIONS.map((q) => q.key));
    for (const [i, q] of QUESTIONS.entries()) {
      expect(rows[i]).toMatchObject({ category: q.category, question_text: q.text, response_type: q.type, stage_id: q.stage ?? null, active: true });
      if (q.type === 'choice') expect(rows[i].options).toEqual(q.options); else expect(rows[i].options).toBeNull();
    }
  });

  it('switches off removed questions but keeps the answers that point at them', async () => {
    const { db, alice } = await fresh();
    const rel = await rpc(db, alice, 'ensure_relationship');
    await saveAnswer(db, alice, rel, 'night.fog', { text: 'a quiet city' });
    await admin(db, `delete from public.questions where question_key = 'night.wait'`);
    await admin(db, `insert into public.questions (question_key, category, question_text, response_type) values ('old.one', 'log', 'Retired?', 'short')`);
    const { readFileSync } = await import('node:fs');
    const { migrationFiles } = await import('./helpers/db.js');
    await db.exec(readFileSync(migrationFiles().at(-1), 'utf8'));          // re-run the seed
    expect((await admin(db, `select active from public.questions where question_key = 'old.one'`))[0].active).toBe(false);
    expect((await admin(db, `select active from public.questions where question_key = 'night.wait'`))[0].active).toBe(true);   // restored
    expect((await admin(db, 'select count(*)::int as n from public.answers'))[0].n).toBe(1);
    // a retired question can no longer collect new answers
    const err = await errorOf(saveAnswer(db, alice, rel, 'old.one', { text: 'late' }));
    expect(err?.message).toMatch(/question_not_seeded/);
  });
});
