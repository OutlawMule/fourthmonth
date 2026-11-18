-- =============================================================================
-- MULE × PRINCESS — migration 4 of 6: Realtime
-- =============================================================================
-- Supabase Realtime streams row changes to subscribed browsers, filtered by Row Level
-- Security as the subscriber. Two tables are published, and neither carries any answer text:
--   * answer_signals       "an answer in your space was shared / unshared / removed" (ids only).
--     The game refetches the shared answers when one arrives. A signal is only written when
--     the *shared* view changes, so private answers and drafts produce no signal at all.
--   * relationship_members "someone joined or left your space" (ids only), so the person who
--     created an invitation sees their partner arrive without reloading.
-- The answers table itself is deliberately NOT published: Realtime cannot tell a partner that
-- an answer they could see has just become private, and DELETE events cannot be filtered by RLS.
--
-- If Realtime is off or the socket drops, the game falls back to refetching on a timer, when the
-- tab regains focus and when the browser comes back online.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'answer_signals') then
      alter publication supabase_realtime add table public.answer_signals;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'relationship_members') then
      alter publication supabase_realtime add table public.relationship_members;
    end if;
  else
    raise notice 'Publication supabase_realtime not found: Realtime is not enabled on this database. The game will poll instead.';
  end if;
end
$$;
