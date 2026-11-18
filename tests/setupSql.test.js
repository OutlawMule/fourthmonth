// The two files a person pastes into the Supabase SQL Editor:
//   supabase/SETUP_ALL_IN_ONE.sql      the six migrations joined into one script
//   supabase/VIEW_SHARED_ANSWERS.sql   the owner's read-only list of what was shared on purpose
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSetupSql, OUT } from '../scripts/build-setup-sql.mjs';
import { createDb, createUser, asUser, admin, ROOT } from './helpers/db.js';

const SETUP = readFileSync(OUT, 'utf8');
const VIEW = readFileSync(join(ROOT, 'supabase', 'VIEW_SHARED_ANSWERS.sql'), 'utf8');

const rpc = (db, user, fn, ...args) => asUser(db, user, async (q) => {
  const marks = args.map((_, i) => `$${i + 1}`).join(', ');
  return (await q.query(`select public.${fn}(${marks}) as r`, args))[0].r;
});

async function twoPeople(db) {
  const a = await createUser(db, 'Princess');
  const b = await createUser(db, 'Mule');
  const { code } = await rpc(db, a, 'create_invitation');
  const joined = await rpc(db, b, 'redeem_invitation', code);
  return { a, b, rel: joined.relationship_id };
}

const freeTextKeys = async (db) => (await admin(db, "select question_key from public.questions where response_type in ('short','long') order by sort_order, question_key limit 3")).map((r) => r.question_key);

const save = async (db, user, rel, key, text, visibility, status) => {
  const [{ id }] = await admin(db, 'select id from public.questions where question_key = $1', [key]);
  return asUser(db, user, (q) => q.query(
    `insert into public.answers (relationship_id, question_id, author_id, answer_text, visibility, status) values ($1, $2, $3, $4, $5, $6) returning id`,
    [rel, id, user, text, visibility, status]));
};

describe('supabase/SETUP_ALL_IN_ONE.sql', () => {
  it('is exactly the migrations, in order (regenerate with: npm run build:setup-sql)', () => {
    expect(SETUP).toBe(buildSetupSql());
  });

  it('runs as one script on an empty database: ten tables, row-level security on all of them, questions seeded', async () => {
    const db = await createDb({ migrate: false });
    await db.exec(SETUP);
    const tables = (await admin(db, "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename"));
    expect(tables.map((t) => t.tablename)).toEqual(['answer_signals', 'answers', 'game_progress', 'invitation_attempts', 'invitations', 'profiles', 'questions', 'relationship_members', 'relationships', 'story_memories']);
    expect(tables.every((t) => t.rowsecurity), 'RLS must be on for every table').toBe(true);
    expect((await admin(db, 'select count(*)::int as n from public.questions'))[0].n).toBeGreaterThan(10);
  });

  it('gives accounts that already exist a profile, so names show up even if the accounts were made first', async () => {
    const db = await createDb({ migrate: false });
    await admin(db, "insert into auth.users (email) values ('early.bird@example.test')");
    await admin(db, "insert into auth.users (email, raw_user_meta_data) values ('x@example.test', '{\"display_name\": \"Princess\"}')");
    await db.exec(SETUP);
    const names = (await admin(db, 'select display_name from public.profiles order by display_name')).map((r) => r.display_name);
    expect(names).toEqual(['Princess', 'early.bird']);
  });

  it('is safe to run again: nobody\'s answers are lost and private answers stay hidden', async () => {
    const db = await createDb({ migrate: false });
    await db.exec(SETUP);
    const { a, b, rel } = await twoPeople(db);
    const [k1, k2] = await freeTextKeys(db);
    await save(db, a, rel, k1, 'shared on purpose', 'shared', 'submitted');
    await save(db, a, rel, k2, 'kept private', 'private', 'submitted');

    await db.exec(SETUP); // second run, with real data in place

    expect((await admin(db, 'select count(*)::int as n from public.answers'))[0].n).toBe(2);
    expect((await admin(db, 'select count(*)::int as n from public.relationship_members'))[0].n).toBe(2);
    const seenByB = await asUser(db, b, (q) => q.query('select answer_text from public.answers'));
    expect(seenByB.map((r) => r.answer_text)).toEqual(['shared on purpose']);
  });
});

describe('supabase/VIEW_SHARED_ANSWERS.sql', () => {
  it('lists only answers that were submitted and shared, with who wrote them', async () => {
    const db = await createDb({ migrate: false });
    await db.exec(SETUP);
    const { a, b, rel } = await twoPeople(db);
    const [k1, k2, k3] = await freeTextKeys(db);
    await save(db, a, rel, k1, 'her shared answer', 'shared', 'submitted');
    await save(db, a, rel, k2, 'her private answer', 'private', 'submitted');
    await save(db, a, rel, k3, 'her shared draft', 'shared', 'draft');
    await save(db, b, rel, k1, 'his shared answer', 'shared', 'submitted');

    const rows = await admin(db, VIEW);
    expect(rows.map((r) => r.written_answer).sort()).toEqual(['her shared answer', 'his shared answer']);
    expect(Object.keys(rows[0])).toEqual(['who', 'character', 'category', 'question', 'chosen_option', 'written_answer', 'last_changed']);
    expect(rows.every((r) => r.who && r.question)).toBe(true);
  });

  it('is read-only (a single select, nothing that changes data)', () => {
    const code = VIEW.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).toMatch(/^\s*select\b/i);
    expect(code).not.toMatch(/\b(insert|update|delete|drop|alter|truncate|grant|create)\b/i);
  });
});
