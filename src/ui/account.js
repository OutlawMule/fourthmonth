// Account screen: guest status, sign up / sign in / password reset, pairing with a partner,
// progress sync status, and deleting your online data. It only talks to app.auth,
// app.relationship, app.sync and app.answers; none of the security lives in this file
// (hiding a button is never the boundary: see supabase/SECURITY.md).
//
// Nothing secret is stored by this screen. Passwords are typed into the form and handed to
// Supabase Auth, nothing else. Invitation codes are shown once from memory and never persisted.
import { h } from './dom.js';
import { formatInviteCode } from '../utils/validation.js';

const CHARACTER_NAME = { mule: 'Big Boss Mule', princess: 'Princess' };
const fmtTime = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };

export function createAccountUI(app) {
  let open = null; // { close, render } for the single account dialog

  // ------------------------------------------------------------------ small builders
  function field(label, props) {
    const id = `acc-${Math.random().toString(36).slice(2, 8)}`;
    const input = h('input', { class: 'field', id, ...props });
    return { input, el: h('div', null, h('label', { for: id, class: 'muted small', text: label, style: { display: 'block', marginBottom: '.25em' } }), input) };
  }
  function messageBox() {
    const el = h('div', { class: 'msg', role: 'status', 'aria-live': 'polite', style: { display: 'none' } });
    const say = (kind, text) => { el.className = `msg ${kind}`; el.textContent = text; el.style.display = text ? '' : 'none'; };
    return { el, say };
  }
  /** Runs an async action with a busy button and a message line. */
  function submitting(button, say, busyText, task) {
    return async (e) => {
      e?.preventDefault?.();
      if (button.disabled) return;
      const label = button.textContent;
      button.disabled = true; button.textContent = busyText; say('', busyText);
      try { await task(); } finally { button.disabled = false; button.textContent = label; }
    };
  }
  const section = (title, ...kids) => h('section', { class: 'stack' }, h('h3', { class: 'muted', style: { font: '700 .75em var(--mono)', letterSpacing: '.2em', textTransform: 'uppercase', margin: '0' }, text: title }), ...kids);

  // ------------------------------------------------------------------------- views
  function viewNotConfigured(st) {
    return h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('span', { class: 'badge device', text: 'Guest mode' })),
      h('p', { text: 'Online features are not set up in this build, so you are playing as a guest. Everything is saved on this device: your progress, settings and any answers you write.' }),
      st.problem ? h('div', { class: 'msg err', text: `Online setup problem: ${st.problem}. The game still works as a guest.` }) : null,
      h('p', { class: 'muted small', text: 'When online features are switched on (see the README), you can create an account, keep progress across devices, pair with your partner and share answers.' }));
  }

  function viewRecovery(st) {
    const { el: msgEl, say } = messageBox();
    const pw = field('New password (at least 8 characters)', { type: 'password', autocomplete: 'new-password', required: true, minlength: 8, maxlength: 72, 'data-autofocus': '1' });
    const pw2 = field('Repeat the new password', { type: 'password', autocomplete: 'new-password', required: true, maxlength: 72 });
    const btn = h('button', { class: 'btn primary', type: 'submit', text: 'Save new password' });
    const form = h('form', { class: 'stack', novalidate: true, onSubmit: submitting(btn, say, 'Saving…', async () => {
      if (pw.input.value !== pw2.input.value) { say('err', 'The two passwords do not match.'); return; }
      const r = await app.auth.updatePassword(pw.input.value);
      if (!r.ok) { say('err', r.error); return; }
      say('ok', 'Password changed. You are signed in.');
    }) }, h('p', { text: 'Choose a new password for your account.' }), pw.el, pw2.el,
    h('div', { class: 'row' }, btn, h('button', { class: 'btn ghost', type: 'button', text: 'Not now', onClick: () => app.auth.dismissRecovery() })), msgEl);
    return form;
  }

  function viewSignedOut(st, state) {
    const tabs = [['in', 'Sign in'], ['up', 'Create account'], ['reset', 'Forgot password']];
    const bar = h('div', { class: 'account-tabs', role: 'tablist' }, tabs.map(([k, label]) => h('button', {
      class: 'btn ghost', type: 'button', role: 'tab', 'aria-selected': String(state.tab === k), text: label,
      onClick: () => { state.tab = k; open.render(true); },
    })));
    const { el: msgEl, say } = messageBox();
    let form;
    if (state.tab === 'up') {
      const name = field('Display name (your partner will see this)', { type: 'text', autocomplete: 'nickname', required: true, maxlength: 32, 'data-autofocus': '1' });
      const email = field('Email', { type: 'email', autocomplete: 'email', required: true, maxlength: 254 });
      const pw = field('Password (at least 8 characters)', { type: 'password', autocomplete: 'new-password', required: true, minlength: 8, maxlength: 72 });
      const btn = h('button', { class: 'btn primary', type: 'submit', text: 'Create account' });
      form = h('form', { class: 'stack', novalidate: true, onSubmit: submitting(btn, say, 'Creating account…', async () => {
        const r = await app.auth.signUp({ email: email.input.value, password: pw.input.value, displayName: name.input.value });
        if (!r.ok) { say('err', r.error); return; }
        pw.input.value = '';
        if (r.needsConfirmation) say('ok', 'Almost there. If this address can be used, we sent a confirmation link. Open it, then come back and sign in.');
        else say('ok', 'Account created. You are signed in.');
      }) }, name.el, email.el, pw.el, h('div', { class: 'row' }, btn));
    } else if (state.tab === 'reset') {
      const email = field('Email', { type: 'email', autocomplete: 'email', required: true, maxlength: 254, 'data-autofocus': '1' });
      const btn = h('button', { class: 'btn primary', type: 'submit', text: 'Send reset link' });
      form = h('form', { class: 'stack', novalidate: true, onSubmit: submitting(btn, say, 'Sending…', async () => {
        const r = await app.auth.sendPasswordReset(email.input.value);
        if (!r.ok) { say('err', r.error); return; }
        say('ok', 'If that email has an account, a reset link is on its way. Open it on this device to choose a new password.');
      }) }, h('p', { class: 'muted', text: 'We will email you a link to choose a new password.' }), email.el, h('div', { class: 'row' }, btn));
    } else {
      const email = field('Email', { type: 'email', autocomplete: 'email', required: true, maxlength: 254, 'data-autofocus': '1' });
      const pw = field('Password', { type: 'password', autocomplete: 'current-password', required: true, maxlength: 72 });
      const btn = h('button', { class: 'btn primary', type: 'submit', text: 'Sign in' });
      form = h('form', { class: 'stack', novalidate: true, onSubmit: submitting(btn, say, 'Signing in…', async () => {
        const r = await app.auth.signIn({ email: email.input.value, password: pw.input.value });
        if (!r.ok) { say('err', r.error); return; }
        pw.input.value = '';
      }) }, email.el, pw.el, h('div', { class: 'row' }, btn));
    }
    return h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('span', { class: 'badge device', text: 'Playing as guest' })),
      h('p', { class: 'muted', text: 'You do not need an account to play. As a guest everything is saved on this device only. An account lets you keep progress across devices, pair with your partner and share answers you choose to share.' }),
      bar, form, msgEl,
      h('hr', { class: 'divider' }),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', text: 'Continue as guest', onClick: () => open?.close() })));
  }

  function viewSignedIn(st) {
    const rel = app.relationship.state;
    const out = h('div', { class: 'stack' });

    // --- account + sync
    const syncLine = h('span', { 'aria-live': 'polite' });
    const renderSync = () => {
      const s = app.sync?.status?.() ?? { state: 'off' };
      const txt = s.state === 'syncing' ? 'Syncing…' : s.state === 'error' ? `Could not sync: ${s.error}` : s.at ? `Synced to your account at ${fmtTime(s.at)}` : 'Waiting to sync';
      syncLine.textContent = txt;
    };
    renderSync();
    const offSync = app.bus.on('sync:status', renderSync);
    open.cleanup.push(offSync);

    const nameMsg = messageBox();
    const nameField = field('Display name', { type: 'text', value: st.name ?? '', maxlength: 32, autocomplete: 'nickname' });
    const nameBtn = h('button', { class: 'btn', type: 'button', text: 'Save name' });
    nameBtn.addEventListener('click', submitting(nameBtn, nameMsg.say, 'Saving…', async () => {
      const r = await app.auth.updateDisplayName(nameField.input.value);
      nameMsg.say(r.ok ? 'ok' : 'err', r.ok ? 'Name saved.' : r.error);
    }));
    const syncBtn = h('button', { class: 'btn', type: 'button', text: 'Sync now' });
    syncBtn.addEventListener('click', submitting(syncBtn, () => {}, 'Syncing…', async () => { await app.sync.syncNow(); }));

    out.append(section('Account',
      h('div', { class: 'row' }, h('span', { class: 'badge account', text: 'Signed in' })),
      h('dl', { class: 'kv' }, h('dt', { text: 'Email' }), h('dd', { text: st.email }), h('dt', { text: 'Game progress' }), h('dd', null, syncLine)),
      nameField.el, h('div', { class: 'row' }, nameBtn, syncBtn), nameMsg.el,
      h('p', { class: 'muted small', text: 'Merging rule: stages, fragments and answered questions from this device and your account are combined. Nothing newer is overwritten by something older.' }),
      h('div', { class: 'row' }, h('button', { class: 'btn pink', type: 'button', text: 'Sign out', onClick: async () => { await app.auth.signOut(); app.bus.emit('toast', { kind: 'info', text: 'Signed out. Playing as guest. Answers saved on this device are still here.' }); } }))));

    // --- partner
    out.append(h('hr', { class: 'divider' }), viewPartner(rel));

    // --- your data
    out.append(h('hr', { class: 'divider' }), viewData());
    return out;
  }

  function viewPartner(rel) {
    if (rel.status === 'active') {
      const { el: msgEl, say } = messageBox();
      const who = rel.partner?.display_name ?? 'your partner';
      const ch = CHARACTER_NAME[rel.partner?.selected_character];
      const leave = h('button', { class: 'btn pink', type: 'button', text: 'Leave this relationship space' });
      leave.addEventListener('click', async () => {
        const ok = await app.ui.confirm({
          title: 'Leave this space?',
          body: ['Your answers move to a new private space of your own and stop being shared. Nothing you wrote is deleted.', `${who} keeps their own answers and can pair again with a new code.`, 'You can pair again later with a new code.'],
          confirmLabel: 'Leave', danger: true,
        });
        if (!ok) return;
        leave.disabled = true; say('', 'Leaving…');
        const r = await app.relationship.leave();
        leave.disabled = false;
        say(r.ok ? 'ok' : 'err', r.ok ? 'You left the shared space.' : r.error);
      });
      const refresh = h('button', { class: 'btn', type: 'button', text: 'Refresh now' });
      refresh.addEventListener('click', submitting(refresh, () => {}, 'Refreshing…', async () => { await app.relationship.refresh(); await app.answers.load(); }));
      const live = h('span', { class: 'muted small' });
      const renderLive = () => { live.textContent = app.relationship.state.live ? 'Live updates are on.' : 'Live updates are off. This refreshes every 30 seconds and when you return to this tab.'; };
      renderLive();
      open.cleanup.push(app.bus.on('relationship:changed', renderLive));
      return section('Your partner',
        h('div', { class: 'row' }, h('span', { class: 'badge shared', text: 'Paired' })),
        h('dl', { class: 'kv' }, h('dt', { text: 'Partner' }), h('dd', { text: ch ? `${who} (plays ${ch})` : who })),
        h('p', { class: 'muted small', text: 'You each decide, answer by answer, what to share. Private answers and drafts are never visible to your partner.' }),
        live, h('div', { class: 'row' }, refresh, leave), msgEl);
    }

    // not paired yet: invite or join
    app.relationship.watchFast(true);
    open.cleanup.push(() => app.relationship.watchFast(false));
    const inviteMsg = messageBox();
    const codeBox = h('div', { class: 'stack' });
    const showCode = (inv) => {
      codeBox.replaceChildren(
        h('div', { class: 'code-row' },
          h('div', { class: 'code', 'aria-label': 'Invitation code', text: formatInviteCode(inv.code) }),
          h('button', { class: 'btn', type: 'button', text: 'Copy', onClick: async (e) => {
            try { await navigator.clipboard.writeText(formatInviteCode(inv.code)); e.currentTarget.textContent = 'Copied'; }
            catch { inviteMsg.say('', 'Could not copy automatically. Select the code and copy it.'); }
          } })),
        h('p', { class: 'muted small', text: `Send this to your partner privately. It works once and expires ${fmtTime(inv.expires_at)}. Creating a new code cancels this one.` }));
    };
    if (rel.lastInvite) showCode(rel.lastInvite);
    else if (rel.invitation) codeBox.append(h('p', { class: 'muted small', text: `A code is waiting until ${fmtTime(rel.invitation.expires_at)}. For safety it cannot be shown again. Create a new code to get a fresh one (the old one stops working).` }));
    const create = h('button', { class: 'btn primary', type: 'button', text: rel.invitation || rel.lastInvite ? 'Create a new code' : 'Create invitation code' });
    create.addEventListener('click', submitting(create, inviteMsg.say, 'Creating…', async () => {
      const r = await app.relationship.createInvite();
      if (!r.ok) { inviteMsg.say('err', r.error); return; }
      showCode(r); inviteMsg.say('ok', 'Code created. Waiting for your partner to enter it.');
    }));

    const joinMsg = messageBox();
    const code = field('Code from your partner', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: 32, placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX' });
    const join = h('button', { class: 'btn', type: 'submit', text: 'Join' });
    const joinForm = h('form', { class: 'stack', novalidate: true, onSubmit: submitting(join, joinMsg.say, 'Checking…', async () => {
      const r = await app.relationship.redeem(code.input.value);
      if (!r.ok) { joinMsg.say('err', r.error); return; }
      code.input.value = '';
      app.bus.emit('toast', { kind: 'info', text: 'You are paired. Share answers one at a time, only when you want to.' });
    }) }, code.el, h('div', { class: 'row' }, join), joinMsg.el);

    return section('Pair with your partner',
      h('div', { class: 'row' }, h('span', { class: 'badge account', text: 'Not paired yet' })),
      h('p', { class: 'muted', text: 'One of you creates a code, the other enters it. Pairing works for exactly two people, and the code is checked on the server.' }),
      h('h4', { text: '1. Invite your partner', style: { margin: '.6em 0 0' } }), create, codeBox, inviteMsg.el,
      h('h4', { text: '2. Or enter a code you were sent', style: { margin: '.6em 0 0' } }), joinForm);
  }

  function viewData() {
    const msg = messageBox();
    const del = h('button', { class: 'btn pink', type: 'button', text: 'Delete my online data' });
    del.addEventListener('click', async () => {
      const typed = h('input', { class: 'field', type: 'text', autocomplete: 'off', 'aria-label': 'Type DELETE to confirm', 'data-autofocus': '1' });
      const go = h('button', { class: 'btn pink', type: 'button', text: 'Delete everything online', disabled: true });
      typed.addEventListener('input', () => { go.disabled = typed.value.trim() !== 'DELETE'; });
      const dlg = app.ui.modal.open({
        title: 'Delete your online data?', narrow: true,
        body: h('div', { class: 'stack' },
          h('p', { text: 'This permanently deletes your answers, game progress, profile and invitations from the online database, and removes you from your relationship space.' }),
          h('p', { class: 'muted', text: 'Your partner keeps their own answers. Anything saved only on this device is not affected. This cannot be undone.' }),
          h('label', { class: 'muted small', text: 'Type DELETE to confirm' }), typed),
        actions: [{ label: 'Cancel', kind: 'ghost', value: false }],
      });
      dlg.el.querySelector('.panel-foot')?.append(go);
      go.addEventListener('click', async () => {
        go.disabled = true; go.textContent = 'Deleting…';
        const r = await app.auth.deleteMyData();
        if (!r.ok) { go.textContent = 'Delete everything online'; go.disabled = false; dlg.close(false); msg.say('err', r.error); return; }
        app.answers.forgetAccountAnswers();
        await app.auth.signOut();
        dlg.close(true);
        app.bus.emit('toast', { kind: 'info', text: 'Your online data was deleted. Answers on this device are still here.' });
      });
    });
    return section('Your data',
      h('ul', { class: 'muted small', style: { margin: 0, paddingLeft: '1.2em' } },
        h('li', null, h('span', { class: 'badge device', text: 'Saved on this device' }), ' Progress, settings and any answers you kept local. Delete these in Settings.'),
        h('li', null, h('span', { class: 'badge account', text: 'Saved to your account' }), ' Progress and answers you saved privately. Hidden from your partner in the game; whoever runs the game\'s database can still read them.'),
        h('li', null, h('span', { class: 'badge shared', text: 'Shared with your partner' }), ' Answers you submitted and chose to share.')),
      h('div', { class: 'row' }, del), msg.el,
      h('p', { class: 'muted small', text: 'Deleting your online data does not remove the sign-in itself (your email address). That needs the person who runs this game: ask them to delete your user in the Supabase dashboard (Authentication, Users). Signing out never deletes anything.' }));
  }

  // ------------------------------------------------------------------------ dialog
  function openAccount() {
    if (open) { open.render(true); return open.result; }
    const state = { tab: 'in' };
    const content = h('div');
    let lastKey = null;
    const cleanup = [];
    open = { cleanup, result: null, close: null, render: null };

    const render = (force = false) => {
      const st = app.auth.status();
      const rel = app.relationship.state;
      const key = JSON.stringify([st.configured, st.problem, st.ready, st.signedIn, st.recovery, st.name, st.email, state.tab,
        rel.status, rel.partner, rel.invitation, rel.lastInvite?.code]);
      if (!force && key === lastKey) return;
      lastKey = key;
      // drop listeners/timers created by the previous render
      while (cleanup.length) { try { cleanup.pop()(); } catch { /* ignore */ } }
      let view;
      if (!st.configured) view = viewNotConfigured(st);
      else if (!st.ready) view = h('p', { class: 'muted', role: 'status', text: 'Checking your session…' });
      else if (st.recovery) view = viewRecovery(st);
      else if (!st.signedIn) view = viewSignedOut(st, state);
      else view = viewSignedIn(st);
      content.replaceChildren(view);
      queueMicrotask(() => content.querySelector('[data-autofocus]')?.focus());
    };
    open.render = render;

    const offs = ['auth:changed', 'relationship:changed'].map((ev) => app.bus.on(ev, () => render()));
    const handle = app.ui.modal.open({
      title: 'Account and partner', wide: true, body: content,
      actions: [{ label: 'Close', kind: 'primary', value: 'close' }],
      onClose: () => { offs.forEach((o) => o()); while (cleanup.length) { try { cleanup.pop()(); } catch { /* ignore */ } } open = null; },
    });
    open.close = handle.close;
    open.result = handle.result;
    render(true);
    app.auth.status().signedIn && app.relationship.refresh();
    return handle.result;
  }

  // The password-reset email link brings the player back here with a recovery session.
  app.bus.on('auth:recovery', () => openAccount());

  return { openAccount };
}
