// Questionnaire screens: "Learn About Each Other", a category (opened from a rooftop memory
// object), and a single prompt (the log and the midnight talk). Every question is optional.
//
// Privacy rules enforced here (the database enforces them again; see supabase/SECURITY.md):
//  * Each answer has an explicit home: this device only / private in my account / shared.
//  * A draft is never shown to the partner. "Saved" is only ever shown after the answer
//    service reports that the browser or the database confirmed the write.
//  * Answer text is only ever put into the page with textContent. It is never logged and
//    never placed in a URL. Unsaved typing is kept in memory for this tab only.
import { app as game } from '../app.js';
import { h } from './dom.js';
import { CATEGORIES, getCategory, getQuestion, questionsInCategory, maxLengthFor, rooftopObjects } from '../data/questions.js';

const unsaved = new Map();  // question key -> { text, choice, privacy }   (memory only, never stored)
let lastPrivacy = null;

/** The player's own most recent answer to a log prompt, shortened for the Stage 02 journal entry. */
export function getAnswerForJournal() {
  const logKeys = new Set(questionsInCategory('log').map((q) => q.key));
  const mine = (game.answers?.peekAllMine?.() ?? [])
    .filter((a) => logKeys.has(a.questionKey) && a.status === 'submitted' && a.text)
    .sort((a, b) => Date.parse(b.updatedAt ?? 0) - Date.parse(a.updatedAt ?? 0));
  if (!mine.length) return null;
  const t = mine[0].text.replace(/\s+/g, ' ').trim();
  return t.length > 140 ? `${t.slice(0, 137).trimEnd()}…` : t;
}

/** The one honest sentence + badge colour for where an answer is stored right now. */
export function savedLabel(a) {
  if (!a) return null;
  const draft = a.status === 'draft';
  if (a.where === 'device') return { where: 'device', text: draft ? 'Draft saved on this device' : 'Saved on this device' };
  if (a.where === 'shared') return { where: 'shared', text: 'Shared with your partner' };
  return { where: 'account', text: draft ? 'Draft saved to your account (not shared yet)' : 'Saved to your account, hidden from your partner' };
}

const showText = (a) => [a.choice, a.text].filter(Boolean).join(a.choice && a.text ? ' - ' : '');

export function createQuestionnaire(app) {
  const modal = () => app.ui.modal;

  // ------------------------------------------------------------------- sync status bar
  function syncBar() {
    const el = h('div', { class: 'sync-bar', role: 'status' });
    const render = () => {
      const a = app.auth?.status?.() ?? { configured: false, signedIn: false };
      const rel = app.relationship?.state;
      el.replaceChildren();
      const text = (t) => h('span', { class: 'grow', text: t });
      const btn = (label, fn) => h('button', { class: 'btn ghost', type: 'button', text: label, onClick: fn });
      if (!a.configured) {
        el.append(h('span', { class: 'badge device', text: 'Guest' }), text('Online sharing is not set up in this build, so answers are saved on this device only.'));
      } else if (!a.signedIn) {
        el.append(h('span', { class: 'badge device', text: 'Guest' }), text('Answers stay on this device. Sign in to keep them in your account or share them with your partner.'),
          btn('Sign in', () => app.ui.openAccount?.()));
      } else if (rel?.status !== 'active') {
        el.append(h('span', { class: 'badge account', text: 'Signed in' }), text(`Signed in as ${a.name}. Answers can be saved privately to your account. Pair with your partner to share.`),
          btn('Pair', () => app.ui.openAccount?.()));
      } else {
        const info = app.answers.syncInfo();
        el.append(h('span', { class: 'badge shared', text: 'Paired' }),
          text(`Paired with ${rel.partner?.display_name ?? 'your partner'}. ${info.live ? 'Live updates are on.' : 'Live updates are off, so this refreshes every 30 seconds.'}`),
          btn('Refresh', async (e) => {
            const b = e.currentTarget; b.disabled = true; b.textContent = 'Refreshing…';
            await app.answers.load();
            b.disabled = false; b.textContent = 'Refresh';
          }));
      }
    };
    render();
    const offs = ['auth:changed', 'relationship:changed', 'answers:changed'].map((ev) => app.bus.on(ev, render));
    return { el, dispose: () => offs.forEach((o) => o()) };
  }

  // --------------------------------------------------------------------- question card
  function questionCard(q, { onSaved } = {}) {
    const key = q.key;
    const answers = app.answers;
    const uid = `q-${key.replace(/[^a-z0-9]/gi, '-')}`;
    const stored = () => answers.peekMine(key);
    const first = stored();
    const restore = unsaved.get(key);
    const choices = () => answers.privacyChoices();
    const enabled = (v) => choices().find((c) => c.value === v)?.enabled;

    let privacy = first?.privacy ?? restore?.privacy ?? (lastPrivacy && enabled(lastPrivacy) ? lastPrivacy : answers.defaultPrivacy());
    let choice = restore?.choice ?? first?.choice ?? null;
    let busy = false;
    const max = q.type === 'choice' ? 400 : maxLengthFor(q);
    const initialText = restore?.text ?? first?.text ?? '';

    // ---- inputs
    const auto = q.type === 'choice' ? null : '1';
    let field;
    if (q.type === 'short') field = h('input', { class: 'field', type: 'text', id: uid, maxlength: max, autocomplete: 'off', 'data-autofocus': auto });
    else field = h('textarea', { class: 'field', id: uid, maxlength: max, rows: q.type === 'long' ? 5 : 2, autocomplete: 'off', placeholder: q.type === 'choice' ? 'Add a note (optional)' : null, 'data-autofocus': auto });
    field.value = initialText;
    const counter = h('span', { class: 'muted', 'aria-hidden': 'true' });
    // Built once and updated in place, so keyboard focus is never lost when an option is picked.
    const chipButtons = (q.options ?? []).map((o, i) => h('button', {
      class: 'chip', type: 'button', text: o, 'data-autofocus': i === 0 ? '1' : null,
      onClick: () => { choice = choice === o ? null : o; syncChips(); touch(); },
    }));
    const chipRow = q.type === 'choice' ? h('div', { class: 'q-choices', role: 'group', 'aria-labelledby': `${uid}-q` }, chipButtons) : null;
    const syncChips = () => chipButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === choice)));

    // ---- privacy selector (buttons are built once and updated in place)
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Where this answer is saved' });
    const hint = h('div', { class: 'muted small', id: `${uid}-hint` });
    const privacyButtons = ['device', 'private', 'shared'].map((v) => h('button', {
      type: 'button', dataset: { v }, onClick: () => { privacy = v; renderPrivacy(); touch(); },
    }));
    seg.append(...privacyButtons);
    const renderPrivacy = () => {
      const list = choices();
      if (!list.find((c) => c.value === privacy)?.enabled) privacy = answers.defaultPrivacy();
      for (const b of privacyButtons) {
        const c = list.find((x) => x.value === b.dataset.v);
        b.textContent = c.label; b.title = c.hint; b.disabled = !c.enabled || busy;
        b.setAttribute('aria-pressed', String(c.value === privacy));
      }
      const cur = list.find((c) => c.value === privacy);
      const moving = stored() && stored().privacy !== privacy ? ' Saving moves it there.' : '';
      hint.textContent = `${cur.hint}${moving}`;
    };

    // ---- status + messages
    const status = h('span');
    const dirtyTag = h('span', { class: 'tag warm', text: 'Unsaved changes', style: { display: 'none' } });
    const msg = h('div', { class: 'msg', role: 'status', 'aria-live': 'polite', style: { display: 'none' } });
    const say = (kind, text) => {
      msg.className = `msg ${kind === 'err' ? 'err' : kind === 'ok' ? 'ok' : ''}`;
      msg.textContent = text;
      msg.style.display = text ? '' : 'none';
    };
    const renderStatus = () => {
      const l = savedLabel(stored());
      status.replaceChildren(l ? h('span', { class: `badge ${l.where}`, text: l.text }) : h('span', { class: 'muted small', text: 'Not answered yet' }));
    };

    const readInput = () => ({ text: field.value, choice });
    const isDirty = () => {
      const s = stored();
      return (field.value.trim() !== (s?.text ?? '').trim()) || ((choice ?? null) !== (s?.choice ?? null)) || (s ? s.privacy !== privacy : false)
        ? Boolean(field.value.trim() || choice || s) : false;
    };
    const touch = (clearMessage = true) => {
      counter.textContent = `${field.value.length} / ${max}`;
      dirtyTag.style.display = isDirty() ? '' : 'none';
      if (clearMessage && !busy) say('', '');
    };

    // ---- actions
    const bDraft = h('button', { class: 'btn ghost', type: 'button', text: 'Save draft', onClick: () => save('draft') });
    const bSubmit = h('button', { class: 'btn primary', type: 'button', onClick: () => save('submitted') });
    const bRemove = h('button', { class: 'btn ghost', type: 'button', onClick: remove });
    const buttons = [bDraft, bSubmit, bRemove];
    const renderButtons = () => {
      const s = stored();
      const submitted = s?.status === 'submitted';
      bDraft.style.display = submitted ? 'none' : '';
      bSubmit.textContent = submitted ? 'Update answer' : 'Submit answer';
      bRemove.style.display = s ? '' : 'none';
      bRemove.textContent = submitted ? 'Remove my answer' : 'Discard draft';
    };
    const setBusy = (on) => { busy = on; buttons.forEach((b) => { b.disabled = on; }); renderPrivacy(); };

    async function save(statusValue) {
      if (busy) return;
      setBusy(true);
      say('info', statusValue === 'draft' ? 'Saving draft…' : 'Saving…');
      const res = await answers.save(key, readInput(), { privacy, status: statusValue });
      setBusy(false);
      if (!res.ok) { say('err', res.error); return; }
      unsaved.delete(key);
      lastPrivacy = privacy;
      const l = savedLabel(res.answer);
      app.audio?.sfx?.('ui_ok');
      renderStatus(); renderButtons(); renderPartner(); touch(false);
      say('ok', `${l.text}.${res.notice ? ` ${res.notice}` : ''}`);
      onSaved?.(res.answer, statusValue);
    }

    async function remove() {
      if (busy) return;
      const ok = await app.ui.confirm({
        title: 'Remove your answer?',
        body: ['This deletes your answer from this device and from your account, if you saved it there.', 'Your partner\'s own answers are not affected.'],
        confirmLabel: 'Remove', danger: true,
      });
      if (!ok) return;
      setBusy(true);
      const res = await answers.remove(key);
      setBusy(false);
      if (!res.ok) { say('err', res.error); return; }
      field.value = ''; choice = null; syncChips(); unsaved.delete(key);
      renderStatus(); renderButtons(); renderPartner(); touch(false);
      say('ok', 'Removed.');
    }

    // ---- partner's shared answer
    const partnerBox = h('div', { class: 'q-partner' });
    function renderPartner() {
      partnerBox.replaceChildren();
      const rel = app.relationship?.state;
      if (rel?.status !== 'active') return;
      const name = rel.partner?.display_name ?? 'Your partner';
      const theirs = answers.peekPartner(key);
      if (!theirs) { partnerBox.append(h('p', { class: 'muted small', text: `${name} has not shared an answer to this one.` })); return; }
      const mine = stored();
      partnerBox.append(h('div', { class: 'answers-grid' },
        h('div', { class: 'ans mine' }, h('span', { class: 'who', text: mine?.where === 'shared' ? 'You · shared' : 'You' }), mine?.status === 'submitted' ? showText(mine) : 'You have not answered yet.'),
        h('div', { class: 'ans' }, h('span', { class: 'who', text: `${name} · shared` }), showText(theirs))));
    }

    field.addEventListener('input', touch);
    if (q.type === 'short') field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); bSubmit.click(); } });

    const el = h('div', { class: 'q-item' },
      h('label', { class: 'qt', id: `${uid}-q`, for: q.type === 'choice' ? null : uid, text: q.text }),
      q.sample ? h('div', { class: 'muted small q-sample', text: q.sample }) : null,
      chipRow, field,
      h('div', { class: 'q-meta' }, counter, dirtyTag, status),
      h('fieldset', { class: 'q-privacy' }, h('legend', { text: 'Where should this answer live?' }), seg, hint),
      h('div', { class: 'q-actions' }, bDraft, bSubmit, bRemove),
      msg, partnerBox);

    syncChips(); renderPrivacy(); renderStatus(); renderButtons(); renderPartner(); touch();
    const offs = [
      app.bus.on('auth:changed', () => { renderPrivacy(); }),
      app.bus.on('relationship:changed', () => { renderPrivacy(); renderPartner(); }),
      app.bus.on('answers:changed', () => { if (!busy) { renderStatus(); renderButtons(); renderPartner(); renderPrivacy(); } }),
    ];
    return {
      el,
      focus: () => (q.type === 'choice' ? chipRow.querySelector('button') : field).focus(),
      /** Stops listening. Anything typed but not saved is kept (in memory) for when the card is reopened. */
      dispose() {
        offs.forEach((o) => o());
        if (isDirty() && (field.value.trim() || choice)) unsaved.set(key, { text: field.value, choice, privacy });
        else unsaved.delete(key);
      },
    };
  }

  const answeredIn = (catKey) => questionsInCategory(catKey).filter((q) => app.answers.peekMine(q.key)?.status === 'submitted').length;

  // ------------------------------------------------------------------------ one category
  async function openCategory(catKey) {
    const cat = getCategory(catKey);
    if (!cat) return null;
    const bar = syncBar();
    const cards = questionsInCategory(catKey).map((q) => questionCard(q));
    const body = h('div', { class: 'stack' },
      h('p', { class: 'muted', text: `${cat.blurb} Every question is optional: answer, save a draft, or skip anything you would rather not say.` }),
      bar.el,
      h('div', { class: 'q-cat' }, cards.map((c) => c.el)));
    const handle = modal().open({
      title: cat.title, wide: true, body,
      actions: [{ label: 'Done', kind: 'primary', value: 'done' }],
      onClose: () => { cards.forEach((c) => c.dispose()); bar.dispose(); },
    });
    app.answers.load();
    return handle.result;
  }

  // ----------------------------------------------------------------------- one question
  async function openQuestion(key, { context = 'log' } = {}) {
    const q = getQuestion(key);
    if (!q) return { saved: false };
    const cat = getCategory(q.category);
    const bar = syncBar();
    let saved = false;
    let handle;
    const card = questionCard(q, {
      onSaved: (_a, st) => {
        if (st !== 'submitted') return;
        saved = true;
        const b = handle?.el.querySelector('.panel-foot .btn');
        if (b) { b.textContent = 'Continue'; b.classList.remove('ghost'); b.classList.add('primary'); }
      },
    });
    handle = modal().open({
      title: cat?.title ?? 'A question', wide: true, className: `ctx-${context}`,
      body: h('div', { class: 'stack' }, h('p', { class: 'muted small', text: 'Optional. Answer, save a draft, or skip: nothing here is required.' }), bar.el, card.el),
      actions: [{ label: 'Skip for now', kind: 'ghost', value: 'skipped' }],
      onClose: () => { card.dispose(); bar.dispose(); },
    });
    app.answers.load();
    await handle.result;
    return { saved };
  }

  // ----------------------------------------------------------- shared view (both players)
  function openSharedView() {
    const rel = app.relationship?.state;
    const name = rel?.partner?.display_name ?? 'Your partner';
    const bar = syncBar();
    const list = h('div', { class: 'stack' });
    const render = () => {
      list.replaceChildren();
      const rows = [];
      for (const cat of CATEGORIES) {
        for (const q of questionsInCategory(cat.key)) {
          const mine = app.answers.peekMine(q.key);
          const theirs = app.answers.peekPartner(q.key);
          const mineShared = mine?.where === 'shared' ? mine : null;
          if (mineShared || theirs) rows.push({ q, mine: mineShared, theirs });
        }
      }
      if (rel?.status !== 'active') { list.append(h('p', { class: 'muted', text: 'Pair with your partner to see answers you have both chosen to share.' })); return; }
      if (!rows.length) { list.append(h('p', { class: 'muted', text: 'Nothing has been shared yet. When either of you shares an answer, it appears here.' })); return; }
      for (const r of rows) {
        list.append(h('div', { class: 'q-item' }, h('div', { class: 'qt', text: r.q.text }),
          h('div', { class: 'answers-grid' },
            h('div', { class: 'ans mine' }, h('span', { class: 'who', text: 'You' }), r.mine ? showText(r.mine) : 'Not shared'),
            h('div', { class: 'ans' }, h('span', { class: 'who', text: name }), r.theirs ? showText(r.theirs) : 'Not shared'))));
      }
    };
    render();
    const off = app.bus.on('answers:changed', render);
    const handle = modal().open({
      title: 'Shared answers', wide: true,
      body: h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'Only answers that were submitted and marked "Share with my partner" appear here, for both of you. Private answers and drafts are never shown.' }), bar.el, list),
      actions: [{ label: 'Close', kind: 'primary', value: 'close' }],
      onClose: () => { off(); bar.dispose(); },
    });
    app.answers.load();
    return handle.result;
  }

  // ---------------------------------------------------------------- the main entry point
  function openQuestionnaire() {
    const bar = syncBar();
    const list = h('div', { class: 'cat-list' });
    const optional = h('div', { class: 'cat-list' });
    const rowFor = (cat) => {
      const total = questionsInCategory(cat.key).length;
      const done = answeredIn(cat.key);
      return h('button', { class: 'btn cat-row', type: 'button', onClick: async () => { await openCategory(cat.key); render(); } },
        h('span', null, h('b', { text: cat.title }), h('div', { class: 'muted small', text: cat.blurb })),
        h('span', { class: `tag ${done === total ? 'green' : ''}`, text: `${done}/${total} answered` }));
    };
    const render = () => {
      list.replaceChildren(...rooftopObjects().map(rowFor));
      optional.replaceChildren(...CATEGORIES.filter((c) => !c.object).map(rowFor));
    };
    render();
    const off = app.bus.on('answers:changed', render);
    const body = h('div', { class: 'stack' },
      h('p', { text: 'Questions to learn each other better. Everything is optional, there are no right answers, and you choose where each answer is saved.' }),
      h('ul', { class: 'muted small', style: { margin: 0, paddingLeft: '1.2em' } },
        h('li', { text: 'Only on this device: never leaves this browser.' }),
        h('li', { text: 'Private, in my account: saved online and hidden from your partner in the game. Whoever runs the game\'s database can still read it.' }),
        h('li', { text: 'Share with my partner: your partner can read it once you submit.' })),
      bar.el,
      list,
      h('h3', { class: 'muted', style: { font: '700 .75em var(--mono)', letterSpacing: '.2em', textTransform: 'uppercase', margin: '1em 0 0' }, text: 'Optional prompts from the story' }),
      optional,
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', text: 'Shared answers', onClick: () => openSharedView() })));
    const handle = modal().open({
      title: 'Learn about each other', wide: true, body,
      actions: [{ label: 'Close', kind: 'primary', value: 'close' }],
      onClose: () => { off(); bar.dispose(); },
    });
    app.answers.load();
    return handle.result;
  }

  return { openQuestionnaire, openCategory, openQuestion, openSharedView };
}
