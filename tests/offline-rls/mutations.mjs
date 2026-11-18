// Each entry deliberately weakens ONE privacy rule after the real migrations have run.
// `catches` is the start of the check in scripts/verify-rls.mjs that must report FAIL because of it.
export const MUTATIONS = {
  leak_select: { catches: "B cannot read A's PRIVATE submitted answer", sql: `create policy leak on public.answers for select to authenticated using (true);` },
  shared_drafts_visible: { catches: "B cannot read A's SHARED DRAFT", sql: `drop policy answers_select on public.answers; create policy answers_select on public.answers for select to authenticated using (author_id = auth.uid() or visibility = 'shared');` },
  leak_update: { catches: "B cannot change A's answers", sql: `grant update on public.answers to authenticated; create policy leak on public.answers for update to authenticated using (true);` },
  leak_delete: { catches: "B cannot delete A's answers", sql: `create policy leak on public.answers for delete to authenticated using (true);` },
  forge_insert: { catches: "B cannot write an answer in A's name", sql: `drop policy answers_insert_self on public.answers; create policy answers_insert_self on public.answers for insert to authenticated with check (true);` },
  anon_read: { catches: 'a visitor with no sign-in cannot read answers', sql: `grant select on public.answers to anon; create policy leak on public.answers for select to anon using (true);` },
  anon_questions: { catches: 'a visitor with no sign-in cannot read the question list', sql: `grant select on public.questions to anon; create policy leak on public.questions for select to anon using (true);` },
  questions_writable: { catches: 'B cannot add questions', sql: `grant insert on public.questions to authenticated; create policy leak on public.questions for insert to authenticated with check (true);` },
  invites_open: { catches: 'B cannot read the invitations table', sql: `grant select on public.invitations to authenticated; alter table public.invitations disable row level security;` },
  attempts_open: { catches: 'B cannot read the failed-attempts log', sql: `grant select on public.invitation_attempts to authenticated; alter table public.invitation_attempts disable row level security;` },
  members_open: { catches: "B cannot add itself to A's space", sql: `grant insert on public.relationship_members to authenticated; alter table public.relationship_members disable row level security;` },
  relationships_open: { catches: 'B cannot edit the relationship row', sql: `grant update on public.relationships to authenticated; alter table public.relationships disable row level security;` },
  profiles_open: { catches: "B cannot read A's profile row", sql: `create policy leak on public.profiles for select to authenticated using (true);` },
  signal_leak: { catches: 'B gets a content-free signal for the shared answer only', sql: `create or replace function public.emit_answer_signal() returns trigger language plpgsql security definer set search_path = '' as $$ begin if tg_op in ('INSERT','UPDATE') then insert into public.answer_signals (relationship_id, question_id, author_id, kind) values (new.relationship_id, new.question_id, new.author_id, 'shared'); end if; return null; end $$;` },
  signals_open: { catches: 'after leaving, A cannot read the old space', sql: `create policy leak on public.answer_signals for select to authenticated using (true);` },
};
