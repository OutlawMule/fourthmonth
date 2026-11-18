-- MULE x PRINCESS: the answers your partner chose to share with you. Read-only.
--
-- Supabase dashboard -> SQL Editor -> New query -> paste this -> Run.
--
-- It lists only answers that were SUBMITTED and marked "Share with my partner" (from both of you).
-- Drafts, answers kept only on a device, and answers saved as "Private" are not included.
--
-- Note: as the person who runs the project you can technically read every table in the Table Editor,
-- including answers saved as "Private". The game says so next to the Private option. This query is
-- limited to what was shared on purpose.
select
  p.display_name       as who,
  p.selected_character as character,
  q.category,
  q.question_text      as question,
  a.answer_choice      as chosen_option,
  a.answer_text        as written_answer,
  a.updated_at         as last_changed
from public.answers a
join public.questions q on q.id = a.question_id
left join public.profiles p on p.id = a.author_id
where a.visibility = 'shared'
  and a.status = 'submitted'
order by q.category, q.sort_order, p.display_name;
