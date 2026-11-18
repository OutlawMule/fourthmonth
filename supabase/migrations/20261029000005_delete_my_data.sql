-- =============================================================================
-- MULE × PRINCESS — migration 5 of 6: delete_my_data()
-- =============================================================================
-- "Delete my online data" in the Account screen calls this. It removes everything the caller
-- has in the database: their answers, game progress, profile, invitations, story entries they
-- wrote, and their place in the relationship space. The space is deleted if they were the last
-- member; otherwise it goes back to "pending" and the partner keeps all of their own answers
-- (the partner's shared answers are not touched, and the remaining answers become private).
--
-- It does NOT delete the sign-in itself (auth.users). Removing an auth user needs admin rights
-- that the browser must never have; whoever runs the project does that in the Supabase dashboard
-- (Authentication > Users). This is documented in the README and in supabase/SECURITY.md.
-- Answers saved only on a device are not in the database and are not affected.
-- =============================================================================

create or replace function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  delete from public.answers             where author_id = v_uid;
  delete from public.answer_signals      where author_id = v_uid;
  delete from public.story_memories      where created_by = v_uid;
  delete from public.game_progress       where user_id = v_uid;
  delete from public.invitation_attempts where user_id = v_uid;
  delete from public.invitations         where created_by = v_uid or used_by = v_uid;
  -- leaving: an empty space is deleted, a space with a partner returns to 'pending'
  delete from public.relationship_members where user_id = v_uid;
  delete from public.profiles            where id = v_uid;
end
$$;

revoke all on function public.delete_my_data() from public, anon, authenticated;
grant execute on function public.delete_my_data() to authenticated;
