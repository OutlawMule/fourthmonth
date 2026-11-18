// Questionnaire content. Entirely data-driven: add, remove or edit entries here and
// the game, the questionnaire UI and the database seed follow.
//
//   After editing run:   node scripts/generate-question-seed.mjs
//   then run the newly generated supabase/migrations/*_seed_questions.sql in the
//   Supabase SQL editor so the questions exist in the database (answers reference them).
//
// responseType: 'short' (one line) | 'long' (paragraph) | 'choice' (pick one, optional note)

export const CATEGORIES = Object.freeze([
  { key: 'loved', order: 1, title: 'Feeling loved', blurb: 'Little things that make each of us feel loved.', object: 'affection', icon: 'heart' },
  { key: 'activities', order: 2, title: 'Together time', blurb: 'Favorite things to do together.', object: 'activities', icon: 'controller' },
  { key: 'experiences', order: 3, title: 'Things to try', blurb: 'Things each of us wants to experience.', object: 'experiences', icon: 'compass' },
  { key: 'communication', order: 4, title: 'How we talk', blurb: 'Preferred communication styles.', object: 'communication', icon: 'signal' },
  { key: 'upset', order: 5, title: 'When it gets hard', blurb: 'What each of us needs when upset.', object: 'comfort', icon: 'hoodie' },
  { key: 'memories', order: 6, title: 'Memories', blurb: 'Memories we never want to lose.', object: 'memories', icon: 'frame' },
  { key: 'learning', order: 7, title: 'Still learning', blurb: 'Things we are still learning about each other (likes, dislikes, habits).', object: 'learning', icon: 'eye' },
  { key: 'hopes', order: 8, title: 'Next chapter', blurb: 'Hopes for the next chapter.', object: 'hopes', icon: 'sunrise' },
  // Not part of the rooftop stage: prompts offered at the log (Stage 02) and at midnight (Stage 03).
  { key: 'log', order: 90, title: 'At the log', blurb: 'Optional prompts for the quiet park.', object: null, icon: 'log' },
  { key: 'midnight', order: 91, title: 'After midnight', blurb: 'Optional prompts for the late-night meetup.', object: null, icon: 'moon' },
]);

export const QUESTIONS = Object.freeze([
  // 1 — little things that make each person feel loved
  { key: 'loved.small', category: 'loved', stage: 'stage4', type: 'long', text: 'What is something small that makes you feel loved?' },
  { key: 'loved.show', category: 'loved', stage: 'stage4', type: 'choice', text: 'How do you most like affection to be shown?', options: ['Kind words', 'Quality time', 'Small gifts', 'Helping out', 'Touch', 'Something else'] },
  // 2 — favorite activities
  { key: 'act.more', category: 'activities', stage: 'stage4', type: 'short', text: "What's one thing you wish we did together more often?" },
  { key: 'act.fav', category: 'activities', stage: 'stage4', type: 'short', text: "What's your favorite thing to do together?" },
  // 3 — things each person wants to experience
  { key: 'exp.try', category: 'experiences', stage: 'stage4', type: 'short', text: "What's something new you want us to try together?" },
  { key: 'exp.place', category: 'experiences', stage: 'stage4', type: 'short', text: 'Where would you like us to go someday?' },
  // 4 — preferred communication styles
  { key: 'comm.style', category: 'communication', stage: 'stage4', type: 'choice', text: "When something's on your mind, how do you prefer to talk about it?", options: ['A call', 'Text', 'In person', 'Voice notes', 'Writing it out first', 'It depends'] },
  { key: 'comm.busy', category: 'communication', stage: 'stage4', type: 'long', text: 'On busy days, what kind of check-in feels good to you?' },
  // 5 — what each person needs when upset
  { key: 'upset.need', category: 'upset', stage: 'stage4', type: 'choice', text: "When you're upset, do you prefer comfort, space, or a conversation?", options: ['Comfort', 'Space', 'A conversation', 'It depends'] },
  { key: 'upset.help', category: 'upset', stage: 'stage4', type: 'long', text: 'What helps most on a hard day?' },
  // 6 — important memories
  { key: 'mem.keep', category: 'memories', stage: 'stage4', type: 'long', text: "What's a memory of us you never want to forget?" },
  { key: 'mem.laugh', category: 'memories', stage: 'stage4', type: 'short', text: 'What is a moment that made you laugh the hardest?' },
  // 7 — things they are still learning about one another
  { key: 'learn.me', category: 'learning', stage: 'stage4', type: 'long', text: "What's something about me you are still learning?" },
  { key: 'learn.like', category: 'learning', stage: 'stage4', type: 'short', text: 'What is something you really like that I might not know yet?' },
  { key: 'learn.dislike', category: 'learning', stage: 'stage4', type: 'short', text: 'What is something you dislike that I should know about?' },
  // 8 — hopes for the next chapter
  { key: 'hope.next', category: 'hopes', stage: 'stage4', type: 'long', text: 'What do you want our next chapter to look like?' },
  { key: 'hope.keep', category: 'hopes', stage: 'stage4', type: 'short', text: 'What do you want us to keep doing, no matter how busy life gets?' },

  // Stage 02 — prompts picked at the log (also the conversation fragments)
  { key: 'log.remember', category: 'log', stage: 'stage2', type: 'long', text: 'What do you remember most about this day?', sample: 'Sample (fictional): "The quiet. I remember how the whole city got softer."' },
  { key: 'log.mind', category: 'log', stage: 'stage2', type: 'long', text: 'What was going through your mind?', sample: 'Sample (fictional): "That I wanted this moment to last a little longer."' },
  { key: 'log.close', category: 'log', stage: 'stage2', type: 'long', text: 'What made you feel close to me?', sample: 'Sample (fictional): "Not needing to fill the silence."' },
  { key: 'log.time', category: 'log', stage: 'stage2', type: 'long', text: 'What do you wish we had more time for?', sample: 'Sample (fictional): "Slow evenings with nowhere to be."' },

  // Stage 03 — optional midnight prompts
  { key: 'night.wait', category: 'midnight', stage: 'stage3', type: 'short', text: 'What is the best part of waiting to see me?', sample: 'Sample (fictional): "Counting down the minutes."' },
  { key: 'night.quiet', category: 'midnight', stage: 'stage3', type: 'short', text: 'What do you like most about a quiet late night together?', sample: 'Sample (fictional): "Everything feels private."' },
  { key: 'night.rain', category: 'midnight', stage: 'stage3', type: 'short', text: 'What do you like about rain at night?', sample: 'Sample (fictional): "The sound makes everything feel closer."' },
  { key: 'night.fog', category: 'midnight', stage: 'stage3', type: 'short', text: 'What does a foggy night make you think of?', sample: 'Sample (fictional): "A quiet city that is ours for a while."' },
]);

export const MAX_SHORT = 160;
export const MAX_LONG = 1500;

export function getQuestion(key) {
  return QUESTIONS.find((q) => q.key === key) ?? null;
}
export function questionsInCategory(cat) {
  return QUESTIONS.filter((q) => q.category === cat);
}
export function questionsForStage(stageId) {
  return QUESTIONS.filter((q) => q.stage === stageId);
}
export function getCategory(key) {
  return CATEGORIES.find((c) => c.key === key) ?? null;
}
export function maxLengthFor(q) {
  return q?.type === 'short' ? MAX_SHORT : MAX_LONG;
}
/** Questions that every stage-4 "extended ending" run must have answered. */
export function extendedEndingQuestionKeys() {
  return questionsForStage('stage4').map((q) => q.key);
}
export function rooftopObjects() {
  return CATEGORIES.filter((c) => c.object).sort((a, b) => a.order - b.order);
}
