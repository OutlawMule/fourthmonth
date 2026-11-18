// Test harness: a real PostgreSQL engine (PGlite, in-process WebAssembly Postgres) with a small
// emulation of the parts of Supabase our SQL relies on:
//   * the roles anon / authenticated / service_role,
//   * an `auth` schema with `auth.users` and `auth.uid()` (reads the same JWT setting PostgREST sets),
//   * Supabase's broad default privileges on new public objects (our migrations must strip these),
//   * the `supabase_realtime` publication.
// Everything else is the real migration files, applied in order, exactly as a person would run them.
//
// What this does NOT prove: that Supabase Auth / PostgREST / Realtime behave the same in a
// hosted project. It proves that the SQL (tables, triggers, functions, RLS, grants) enforces the
// rules, for real users acting through the same roles the browser uses.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// MULE_MIGRATIONS_DIR lets a mutation check point the suite at a deliberately broken copy.
export const MIGRATIONS_DIR = process.env.MULE_MIGRATIONS_DIR || join(ROOT, 'supabase', 'migrations');

export const SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create publication supabase_realtime;
`;

export const migrationFiles = () =>
  readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort().map((f) => join(MIGRATIONS_DIR, f));

export async function createDb({ migrate = true } = {}) {
  const db = new PGlite();
  await db.exec(SHIM);
  if (migrate) await applyMigrations(db);
  return db;
}

export async function applyMigrations(db) {
  for (const f of migrationFiles()) await db.exec(readFileSync(f, 'utf8'));
}

/** Creates an auth user (the signup trigger creates the profile). Returns the user id. */
export async function createUser(db, name, email = `${name.toLowerCase()}@example.test`) {
  const r = await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
    [email, JSON.stringify({ display_name: name })],
  );
  return r.rows[0].id;
}

/**
 * Runs `fn(q)` inside one transaction as the browser would: role `authenticated`, JWT subject
 * `userId`. `q.query(sql, params)` returns rows. The transaction commits when fn resolves and is
 * rolled back when it throws. Use one call per statement that is EXPECTED to fail.
 */
export async function asUser(db, userId, fn) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    const q = { query: async (sql, params) => (await tx.query(sql, params)).rows, exec: (sql) => tx.exec(sql) };
    return fn(q);
  });
}

export async function asAnon(db, fn) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role anon');
    const q = { query: async (sql, params) => (await tx.query(sql, params)).rows, exec: (sql) => tx.exec(sql) };
    return fn(q);
  });
}

/** Superuser-level query (the "dashboard" / migration owner). Never used to test client behaviour. */
export const admin = async (db, sql, params) => (await db.query(sql, params)).rows;

/** Resolves with the thrown error (or null when nothing was thrown). */
export async function errorOf(promise) {
  try { await promise; return null; } catch (e) { return e; }
}
