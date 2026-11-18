// Story copy that is NOT the canonical letter: journal entries, dialogue captions,
// credits and the closing messages. Edit freely - nothing here is engine logic.
//
// Rules this file follows (and a test checks the letter excerpts):
//   * Quotes from the letter are verbatim substrings of src/data/letter.js.
//   * Nothing is invented as a real event or as something a real person said.
//   * Sample answers are always labelled "(fictional)".

// ---------------------------------------------------------------- Stage 01 cinematic
// Each beat is shown as a speech/thought bubble. `quote` beats are verbatim letter text.
export const MEETING_BEATS = Object.freeze([
  { id: 'notice', who: 'mule', kind: 'thought', quote: 'when i saw you, i froze', caption: 'Mule notices Princess across the track.' },
  { id: 'freeze', who: 'mule', kind: 'thought', quote: "i didn't know to do, if i should reach out", caption: 'He freezes.' },
  { id: 'nervous', who: 'mule', kind: 'thought', quote: 'it had been a while since i was afraid of talking someone', caption: 'His nervous internal monologue.' },
  { id: 'rush', who: 'princess', kind: 'action', quote: 'then i saw you rush to me', caption: 'Princess rushes toward him.' },
  { id: 'real', who: 'mule', kind: 'thought', quote: "'she is actually real.'", caption: 'Their first physical interaction.' },
  { id: 'hold', who: 'princess', kind: 'action', quote: 'and you let me hold you', caption: 'She lets him hold her.' },
  { id: 'thumb', who: 'mule', kind: 'thought', quote: 'me giving you back my thumb when you let go of it', caption: 'The thumb.' },
  { id: 'home', who: 'princess', kind: 'action', quote: 'you had to go home a too early', caption: 'Their early goodbye.' },
]);

// ---------------------------------------------------------------- journal
// One entry unlocks per stage. {answer} is replaced with the player's own words when
// they wrote one at the log; otherwise the neutral line is used.
export const JOURNAL = Object.freeze({
  stage1: {
    title: '5 July - the drag races',
    body: 'The first time two worlds actually collided. The full letter is saved in the archive exactly as it was written.',
  },
  stage2: {
    title: 'The log',
    body: 'A quiet place in the middle of a loud city. Time together, and time that had to be made.',
    withAnswer: 'A quiet place in the middle of a loud city. You wrote: "{answer}"',
  },
  stage3: {
    title: 'After everyone else is asleep',
    body: 'Waiting for the house to go quiet, then headlights in the driveway. Making time, even late at night.',
  },
  stage4: {
    title: 'Learning your world',
    body: 'Not finishing a story, but learning how to read each other: what feels like love, what helps on a hard day, what comes next.',
  },
});

// ---------------------------------------------------------------- dialogue lines
export const DIALOGUE = Object.freeze({
  fragmentFound: 'Memory fragment found',
  checkpoint: 'Checkpoint saved',
  letterLocked: 'The meeting point is still locked.',
  skipHint: 'Seen before - press Skip to jump ahead.',
  logIntro: 'The log. Some places just feel familiar.',
  logPrompts: 'Pick a prompt. You can answer it, skip it, or just sit for a while.',
  midnightArrive: 'Headlights sweep across the street. The car slows into the driveway.',
  midnightApproach: 'She walks out to meet him.',
  midnightPrompts: 'Pick something to talk about, or just enjoy the quiet.',
  roofIntro: 'Up here the whole city is a quiet hum. Find the objects that hold a question.',
});

// Stage 03: the short exchange after the car stops. "me" is the character the player
// controls, "other" is the one who arrives. Placeholder lines for the scene - none of this is
// presented as something that was actually said. Edit freely.
export const MIDNIGHT_LINES = Object.freeze([
  { who: 'other', text: "Hey. I wasn't sure you'd really be out here." },
  { who: 'me', text: "Everyone's asleep. It's just us for a bit." },
  { who: 'other', text: 'Then we should make it count.' },
]);

// ---------------------------------------------------------------- endings
// Editable by the owner. Cloud override: story_memories (stage_id 'stage4',
// memory_key 'closing-message'); see src/services/closingService.js.
export const ENDINGS = Object.freeze({
  standard: {
    title: 'A little world built for two',
    lines: [
      'Two different worlds collided. Now they are learning how to build one together.',
      'Learning someone is not a level you finish. It is a habit: asking, listening, and choosing to show up again.',
      'No game can solve what is real. But it can remind you what is worth showing up for.',
      'Mule and Princess - keep asking. Keep answering. Keep making time.',
    ],
  },
  extended: {
    title: 'Every memory, and the dawn after',
    lines: [
      'You found every fragment and answered every question you chose to answer.',
      'That is not a perfect story. It is something better: two people paying attention.',
      'There will be hard days. There will be busy weeks and late nights and misunderstandings. What matters is communicating, and choosing each other on purpose.',
      'Here is to the next chapter - written together, one honest answer at a time.',
    ],
  },
  extendedHint: 'Collect every optional fragment and answer every rooftop question to unlock the extended ending.',
});

export const ACHIEVEMENTS = Object.freeze([
  { key: 'letter', title: 'First letter', desc: 'Read the first-meeting letter.' },
  { key: 'fighter', title: 'Lightwork cleared', desc: 'Defeat every Lightwork in Stage 01.' },
  { key: 'tricks', title: 'Board artist', desc: 'Land a 5x trick combo as Mule.' },
  { key: 'log', title: 'Quiet moment', desc: 'Sit at the log and open a prompt.' },
  { key: 'midnight', title: 'Headlights', desc: 'Watch the car arrive at midnight.' },
  { key: 'collector', title: 'Every fragment', desc: 'Collect every optional fragment.' },
  { key: 'curious', title: 'Learning your world', desc: 'Open all eight rooftop memory objects.' },
  { key: 'answers', title: 'Open book', desc: 'Answer every rooftop question.' },
  { key: 'extended', title: 'Extended ending', desc: 'Unlock the extended ending.' },
]);

export const CREDITS = Object.freeze({
  studio: 'BLAQ STUDIO',
  lines: [
    ['Game', 'MULE × PRINCESS'],
    ['Created by', 'BLAQ STUDIO'],
    ['Engine', 'Phaser 3'],
    ['Backend', 'Supabase'],
    ['Hosting', 'Vercel'],
    ['Art', 'Original procedural pixel art, generated in code'],
    ['Audio', 'Original procedural audio, generated in code'],
  ],
  closing: 'Technology becoming something personal.',
});
