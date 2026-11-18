-- =============================================================================
-- MULE × PRINCESS — migration 6 of 6: question seed (GENERATED — do not edit by hand)
-- =============================================================================
-- Source of truth: src/data/questions.js
-- Regenerate with: node scripts/generate-question-seed.mjs
-- Safe to run repeatedly: rows are updated in place, and questions removed from the game
-- are switched off (never deleted, so answers that point at them are kept).
-- =============================================================================

insert into public.questions (question_key, category, question_text, response_type, options, stage_id, sort_order, active)
values
  ('loved.small', 'loved', 'What is something small that makes you feel loved?', 'long', null, 'stage4', 10, true),
  ('loved.show', 'loved', 'How do you most like affection to be shown?', 'choice', '["Kind words","Quality time","Small gifts","Helping out","Touch","Something else"]'::jsonb, 'stage4', 20, true),
  ('act.more', 'activities', 'What''s one thing you wish we did together more often?', 'short', null, 'stage4', 30, true),
  ('act.fav', 'activities', 'What''s your favorite thing to do together?', 'short', null, 'stage4', 40, true),
  ('exp.try', 'experiences', 'What''s something new you want us to try together?', 'short', null, 'stage4', 50, true),
  ('exp.place', 'experiences', 'Where would you like us to go someday?', 'short', null, 'stage4', 60, true),
  ('comm.style', 'communication', 'When something''s on your mind, how do you prefer to talk about it?', 'choice', '["A call","Text","In person","Voice notes","Writing it out first","It depends"]'::jsonb, 'stage4', 70, true),
  ('comm.busy', 'communication', 'On busy days, what kind of check-in feels good to you?', 'long', null, 'stage4', 80, true),
  ('upset.need', 'upset', 'When you''re upset, do you prefer comfort, space, or a conversation?', 'choice', '["Comfort","Space","A conversation","It depends"]'::jsonb, 'stage4', 90, true),
  ('upset.help', 'upset', 'What helps most on a hard day?', 'long', null, 'stage4', 100, true),
  ('mem.keep', 'memories', 'What''s a memory of us you never want to forget?', 'long', null, 'stage4', 110, true),
  ('mem.laugh', 'memories', 'What is a moment that made you laugh the hardest?', 'short', null, 'stage4', 120, true),
  ('learn.me', 'learning', 'What''s something about me you are still learning?', 'long', null, 'stage4', 130, true),
  ('learn.like', 'learning', 'What is something you really like that I might not know yet?', 'short', null, 'stage4', 140, true),
  ('learn.dislike', 'learning', 'What is something you dislike that I should know about?', 'short', null, 'stage4', 150, true),
  ('hope.next', 'hopes', 'What do you want our next chapter to look like?', 'long', null, 'stage4', 160, true),
  ('hope.keep', 'hopes', 'What do you want us to keep doing, no matter how busy life gets?', 'short', null, 'stage4', 170, true),
  ('log.remember', 'log', 'What do you remember most about this day?', 'long', null, 'stage2', 180, true),
  ('log.mind', 'log', 'What was going through your mind?', 'long', null, 'stage2', 190, true),
  ('log.close', 'log', 'What made you feel close to me?', 'long', null, 'stage2', 200, true),
  ('log.time', 'log', 'What do you wish we had more time for?', 'long', null, 'stage2', 210, true),
  ('night.wait', 'midnight', 'What is the best part of waiting to see me?', 'short', null, 'stage3', 220, true),
  ('night.quiet', 'midnight', 'What do you like most about a quiet late night together?', 'short', null, 'stage3', 230, true),
  ('night.rain', 'midnight', 'What do you like about rain at night?', 'short', null, 'stage3', 240, true),
  ('night.fog', 'midnight', 'What does a foggy night make you think of?', 'short', null, 'stage3', 250, true)
on conflict (question_key) do update set
  category      = excluded.category,
  question_text = excluded.question_text,
  response_type = excluded.response_type,
  options       = excluded.options,
  stage_id      = excluded.stage_id,
  sort_order    = excluded.sort_order,
  active        = true;

update public.questions set active = false where question_key not in ('loved.small', 'loved.show', 'act.more', 'act.fav', 'exp.try', 'exp.place', 'comm.style', 'comm.busy', 'upset.need', 'upset.help', 'mem.keep', 'mem.laugh', 'learn.me', 'learn.like', 'learn.dislike', 'hope.next', 'hope.keep', 'log.remember', 'log.mind', 'log.close', 'log.time', 'night.wait', 'night.quiet', 'night.rain', 'night.fog') and active;
