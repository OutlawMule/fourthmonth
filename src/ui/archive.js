// Memory Archive: the letter reader, journal entries, collected fragments, achievements
// and replayable stages. Also the in-game letter scene and the journal pop-up shown when
// a stage completes. The letter text is read from src/data/letter.js (editable source).
import { h } from './dom.js';
import { LETTER, LETTER_SUPPLEMENT } from '../data/letter.js';
import { STAGE_ORDER, STAGES } from '../data/stages.js';
import { JOURNAL, ACHIEVEMENTS } from '../data/memories.js';
import { getAnswerForJournal } from './questionnaire.js';

// The letter is canonical: it is always shown exactly as written in src/data/letter.js.
// (Nothing, online or local, can replace or "correct" it at runtime.)
export const currentLetter = () => LETTER;

function letterBody(letter) {
  return h('div', null,
    h('div', { class: 'letter-date', text: letter.date }),
    h('div', { class: 'letter', tabindex: '0', 'aria-label': letter.title, role: 'document' },
      letter.paragraphs.map((p) => h('p', { text: p }))),
    h('p', { class: 'muted small', text: `${LETTER_SUPPLEMENT.label}: this letter is shown exactly as it was written. ${LETTER_SUPPLEMENT.editHint}` }));
}

/** Collected memory fragments by stage (also used by the ending's final archive). */
export function fragmentsView(app) {
  const pm = app.progress;
  const wrap = h('div', { class: 'stack' });
  for (const id of STAGE_ORDER) {
    const st = STAGES[id];
    if (!st.fragments.length) continue;
    wrap.append(h('h4', { class: 'muted', style: { margin: '0', font: '700 .75em var(--mono)', letterSpacing: '.15em' }, text: `STAGE 0${st.number} · ${st.title}` }));
    wrap.append(h('div', { class: 'frag-list' }, st.fragments.map((f) => {
      const have = pm.has(id, f.key);
      return h('div', { class: `frag ${have ? '' : 'locked'}` },
        h('b', { text: have ? f.label : '???' }),
        have && f.excerpt ? h('q', { text: f.excerpt }) : null,
        h('span', { class: `tag ${f.required ? '' : 'pink'}`, text: f.required ? 'required' : 'bonus' }));
    })));
  }
  return wrap;
}

export function createArchive(app) {
  const modal = app.ui.modal;

  /** The cinematic letter reader used at the end of Stage 01. */
  async function readLetter({ continueLabel = 'Continue' } = {}) {
    app.audio?.sfx('unlock');
    const r = modal.open({
      title: currentLetter().title,
      body: letterBody(currentLetter()),
      wide: true,
      actions: [{ label: continueLabel, kind: 'primary', autofocus: true, value: 'continue' }],
    });
    return r.result;
  }

  async function showJournal(stageId) {
    const entry = JOURNAL[stageId];
    if (!entry) return;
    const answer = stageId === 'stage2' ? getAnswerForJournal() : null;
    const text = answer && entry.withAnswer ? entry.withAnswer.replace('{answer}', answer) : entry.body;
    app.audio?.sfx('ui_ok');
    await modal.open({
      title: 'Journal entry unlocked',
      narrow: true,
      body: h('div', { class: 'journal-entry' }, h('h4', { text: entry.title }), h('p', { text })),
      actions: [{ label: 'Continue', kind: 'primary', autofocus: true }],
    }).result;
  }

  const fragmentsTab = () => fragmentsView(app);

  function journalTab() {
    const pm = app.progress;
    const items = STAGE_ORDER.filter((id) => pm.state.journal.includes(id));
    if (!items.length) return h('p', { class: 'muted', text: 'Journal entries unlock as you finish each stage.' });
    return h('div', null, items.map((id) => {
      const answer = id === 'stage2' ? getAnswerForJournal() : null;
      const e = JOURNAL[id];
      return h('div', { class: 'journal-entry' }, h('h4', { text: e.title }), h('p', { text: answer && e.withAnswer ? e.withAnswer.replace('{answer}', answer) : e.body }));
    }));
  }

  function achievementsTab() {
    const got = new Set(app.progress.state.achievements);
    return h('div', { class: 'achv' }, ACHIEVEMENTS.map((a) => h('div', { class: `a ${got.has(a.key) ? 'on' : ''}` }, h('b', { text: `${got.has(a.key) ? '★' : '☆'} ${a.title}` }), h('div', { class: 'muted small', text: a.desc }))));
  }

  function stagesTab(close) {
    const pm = app.progress;
    return h('div', { class: 'stack' }, STAGE_ORDER.map((id) => {
      const st = STAGES[id];
      const unlocked = pm.state.unlockedStages.includes(id);
      const done = pm.state.completedStages.includes(id);
      return h('div', { class: 'row' },
        h('button', {
          class: 'btn', type: 'button', disabled: !unlocked, style: { flex: '1', justifyContent: 'flex-start' },
          text: `${unlocked ? (done ? '✓' : '▶') : '🔒'}  STAGE 0${st.number} — ${st.title}`,
          onClick: () => { close(); app.startStage(id, { resume: false }); },
        }));
    }));
  }

  function openArchive(initial = 'letter') {
    const pm = app.progress;
    const letterUnlocked = pm.state.journal.includes('stage1') || pm.hasSeen('letter');
    const tabs = [
      ['letter', 'Letter', () => (letterUnlocked ? letterBody(currentLetter()) : h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'The first-meeting letter is still locked.' }), h('p', { text: LETTER_SUPPLEMENT.unlockedHint })))],
      ['fragments', 'Fragments', fragmentsTab],
      ['journal', 'Journal', journalTab],
      ['achievements', 'Achievements', achievementsTab],
      ['stages', 'Replay', () => stagesTab(() => handle.close())],
    ];
    const content = h('div');
    const bar = h('div', { class: 'row', role: 'tablist', style: { marginBottom: '1em' } });
    const show = (key) => {
      content.replaceChildren(tabs.find((t) => t[0] === key)[2]());
      [...bar.children].forEach((b) => b.setAttribute('aria-selected', String(b.dataset.key === key)));
      [...bar.children].forEach((b) => b.classList.toggle('sel', b.dataset.key === key));
    };
    for (const [key, label] of tabs) bar.append(h('button', { class: 'btn ghost', type: 'button', role: 'tab', dataset: { key }, text: label, onClick: () => { app.audio?.sfx('ui_move'); show(key); } }));
    const handle = modal.open({ title: 'Memory archive', wide: true, body: h('div', null, bar, content), actions: [{ label: 'Close', kind: 'primary', value: 'close' }] });
    show(initial);
    return handle.result;
  }

  return { readLetter, showJournal, openArchive };
}
