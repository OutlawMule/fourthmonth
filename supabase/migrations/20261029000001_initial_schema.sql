-- =============================================================================
-- MULE × PRINCESS — migration 1 of 6: initial schema
-- =============================================================================
-- Tables, constraints, indexes and triggers. Row Level Security + grants are in
-- migration 2, the pairing functions in migration 3, Realtime in migration 4,
-- delete_my_data() in migration 5 and the (generated) question seed in migration 6.
--
-- Every statement is re-runnable (create ... if not exists / create or replace /
-- drop ... if exists), so pasting a migration into the Supabase SQL editor twice is
-- harmless.
--
-- Conventions
--   * SECURITY DEFINER functions always `set search_path = ''` and schema-qualify
--     everything, so nobody can shadow a table or function to hijack them.
--   * Nothing here stores a service-role key or any secret. The raw invitation code
--     is never stored, only its SHA-256 hash.
-- =============================================================================

-- ---------------------------------------------------------------- shared helpers
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Generic "these columns can never change" guard. Used instead of column privileges
-- on tables that clients write with INSERT ... ON CONFLICT DO UPDATE (an upsert sets
-- every column it was given, so column-level UPDATE grants would reject it).
--
-- One deliberate exception: while the pairing functions (redeem_invitation,
-- leave_relationship) move a player's own rows into another relationship space they set the
-- transaction-local flag `mule.allow_move`, and only `relationship_id` may then change.
-- Clients cannot set that flag: PostgREST only exposes functions of the public schema and
-- none of them sets it, and even if it were set, the UPDATE policies still require the player
-- to be a member of the destination space.
create or replace function public.guard_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
  moving boolean := coalesce(current_setting('mule.allow_move', true), 'off') = 'on';
begin
  foreach col in array tg_argv loop
    if col = 'relationship_id' and moving then
      continue;
    end if;
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      raise exception 'immutable_column: %', col using errcode = '42501';
    end if;
  end loop;
  return new;
end
$$;

-- ----------------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text not null default 'Player'
                       constraint profiles_display_name_len check (char_length(display_name) between 1 and 32),
  selected_character text not null default 'mule'
                       constraint profiles_character_valid check (selected_character in ('mule', 'princess')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists profiles_01_immutable on public.profiles;
create trigger profiles_01_immutable
  before update on public.profiles
  for each row execute function public.guard_immutable_columns('id', 'created_at');

drop trigger if exists profiles_02_touch on public.profiles;
create trigger profiles_02_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A profile row is created automatically for every new auth user. The client also
-- tolerates the row already existing (INSERT ... ON CONFLICT DO NOTHING).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_name is null then
    v_name := nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), '');
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(v_name, 'Player'), 32))
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sign-ins that already exist (for example accounts created in the dashboard before this script was run)
-- get a profile too; the trigger above only covers accounts created from now on.
insert into public.profiles (id, display_name)
select u.id,
       left(coalesce(
              nullif(btrim(coalesce(u.raw_user_meta_data ->> 'display_name', '')), ''),
              nullif(btrim(split_part(coalesce(u.email, ''), '@', 1)), ''),
              'Player'), 32)
from auth.users u
on conflict (id) do nothing;

-- ------------------------------------------------------------------ relationships
create table if not exists public.relationships (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null,
  status     text not null default 'pending'
               constraint relationships_status_valid check (status in ('pending', 'active', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.relationship_members (
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (relationship_id, user_id),
  -- one relationship space per person
  constraint relationship_members_one_space_per_user unique (user_id)
);

-- Two people at most, enforced in the database itself (not just in the pairing
-- function), serialised by locking the relationship row.
create or replace function public.enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform 1 from public.relationships where id = new.relationship_id for update;
  select count(*) into n from public.relationship_members where relationship_id = new.relationship_id;
  if n >= 2 then
    raise exception 'relationship_full' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists relationship_members_01_limit on public.relationship_members;
create trigger relationship_members_01_limit
  before insert on public.relationship_members
  for each row execute function public.enforce_member_limit();

-- When someone leaves (delete_my_data, or their auth user is deleted), an empty space
-- is removed and a half-empty one goes back to 'pending' so it can be re-invited. A space
-- with one person has nobody to share with, so every answer left in it becomes private again:
-- a future partner never sees something shared with the previous one.
create or replace function public.after_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  select count(*) into n from public.relationship_members where relationship_id = old.relationship_id;
  if n = 0 then
    delete from public.relationships where id = old.relationship_id;
  else
    update public.relationships set status = 'pending' where id = old.relationship_id and status = 'active';
    update public.answers set visibility = 'private' where relationship_id = old.relationship_id and visibility = 'shared';
  end if;
  return null;
end
$$;

drop trigger if exists relationship_members_02_removed on public.relationship_members;
create trigger relationship_members_02_removed
  after delete on public.relationship_members
  for each row execute function public.after_member_removed();

-- ------------------------------------------------------------------- invitations
-- token_hash = sha256(normalised 20-character code). The raw code exists only in the
-- response of create_relationship() / create_invitation(); it is never stored.
create table if not exists public.invitations (
  id              uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  token_hash      text not null constraint invitations_token_hash_unique unique,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  used_by         uuid references auth.users (id) on delete set null,
  revoked_at      timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists invitations_relationship_idx on public.invitations (relationship_id);

-- Failed/successful redemption attempts, used for rate limiting (see migration 3).
create table if not exists public.invitation_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists invitation_attempts_user_idx on public.invitation_attempts (user_id, attempted_at desc);

-- ----------------------------------------------------------------- game_progress
-- One row per player. `data` holds the full progress snapshot written by the game
-- (see src/utils/progress.js); the three jsonb columns mirror the fields the spec
-- names. NO answer text is ever stored here, only question keys.
create table if not exists public.game_progress (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  relationship_id     uuid references public.relationships (id) on delete set null,
  selected_character  text not null default 'mule'
                        constraint game_progress_character_valid check (selected_character in ('mule', 'princess')),
  unlocked_stages     jsonb not null default '["stage1"]'::jsonb
                        constraint game_progress_unlocked_array check (jsonb_typeof(unlocked_stages) = 'array'),
  completed_stages    jsonb not null default '[]'::jsonb
                        constraint game_progress_completed_array check (jsonb_typeof(completed_stages) = 'array'),
  collected_fragments jsonb not null default '{}'::jsonb
                        constraint game_progress_fragments_object check (jsonb_typeof(collected_fragments) = 'object'),
  data                jsonb not null default '{}'::jsonb
                        constraint game_progress_data_object check (jsonb_typeof(data) = 'object')
                        constraint game_progress_data_size check (pg_column_size(data) <= 131072),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint game_progress_one_per_user unique (user_id)
);

drop trigger if exists game_progress_01_immutable on public.game_progress;
create trigger game_progress_01_immutable
  before update on public.game_progress
  for each row execute function public.guard_immutable_columns('id', 'user_id', 'created_at');

drop trigger if exists game_progress_02_touch on public.game_progress;
create trigger game_progress_02_touch
  before update on public.game_progress
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------- story_memories
-- Shared story content for a relationship (e.g. the editable first-meeting letter
-- override or the closing message).
create table if not exists public.story_memories (
  id              uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  stage_id        text not null
                    constraint story_memories_stage_valid check (stage_id in ('stage1', 'stage2', 'stage3', 'stage4')),
  memory_key      text not null
                    constraint story_memories_key_valid check (memory_key ~ '^[a-z0-9][a-z0-9._-]{0,47}$'),
  content         jsonb not null
                    constraint story_memories_content_size check (pg_column_size(content) <= 40000),
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint story_memories_unique_key unique (relationship_id, stage_id, memory_key)
);

drop trigger if exists story_memories_01_immutable on public.story_memories;
create trigger story_memories_01_immutable
  before update on public.story_memories
  for each row execute function public.guard_immutable_columns('id', 'relationship_id', 'stage_id', 'memory_key', 'created_by', 'created_at');

drop trigger if exists story_memories_02_touch on public.story_memories;
create trigger story_memories_02_touch
  before update on public.story_memories
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------- questions
-- Global, read-only game content. Rows are written ONLY by the generated seed
-- migration (scripts/generate-question-seed.mjs) running as the table owner.
create table if not exists public.questions (
  id            uuid primary key default gen_random_uuid(),
  question_key  text not null constraint questions_key_unique unique
                  constraint questions_key_valid check (question_key ~ '^[a-z0-9][a-z0-9._-]{0,47}$'),
  category      text not null,
  question_text text not null,
  response_type text not null
                  constraint questions_type_valid check (response_type in ('short', 'long', 'choice')),
  options       jsonb
                  constraint questions_options_array check (options is null or jsonb_typeof(options) = 'array'),
  stage_id      text,
  sort_order    integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- --------------------------------------------------------------------- answers
create table if not exists public.answers (
  id              uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  question_id     uuid not null references public.questions (id) on delete cascade,
  author_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  answer_text     text,
  answer_choice   text constraint answers_choice_len check (answer_choice is null or char_length(answer_choice) <= 120),
  visibility      text not null default 'private'
                    constraint answers_visibility_valid check (visibility in ('private', 'shared')),
  status          text not null default 'draft'
                    constraint answers_status_valid check (status in ('draft', 'submitted')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- one current answer per author per question per relationship
  constraint answers_one_per_author unique (relationship_id, question_id, author_id)
);
create index if not exists answers_relationship_author_idx on public.answers (relationship_id, author_id);
create index if not exists answers_question_idx on public.answers (question_id);

-- Content rules enforced by the database (the client validates the same limits for a
-- friendlier UX, but the database never trusts the client).
create or replace function public.validate_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  q   public.questions%rowtype;
  txt text;
begin
  select * into q from public.questions where id = new.question_id;
  if not found or (tg_op = 'INSERT' and not q.active) then
    raise exception 'question_not_seeded' using errcode = '23503';
  end if;

  txt := nullif(btrim(coalesce(new.answer_text, '')), '');
  new.answer_text := txt;

  if q.response_type = 'short' then
    if char_length(coalesce(txt, '')) > 160 or coalesce(txt, '') ~ E'[\\n\\r]' then
      raise exception 'invalid_answer: short answers are one line, 160 characters at most' using errcode = '22023';
    end if;
  elsif q.response_type = 'long' then
    if char_length(coalesce(txt, '')) > 1500 then
      raise exception 'invalid_answer: long answers are 1500 characters at most' using errcode = '22023';
    end if;
  else
    if char_length(coalesce(txt, '')) > 400 then
      raise exception 'invalid_answer: notes are 400 characters at most' using errcode = '22023';
    end if;
    if new.answer_choice is not null and not (coalesce(q.options, '[]'::jsonb) @> to_jsonb(new.answer_choice)) then
      raise exception 'invalid_answer: that option does not exist for this question' using errcode = '22023';
    end if;
  end if;

  -- "Shared" only makes sense inside a space of two. Enforced here, not just in the UI.
  if new.visibility = 'shared' and (
       select count(*) from public.relationship_members m where m.relationship_id = new.relationship_id
     ) < 2 then
    raise exception 'not_paired: sharing needs a partner' using errcode = '22023';
  end if;

  if new.status = 'submitted' then
    if q.response_type = 'choice' then
      if new.answer_choice is null then
        raise exception 'invalid_answer: pick an option before submitting' using errcode = '22023';
      end if;
    elsif txt is null then
      raise exception 'invalid_answer: write something before submitting' using errcode = '22023';
    end if;
  end if;

  if q.response_type <> 'choice' then
    new.answer_choice := null;
  end if;
  return new;
end
$$;

drop trigger if exists answers_01_guard on public.answers;
create trigger answers_01_guard
  before update on public.answers
  for each row execute function public.guard_immutable_columns('id', 'relationship_id', 'question_id', 'author_id', 'created_at');

drop trigger if exists answers_02_validate on public.answers;
create trigger answers_02_validate
  before insert or update on public.answers
  for each row execute function public.validate_answer();

drop trigger if exists answers_03_touch on public.answers;
create trigger answers_03_touch
  before update on public.answers
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------- answer_signals
-- Why this table exists: Supabase Realtime cannot tell a partner that an answer they
-- could previously see has just become private or been deleted (the new row is not
-- visible to them, and DELETE events cannot be filtered or RLS-checked). So every
-- change that touches the *shared* view writes one content-free signal row that
-- members can subscribe to; the client then refetches. A signal carries only ids and a
-- kind, NEVER answer text, and none is written for private/draft-only changes, so it
-- reveals nothing the partner had not already been allowed to see.
-- No foreign keys on purpose: signals are ephemeral and must survive cascades.
create table if not exists public.answer_signals (
  id              bigint generated always as identity primary key,
  relationship_id uuid not null,
  question_id     uuid not null,
  author_id       uuid not null,
  kind            text not null constraint answer_signals_kind_valid check (kind in ('shared', 'unshared')),
  created_at      timestamptz not null default now()
);
create index if not exists answer_signals_relationship_idx on public.answer_signals (relationship_id, id desc);

create or replace function public.emit_answer_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_shared boolean := false;
  is_shared  boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    was_shared := old.visibility = 'shared' and old.status = 'submitted';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    is_shared := new.visibility = 'shared' and new.status = 'submitted';
  end if;

  if tg_op = 'DELETE' then
    if was_shared then
      insert into public.answer_signals (relationship_id, question_id, author_id, kind)
      values (old.relationship_id, old.question_id, old.author_id, 'unshared');
    end if;
  elsif tg_op = 'UPDATE' and old.relationship_id is distinct from new.relationship_id then
    -- moved to another space: the old space must stop showing it
    if was_shared then
      insert into public.answer_signals (relationship_id, question_id, author_id, kind)
      values (old.relationship_id, old.question_id, old.author_id, 'unshared');
    end if;
    if is_shared then
      insert into public.answer_signals (relationship_id, question_id, author_id, kind)
      values (new.relationship_id, new.question_id, new.author_id, 'shared');
    end if;
  elsif was_shared or is_shared then
    insert into public.answer_signals (relationship_id, question_id, author_id, kind)
    values (new.relationship_id, new.question_id, new.author_id, case when is_shared then 'shared' else 'unshared' end);
  end if;

  delete from public.answer_signals where created_at < now() - interval '2 days';
  return null;
end
$$;

drop trigger if exists answers_04_signal on public.answers;
create trigger answers_04_signal
  after insert or update or delete on public.answers
  for each row execute function public.emit_answer_signal();
