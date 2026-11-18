// Generates supabase/migrations/20261029000006_seed_questions.sql from src/data/questions.js,
// so the questions in the database always match the questions in the game.
//
//   node scripts/generate-question-seed.mjs            write the file
//   node scripts/generate-question-seed.mjs --check    exit 1 if the file on disk is out of date
//
// After editing src/data/questions.js: run this, then run the (re)generated file in the
// Supabase SQL editor. It is safe to run again and again: existing rows are updated in place
// and questions you removed are switched off (answers that already reference them are kept).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CATEGORIES, QUESTIONS } from '../src/data/questions.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SEED_FILE = join(ROOT, 'supabase', 'migrations', '20261029000006_seed_questions.sql');

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,47}$/;
const TYPES = new Set(['short', 'long', 'choice']);
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function validateQuestions() {
  const problems = [];
  const seen = new Set();
  const cats = new Set(CATEGORIES.map((c) => c.key));
  for (const q of QUESTIONS) {
    if (!KEY_RE.test(q.key)) problems.push(`${q.key}: key must match ${KEY_RE}`);
    if (seen.has(q.key)) problems.push(`${q.key}: duplicate key`);
    seen.add(q.key);
    if (!cats.has(q.category)) problems.push(`${q.key}: unknown category "${q.category}"`);
    if (!TYPES.has(q.type)) problems.push(`${q.key}: type must be short, long or choice`);
    if (!q.text?.trim()) problems.push(`${q.key}: empty text`);
    if (q.type === 'choice' && !(Array.isArray(q.options) && q.options.length >= 2)) problems.push(`${q.key}: a choice question needs at least 2 options`);
    if (q.type === 'choice' && q.options?.some((o) => typeof o !== 'string' || !o.trim() || o.length > 120)) problems.push(`${q.key}: options must be non-empty text of at most 120 characters`);
  }
  return problems;
}

export function buildSeedSql() {
  const rows = QUESTIONS.map((q, i) => {
    const options = q.type === 'choice' ? `${lit(JSON.stringify(q.options))}::jsonb` : 'null';
    return `  (${lit(q.key)}, ${lit(q.category)}, ${lit(q.text)}, ${lit(q.type)}, ${options}, ${q.stage ? lit(q.stage) : 'null'}, ${(i + 1) * 10}, true)`;
  });
  const keys = QUESTIONS.map((q) => lit(q.key)).join(', ');
  return `-- =============================================================================
-- MULE × PRINCESS — migration 6 of 6: question seed (GENERATED — do not edit by hand)
-- =============================================================================
-- Source of truth: src/data/questions.js
-- Regenerate with: node scripts/generate-question-seed.mjs
-- Safe to run repeatedly: rows are updated in place, and questions removed from the game
-- are switched off (never deleted, so answers that point at them are kept).
-- =============================================================================

insert into public.questions (question_key, category, question_text, response_type, options, stage_id, sort_order, active)
values
${rows.join(',\n')}
on conflict (question_key) do update set
  category      = excluded.category,
  question_text = excluded.question_text,
  response_type = excluded.response_type,
  options       = excluded.options,
  stage_id      = excluded.stage_id,
  sort_order    = excluded.sort_order,
  active        = true;

update public.questions set active = false where question_key not in (${keys}) and active;
`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const problems = validateQuestions();
  if (problems.length) {
    console.error('src/data/questions.js has problems:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  const sql = buildSeedSql();
  if (process.argv.includes('--check')) {
    const current = existsSync(SEED_FILE) ? readFileSync(SEED_FILE, 'utf8') : '';
    if (current !== sql) {
      console.error('The question seed is out of date. Run: node scripts/generate-question-seed.mjs');
      process.exit(1);
    }
    console.log(`Question seed is up to date (${QUESTIONS.length} questions).`);
  } else {
    writeFileSync(SEED_FILE, sql);
    console.log(`Wrote ${SEED_FILE} (${QUESTIONS.length} questions).`);
  }
}
