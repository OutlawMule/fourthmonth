// The ending: a final archive of everything collected, then the closing message.
// The closing message is editable. Its default text is in src/data/memories.js (ENDINGS);
// an edited copy is saved on this device and, if signed in, to the account (see
// services/closingService.js). The message never claims the relationship is perfect or that a
// game can solve real problems; it is about learning, communicating and showing up.
import { h } from './dom.js';
import { fragmentsView } from './archive.js';
import { STAGE_ORDER, STAGES } from '../data/stages.js';
import { ENDINGS } from '../data/memories.js';
import { extendedEndingQuestionKeys, getQuestion } from '../data/questions.js';
import { CLOSING_LIMITS, linesToText, textToLines } from '../utils/closing.js';

const WHERE_SAVED = { device: 'on this device', account: 'to your account', shared: 'to your account, where your partner can read it' };

export function createEnding(app) {
  const modal = () => app.ui.modal;

  // ------------------------------------------------------------------ final archive
  function archiveBody() {
    const pm = app.progress;
    const st = pm.state;
    const frags = STAGE_ORDER.flatMap((id) => STAGES[id].fragments.map((f) => ({ id, f })));
    const haveFrags = frags.filter(({ id, f }) => pm.has(id, f.key)).length;
    const qKeys = extendedEndingQuestionKeys();
    const qDone = qKeys.filter((k) => st.answered.includes(k)).length;
    const paired = app.relationship?.state?.status === 'active';
    const letterUnlocked = st.journal.includes('stage1') || pm.hasSeen('letter');

    return h('div', { class: 'stack' },
      h('p', { text: 'Everything you gathered along the way is kept here.' }),
      h('div', { class: 'row' },
        h('span', { class: 'tag', text: `${haveFrags}/${frags.length} memory fragments` }),
        h('span', { class: 'tag pink', text: `${qDone}/${qKeys.length} rooftop questions answered` }),
        h('span', { class: 'tag blue', text: `${st.journal.length}/${STAGE_ORDER.length} journal entries` })),
      fragmentsView(app),
      h('div', { class: 'row' },
        letterUnlocked ? h('button', { class: 'btn', type: 'button', text: 'Read the letter again', onClick: () => app.ui.readLetter({ continueLabel: 'Back to the archive' }) }) : null,
        h('button', { class: 'btn', type: 'button', text: 'Journal and achievements', onClick: () => app.ui.openArchive('journal') }),
        paired ? h('button', { class: 'btn', type: 'button', text: 'Shared answers', onClick: () => app.ui.openSharedView?.() }) : null),
      h('p', { class: 'muted small', text: 'Your answers are never shown here unless you chose to share them with your partner.' }));
  }

  function showFinalArchive() {
    app.audio?.sfx('unlock');
    return modal().open({
      title: 'Final archive', wide: true, body: archiveBody(),
      actions: [{ label: 'Continue', kind: 'primary', value: 'continue', autofocus: true }],
    }).result;
  }

  // ------------------------------------------------------------------ closing message
  function extendedHint(status) {
    const missingF = status?.missingFragments ?? [];
    const missingQ = status?.missingAnswers ?? [];
    const parts = [];
    if (missingF.length) parts.push(`${missingF.length} optional fragment${missingF.length === 1 ? '' : 's'}`);
    if (missingQ.length) parts.push(`${missingQ.length} rooftop question${missingQ.length === 1 ? '' : 's'}`);
    const detail = missingF.slice(0, 5).map((m) => STAGES[m.stageId]?.fragments.find((f) => f.key === m.key)?.label ?? m.key);
    const qDetail = missingQ.slice(0, 3).map((k) => getQuestion(k)?.text).filter(Boolean);
    return h('div', { class: 'msg end-note' },
      h('b', { text: 'There is a longer ending.' }), ' ', ENDINGS.extendedHint,
      parts.length ? h('div', { text: `Still open: ${parts.join(' and ')}.` }) : null,
      detail.length ? h('div', { class: 'muted', text: `Fragments: ${detail.join(' / ')}${missingF.length > detail.length ? ' ...' : ''}` }) : null,
      qDetail.length ? h('div', { class: 'muted', text: `For example: ${qDetail.join(' / ')}` }) : null,
      h('div', { class: 'muted', text: 'Skipping is always okay. The ending you just saw is complete on its own.' }));
  }

  async function showClosing(kind, status) {
    const k = kind === 'extended' ? 'extended' : 'standard';
    let ending = await app.closing.load(k);
    const view = h('div', { class: 'ending' });
    const note = h('div', { class: 'msg', role: 'status', 'aria-live': 'polite', style: { display: 'none' } });
    const say = (cls, text) => { note.className = `msg ${cls}`; note.textContent = text; note.style.display = text ? '' : 'none'; };

    const renderRead = () => {
      view.replaceChildren(
        h('h2', { text: ending.title }),
        h('div', { class: 'end-lines' }, ending.lines.map((l) => h('p', { text: l }))),
        h('div', { class: 'row', style: { justifyContent: 'center' } },
          h('button', { class: 'btn ghost', type: 'button', text: 'Edit this message', onClick: renderEdit })),
        note,
        k === 'standard' ? extendedHint(status) : null);
    };

    const renderEdit = () => {
      const title = h('input', { class: 'field', type: 'text', id: 'end-title', maxlength: CLOSING_LIMITS.title, value: ending.title, autocomplete: 'off' });
      const text = h('textarea', { class: 'field', id: 'end-text', rows: 9, autocomplete: 'off' });
      text.value = linesToText(ending.lines);
      const save = h('button', { class: 'btn primary', type: 'button', text: 'Save message', onClick: async () => {
        save.disabled = true; say('', 'Saving…');
        const res = await app.closing.save(k, { title: title.value, lines: textToLines(text.value) });
        save.disabled = false;
        if (!res.ok) { say('err', res.error); return; }
        ending = app.closing.peek(k);
        renderRead();
        say('ok', `Saved ${WHERE_SAVED[res.where[0]] ?? 'on this device'}.${res.notice ? ` ${res.notice}` : ''}`);
      } });
      const reset = h('button', { class: 'btn ghost', type: 'button', text: 'Restore the original', onClick: async () => {
        const res = await app.closing.reset(k);
        if (!res.ok) { say('err', res.error); return; }
        ending = app.closing.peek(k);
        renderRead();
        say('ok', 'The original message is back.');
      } });
      view.replaceChildren(
        h('h2', { text: 'Edit the message' }),
        h('div', { class: 'stack', style: { textAlign: 'left' } },
          h('label', { for: 'end-title', class: 'muted small', text: 'Title' }), title,
          h('label', { for: 'end-text', class: 'muted small', text: `Message: one paragraph per line, up to ${CLOSING_LIMITS.lines} lines` }), text,
          h('p', { class: 'muted small', text: app.auth?.status?.().signedIn
            ? 'Saved on this device and to your account. If you are paired, your partner can read it too.'
            : 'Saved on this device. Sign in to keep it in your account.' }),
          h('div', { class: 'row' }, save, reset, h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onClick: () => { say('', ''); renderRead(); } })),
          note));
      queueMicrotask(() => title.focus());
    };

    renderRead();
    app.audio?.sfx('ui_ok');
    return modal().open({
      title: 'The end of this chapter', wide: true, closable: false, body: view,
      actions: [{ label: 'Return to menu', kind: 'primary', value: 'menu' }],
    }).result;
  }

  async function showEnding({ kind = 'standard', status = null } = {}) {
    await showFinalArchive();
    await showClosing(kind, status);
  }

  return { showEnding, showFinalArchive };
}
