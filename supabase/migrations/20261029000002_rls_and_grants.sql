-- =============================================================================
-- MULE × PRINCESS — migration 2 of 6: Row Level Security and grants
-- =============================================================================
-- Threat model in one paragraph: the browser holds only the publishable (anon) key, so
-- every request runs as the Postgres role `anon` or `authenticated` and is limited by
-- the privileges and policies in this file. A signed-in user must never be able to
--   * read another person's private answers or drafts,
--   * write or change another person's rows,
--   * join a relationship space without a valid single-use invitation,
--   * read or guess invitation codes (only SHA-256 hashes exist, and clients cannot read them),
--   * grow a relationship beyond two people, or promote themselves to anything.
-- There is no "admin" concept in this schema, so there is nothing to promote to.
--
-- Two layers are used on purpose: (1) GRANTs say which operations a role may even try,
-- (2) policies say which rows. Anything not granted here is denied.
-- =============================================================================

-- ------------------------------------------------------------ membership helpers
-- SECURITY DEFINER so policies can ask "is this user in that space?" without the policy on
-- relationship_members calling itself (infinite recursion). They return a boolean only.
create or replace function public.is_relationship_member(p_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.relationship_members m
    where m.relationship_id = p_relationship_id
      and m.user_id = (select auth.uid())
  )
$$;

-- Is this (relationship, user) pair a real membership? Used so a shared answer is only visible
-- while its author still belongs to the space it was written in.
-- It only ever answers "yes" to someone who is a member of that space themselves, so it cannot
-- be used from the browser to probe whether some other user belongs to some other space.
create or replace function public.has_member(p_relationship_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.relationship_members m
    where m.relationship_id = p_relationship_id and m.user_id = p_user_id
  )
  and exists (
    select 1 from public.relationship_members me
    where me.relationship_id = p_relationship_id and me.user_id = (select auth.uid())
  )
$$;

-- ------------------------------------------------------------------- start clean
-- Supabase gives new objects broad default privileges. Remove everything for the two
-- client roles first, then grant back exactly what the game needs.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Functions: nothing is callable by default. Only the ones listed below are granted.
revoke all on function public.is_relationship_member(uuid)  from public, anon, authenticated;
revoke all on function public.has_member(uuid, uuid)        from public, anon, authenticated;
revoke all on function public.touch_updated_at()            from public, anon, authenticated;
revoke all on function public.guard_immutable_columns()     from public, anon, authenticated;
revoke all on function public.handle_new_user()             from public, anon, authenticated;
revoke all on function public.enforce_member_limit()        from public, anon, authenticated;
revoke all on function public.after_member_removed()        from public, anon, authenticated;
revoke all on function public.validate_answer()             from public, anon, authenticated;
revoke all on function public.emit_answer_signal()          from public, anon, authenticated;

grant execute on function public.is_relationship_member(uuid) to authenticated;
grant execute on function public.has_member(uuid, uuid)       to authenticated;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------- profiles
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Only these two columns can ever be changed by the player (id / created_at are also
-- protected by a trigger). A partner's name and character reach you through
-- get_my_relationship(), never by reading their profile row.
grant select, insert on public.profiles to authenticated;
grant update (display_name, selected_character) on public.profiles to authenticated;

-- ---------------------------------------------------------------- relationships
-- Read-only for members. Creating a space, joining and leaving all go through the
-- functions in migration 3, so there is no INSERT/UPDATE/DELETE privilege here.
alter table public.relationships enable row level security;

drop policy if exists relationships_select_member on public.relationships;
create policy relationships_select_member on public.relationships
  for select to authenticated using (public.is_relationship_member(id));

grant select on public.relationships to authenticated;

-- --------------------------------------------------------- relationship_members
-- Members can see who is in their own space (opaque user ids). Nobody can insert, update or
-- delete a membership directly, so "add myself to someone else's space" has no path at all.
alter table public.relationship_members enable row level security;

drop policy if exists relationship_members_select_member on public.relationship_members;
create policy relationship_members_select_member on public.relationship_members
  for select to authenticated using (public.is_relationship_member(relationship_id));

grant select on public.relationship_members to authenticated;

-- ---------------------------------------- invitations and invitation_attempts
-- RLS on, no policies, no grants: the browser cannot read, guess-check or write them.
-- Only the SECURITY DEFINER functions in migration 3 touch these tables.
alter table public.invitations         enable row level security;
alter table public.invitation_attempts enable row level security;

-- ---------------------------------------------------------------- game_progress
alter table public.game_progress enable row level security;

drop policy if exists game_progress_select_own on public.game_progress;
create policy game_progress_select_own on public.game_progress
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists game_progress_insert_own on public.game_progress;
create policy game_progress_insert_own on public.game_progress
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (relationship_id is null or public.is_relationship_member(relationship_id))
  );

drop policy if exists game_progress_update_own on public.game_progress;
create policy game_progress_update_own on public.game_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (relationship_id is null or public.is_relationship_member(relationship_id))
  );

grant select, insert, update on public.game_progress to authenticated;

-- -------------------------------------------------------------- story_memories
-- Shared story content (the edited closing message). Both members can read and edit it.
alter table public.story_memories enable row level security;

drop policy if exists story_memories_select_member on public.story_memories;
create policy story_memories_select_member on public.story_memories
  for select to authenticated using (public.is_relationship_member(relationship_id));

drop policy if exists story_memories_insert_member on public.story_memories;
create policy story_memories_insert_member on public.story_memories
  for insert to authenticated
  with check (
    public.is_relationship_member(relationship_id)
    and created_by = (select auth.uid())
  );

drop policy if exists story_memories_update_member on public.story_memories;
create policy story_memories_update_member on public.story_memories
  for update to authenticated
  using (public.is_relationship_member(relationship_id))
  with check (public.is_relationship_member(relationship_id));

drop policy if exists story_memories_delete_member on public.story_memories;
create policy story_memories_delete_member on public.story_memories
  for delete to authenticated using (public.is_relationship_member(relationship_id));

grant select, insert, update, delete on public.story_memories to authenticated;

-- -------------------------------------------------------------------- questions
-- Global game content, readable by any signed-in player, writable by nobody (the seed
-- migration runs as the table owner).
alter table public.questions enable row level security;

drop policy if exists questions_select_all on public.questions;
create policy questions_select_all on public.questions
  for select to authenticated using (true);

grant select on public.questions to authenticated;

-- ---------------------------------------------------------------------- answers
-- The heart of the privacy model:
--   SELECT  your own answers (any visibility, drafts included), plus answers that are
--           shared AND submitted by a partner who is still a member of your space.
--   INSERT  only as yourself, only into a space you belong to.
--   UPDATE  only your own rows, only while you belong to the space.
--   DELETE  only your own rows.
-- A private answer or a draft is therefore never returned to anyone but its author, no matter
-- which filters the client sends.
alter table public.answers enable row level security;

drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or (
      visibility = 'shared'
      and status = 'submitted'
      and public.is_relationship_member(relationship_id)
      and public.has_member(relationship_id, author_id)
    )
  );

drop policy if exists answers_insert_self on public.answers;
create policy answers_insert_self on public.answers
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_relationship_member(relationship_id)
  );

drop policy if exists answers_update_self on public.answers;
create policy answers_update_self on public.answers
  for update to authenticated
  using (author_id = (select auth.uid()) and public.is_relationship_member(relationship_id))
  with check (author_id = (select auth.uid()) and public.is_relationship_member(relationship_id));

drop policy if exists answers_delete_self on public.answers;
create policy answers_delete_self on public.answers
  for delete to authenticated using (author_id = (select auth.uid()));

grant select, insert, update, delete on public.answers to authenticated;

-- -------------------------------------------------------------- answer_signals
-- Content-free "something changed" rows for Realtime (see migration 1 and 4).
alter table public.answer_signals enable row level security;

drop policy if exists answer_signals_select_member on public.answer_signals;
create policy answer_signals_select_member on public.answer_signals
  for select to authenticated using (public.is_relationship_member(relationship_id));

grant select on public.answer_signals to authenticated;
