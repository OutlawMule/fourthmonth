// ============================================================================
// THE FIRST-MEETING LETTER  —  5 July, the drag races
// ----------------------------------------------------------------------------
// This file is the single editable source of the canonical letter.
//   * The text below is preserved exactly as supplied. Spelling, punctuation and
//     grammar are intentionally NOT corrected.
//   * To change the letter, edit the strings in LETTER.paragraphs. Nothing else
//     in the game needs to change.
//   * Anything that is NOT the letter (narration, captions, labels) lives in
//     LETTER_SUPPLEMENT below and is always shown as clearly separate content.
//   * The letter is the same on every device and for every account: it is never read
//     from or overridden by the database, so it cannot be changed by accident.
//   * tests/fixtures/letter.original.txt holds the text as it was first supplied. If you
//     edit the letter ON PURPOSE, update that file too (the test only exists to catch
//     accidental "corrections").
// ============================================================================

export const LETTER = Object.freeze({
  id: 'first-meeting',
  date: '5 July',
  title: 'The first-meeting letter',
  paragraphs: Object.freeze([
    "It was the drag races, i thought you were so cool, when i saw you, i froze and i didn't know to do, if i should reach out or that will svare the shit out of and you'd freak out, i waited for you be chilling, it had been a while since i was afraid of talking someone, i got all the crazy packed up in a bottle, couldn't be nervous.",
    "then i saw you rush to me, and i was like damn, 'she is actually real.' and for the first time our worlds actually colided, one of us was so cool other one was so nervous.",
    "and you let me hold you, even how you dragged me all over the place, me giving you back my thumb when you let go of it, meant never let go of me, I wouldn't even in front of my parents, and you had to go home a too early wven when you were late and you should also look at the case scenarios in your own place, because you panicked a lot about not meeting."
  ]),
});

/** The letter as one string (paragraphs separated by a blank line). */
export function letterText(letter = LETTER) {
  return letter.paragraphs.join('\n\n');
}

/**
 * Clearly separate, non-canonical material. Nothing here is claimed to have been
 * said or to have happened; it is framing for the game UI only.
 */
export const LETTER_SUPPLEMENT = Object.freeze({
  label: 'Game narration — not part of the letter',
  unlockedHint: 'Collect all three fragments, defeat the Lightwork and reach the meeting point to unlock the letter.',
  editHint: 'Edit src/data/letter.js to change this letter.',
});
