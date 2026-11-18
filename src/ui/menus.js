// HTML menus: main menu, character select cards, pause, settings, controls, credits.
// Everything is keyboard navigable (Tab, arrows, Enter, Esc) with visible focus rings.
import { h, arrowNav } from './dom.js';
import { CHARACTERS, CHARACTER_KEYS } from '../data/characters.js';
import { CREDITS } from '../data/memories.js';
import { STAGES } from '../data/stages.js';
import { ART } from '../game/art/pixel.js';
import { titleDataUrl, CHROME_LIGHT, CHROME_DARK } from '../game/art/title.js';
import { goTo, startStage } from '../game/sceneFlow.js';

const STAT_LABELS = [['speed', 'Speed'], ['power', 'Power'], ['mobility', 'Mobility'], ['defense', 'Defense']];

// Preview loops shown on the character cards: [animation, frames, fps, repeats]
const PREVIEW_SEQ = {
  mule: [['idle', 4, 4, 2], ['ride', 3, 9, 4], ['punch1', 3, 10, 1], ['punch2', 3, 10, 1], ['punch3', 3, 8, 1], ['trick', 4, 14, 3]],
  princess: [['idle', 4, 4, 2], ['run', 8, 13, 2], ['cast', 3, 9, 2], ['jump', 1, 2, 1], ['wave', 4, 5, 2]],
};

export function createMenus(app) {
  const modal = () => app.ui.modal;
  let mainEl = null;
  let selectEl = null;
  let stopPreviews = null;
  let pauseOpen = false;

  // ================================================================ confirmations
  /** confirm({ title, body, confirmLabel, cancelLabel, danger }) -> Promise<boolean> */
  async function confirm({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    const paras = (Array.isArray(body) ? body : [body]).map((t) => (typeof t === 'string' ? h('p', { text: t }) : t));
    const v = await modal().open({
      title, narrow: true, body: h('div', { class: 'stack' }, paras),
      actions: [
        { label: cancelLabel, kind: 'ghost', value: false, autofocus: true },
        { label: confirmLabel, kind: danger ? 'pink' : 'primary', value: true },
      ],
    }).result;
    return v === true;
  }

  // ===================================================================== main menu
  function brandImg() {
    const img = h('img', { class: 'brand-img', alt: 'BLAQ STUDIO', src: titleDataUrl(['BLAQ STUDIO'], { scale: 2, bands: CHROME_DARK, margin: 4, glowStrength: 0.1 }) });
    return img;
  }

  async function newGame() {
    if (app.progress.hasSave) {
      const ok = await confirm({
        title: 'Start a new game?',
        body: [
          'This resets your saved GAME progress on this device: stages, fragments and the story so far.',
          'Your answers to the relationship questions are NOT deleted. You can remove those separately in Settings → Data.',
        ],
        confirmLabel: 'Reset progress and start',
        danger: true,
      });
      if (!ok) return;
    }
    goTo('CharacterSelectScene', { mode: 'new' });
  }

  function continueGame() {
    if (!app.progress.hasSave) return;
    startStage(app.progress.resumeStage, { resume: true });
  }

  function statusChip() {
    const st = app.auth?.status?.() ?? { configured: false, signedIn: false };
    let text = 'Guest · saved on this device';
    let on = false;
    if (!st.configured) text = 'Offline mode · saved on this device';
    else if (st.signedIn && st.paired) { text = `${st.name ?? 'Signed in'} · paired`; on = true; }
    else if (st.signedIn) { text = `${st.name ?? 'Signed in'} · not paired yet`; on = true; }
    return { text, on };
  }

  function showMainMenu() {
    if (mainEl) return;
    const pm = app.progress;
    const hasSave = pm.hasSave;
    const resumeStage = STAGES[pm.resumeStage];
    const items = [
      ['1', 'New Game', newGame, {}],
      ['2', hasSave ? `Continue — Stage 0${resumeStage.number}` : 'Continue', continueGame, { disabled: !hasSave }],
      ['3', 'Character Selection', () => goTo('CharacterSelectScene', { mode: 'change' }), {}],
      ['4', 'Memory Archive', () => app.ui.openArchive(), {}],
      ['5', 'Learn About Each Other', () => app.ui.openQuestionnaire(), {}],
      ['6', 'Settings', () => openSettings(), {}],
      ['7', 'Credits', () => openCredits(), {}],
    ];
    const col = h('nav', { class: 'menu-col', 'aria-label': 'Main menu' }, items.map(([k, label, fn, o]) => h('button', {
      class: 'btn', type: 'button', disabled: o.disabled, title: o.disabled ? 'No saved game yet' : null,
      onClick: () => { app.audio?.sfx('ui_ok'); fn(); },
      onFocus: () => app.audio?.sfx('ui_move'),
    }, h('span', { class: 'k', text: k }), label)));
    arrowNav(col);

    const title = h('img', { class: 'title-img', alt: 'MULE × PRINCESS', src: titleDataUrl(['MULE × PRINCESS'], { scale: 6, bands: CHROME_LIGHT }) });
    const chip = statusChip();
    const dot = h('span', { class: `dot ${chip.on ? 'on' : ''}` });
    const label = h('span', { text: chip.text });
    const status = h('div', { class: 'menu-status' }, dot, label,
      h('button', { class: 'btn ghost', type: 'button', text: 'Account', onClick: () => app.ui.openAccount?.() }));
    const offAuth = app.bus.on('auth:changed', () => { const c = statusChip(); dot.classList.toggle('on', c.on); label.textContent = c.text; });

    mainEl = h('div', { class: 'menu-screen' },
      h('div', { class: 'menu-left' }, title, h('div', { class: 'title-sub', text: 'Two different worlds collided. Now they are learning how to build one together.' }), col),
      status,
      h('div', { class: 'brand' }, brandImg(), 'PIXELS & PEONIES'));
    mainEl.dataset.offAuth = '1';
    mainEl._off = offAuth;
    app.ui.root.append(mainEl);
    queueMicrotask(() => (col.querySelector('button:not([disabled])'))?.focus());
  }

  function hideMainMenu() {
    if (!mainEl) return;
    mainEl._off?.();
    mainEl.remove();
    mainEl = null;
  }

  // =============================================================== character select
  function startPreview(canvas, key) {
    const seq = PREVIEW_SEQ[key];
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const atlas = ART.get(key);
    let raf = 0;
    let t0 = performance.now();
    let si = 0;
    let played = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      const [name, n, fps, reps] = seq[si];
      const frameDur = 1000 / fps;
      const elapsed = now - t0;
      const total = n * frameDur;
      const f = Math.min(n - 1, Math.floor((elapsed % total) / frameDur));
      if (elapsed >= total) { t0 = now - (elapsed % total); played += 1; if (played >= reps) { played = 0; si = (si + 1) % seq.length; t0 = now; } }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const img = atlas?.getFrame(`${name}_${f}`);
      if (img) ctx.drawImage(img, Math.round((canvas.width - 144) / 2), canvas.height - 144, 144, 144);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }

  /** The overlay shown by CharacterSelectScene. onStart(characterKey) / onBack(). */
  function showCharacterSelect({ mode = 'new', onStart, onBack }) {
    hideCharacterSelect();
    const pm = app.progress;
    let selected = pm.character;
    const stops = [];
    const cardEls = new Map();

    const setSelected = (key, { silent = false } = {}) => {
      selected = key;
      for (const [k, el] of cardEls) {
        el.setAttribute('aria-checked', String(k === key));
        el.tabIndex = k === key ? 0 : -1;
      }
      if (!silent) app.audio?.sfx('ui_move');
      startBtn.textContent = startLabel();
    };
    const startLabel = () => (mode === 'change' && pm.hasSave ? `Continue as ${CHARACTERS[selected].short}` : 'Start Game');

    for (const key of CHARACTER_KEYS) {
      const c = CHARACTERS[key];
      const cv = h('canvas', { class: 'preview', width: 150, height: 150, 'aria-hidden': 'true' });
      stops.push(startPreview(cv, key));
      const el = h('div', {
        class: 'card', role: 'radio', 'aria-checked': 'false', tabindex: '-1', style: { '--accent': c.accent },
        'aria-label': `${c.name}. ${c.tagline}`,
        onClick: () => setSelected(key),
        onDblclick: () => { setSelected(key, { silent: true }); onStart?.(selected); },
        onKeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(key); }
        },
      },
      h('span', { class: 'selected-flag tag', text: 'selected', hidden: true }),
      cv,
      h('h3', { text: c.name }),
      h('div', { class: 'tagline', text: c.tagline }),
      h('p', { text: c.description }),
      h('div', { class: 'stack' }, STAT_LABELS.map(([k, label]) => h('div', { class: 'stat' }, h('span', { text: label }),
        h('span', { class: 'bar', role: 'img', 'aria-label': `${label} ${c.stats[k]} of 5` }, [1, 2, 3, 4, 5].map((i) => h('i', { class: i <= c.stats[k] ? 'on' : '' })))))),
      h('div', { class: 'abil' }, c.abilities.map((a) => h('span', { class: 'tag', title: a.desc, text: a.name }))),
      h('div', { class: 'small muted', text: c.abilities.map((a) => `${a.name}: ${a.desc}`).join('  ') }));
      cardEls.set(key, el);
    }

    const startBtn = h('button', { class: 'btn primary', type: 'button', text: startLabel(), onClick: () => { app.audio?.sfx('ui_ok'); onStart?.(selected); } });
    const backBtn = h('button', { class: 'btn ghost', type: 'button', text: 'Back', onClick: () => { app.audio?.sfx('ui_back'); onBack?.(); } });
    const group = h('div', { class: 'cards', role: 'radiogroup', 'aria-label': 'Choose your character' }, [...cardEls.values()]);
    selectEl = h('div', { class: 'select-screen' },
      h('div', { class: 'select-title', text: 'Choose your character' }),
      group,
      h('div', { class: 'row' }, backBtn, startBtn),
      h('div', { class: 'hint-line', text: '← → choose  ·  Enter select  ·  Esc back' }));
    selectEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const i = CHARACTER_KEYS.indexOf(selected);
        const n = CHARACTER_KEYS[(i + (e.key === 'ArrowRight' ? 1 : CHARACTER_KEYS.length - 1)) % CHARACTER_KEYS.length];
        e.preventDefault(); setSelected(n); cardEls.get(n).focus();
      } else if (e.key === 'Escape' && !modal().isOpen) { e.preventDefault(); onBack?.(); }
    });
    // the selected card shows its flag
    const observer = new MutationObserver(() => {
      for (const [k, el] of cardEls) el.querySelector('.selected-flag').hidden = k !== selected;
    });
    for (const el of cardEls.values()) observer.observe(el, { attributes: true, attributeFilter: ['aria-checked'] });
    stopPreviews = () => { stops.forEach((s) => s()); observer.disconnect(); };
    app.ui.root.append(selectEl);
    setSelected(selected, { silent: true });
    queueMicrotask(() => cardEls.get(selected)?.focus());
  }

  function hideCharacterSelect() {
    stopPreviews?.();
    stopPreviews = null;
    selectEl?.remove();
    selectEl = null;
  }

  // ================================================================== settings
  function openSettings() {
    const st = app.settings;
    const cur = () => st.get();
    const set = (patch) => st.set(patch);

    const range = (key, label, { min, max, step, fmt }) => {
      const out = h('output', { class: 'muted small', text: fmt(cur()[key]), style: { minWidth: '3.5em', textAlign: 'right' } });
      const inp = h('input', {
        type: 'range', min, max, step, value: cur()[key], 'aria-label': label,
        onInput: (e) => { set({ [key]: Number(e.target.value) }); out.textContent = fmt(cur()[key]); },
        onChange: () => app.audio?.sfx('ui_move'),
      });
      return h('div', { class: 'setting' }, h('span', { text: label }), h('span', { class: 'ctl' }, inp, out));
    };
    const toggle = (key, label, note) => h('div', { class: 'setting' },
      h('span', null, label, note ? h('div', { class: 'muted small', text: note }) : null),
      h('span', { class: 'ctl' }, h('input', {
        type: 'checkbox', class: 'switch', role: 'switch', 'aria-label': label, checked: cur()[key],
        onChange: (e) => { set({ [key]: e.target.checked }); app.audio?.sfx('ui_move'); },
      })));
    const touchSeg = () => {
      const wrap = h('div', { class: 'seg', role: 'group', 'aria-label': 'Touch controls' });
      for (const v of ['auto', 'on', 'off']) {
        wrap.append(h('button', { type: 'button', text: v, 'aria-pressed': String(cur().touchControls === v), onClick: () => {
          set({ touchControls: v });
          [...wrap.children].forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === v)));
        } }));
      }
      return h('div', { class: 'setting' }, h('span', { text: 'On-screen touch controls' }), h('span', { class: 'ctl' }, wrap));
    };
    const section = (t) => h('h3', { class: 'muted', style: { font: '700 .75em var(--mono)', letterSpacing: '.2em', textTransform: 'uppercase', margin: '1.2em 0 .2em' }, text: t });

    const body = h('div', null,
      section('Audio'),
      range('musicVolume', 'Music volume', { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }),
      range('sfxVolume', 'Sound effects volume', { min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }),
      toggle('muted', 'Mute all audio'),
      section('Accessibility'),
      range('textScale', 'Text size', { min: 0.85, max: 1.5, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` }),
      toggle('reducedMotion', 'Reduced motion', 'Fewer particles and flashes, simpler transitions, instant text.'),
      toggle('reducedShake', 'Reduced screen shake'),
      toggle('highContrast', 'High contrast interface'),
      toggle('skipSeenScenes', 'Offer to skip cinematics I have already seen'),
      touchSeg(),
      section('Intro'),
      h('div', { class: 'setting' }, h('span', { text: 'Opening sequence: Pixels & Peonies' }), h('span', { class: 'ctl' },
        h('button', { class: 'btn', type: 'button', text: 'Replay intro', onClick: () => { modal().closeAll(); hideMainMenu(); goTo('IntroScene', { replay: true }); } }))),
      section('Data'),
      h('div', { class: 'setting' }, h('span', null, 'Game progress', h('div', { class: 'muted small', text: 'Stages, fragments and story. Relationship answers are kept.' })), h('span', { class: 'ctl' },
        h('button', { class: 'btn pink', type: 'button', text: 'Reset game progress', onClick: async () => {
          const ok = await confirm({ title: 'Reset game progress?', body: 'This clears your saved stages, fragments and story progress. Your answers to the questions are NOT deleted.', confirmLabel: 'Reset progress', danger: true });
          if (!ok) return;
          app.progress.reset();
          app.bus.emit('toast', { kind: 'info', text: 'Game progress reset.' });
          if (mainEl) { hideMainMenu(); showMainMenu(); }
        } }))),
      h('div', { class: 'setting' }, h('span', null, 'Answers on this device', h('div', { class: 'muted small', text: 'Questionnaire answers stored only in this browser.' })), h('span', { class: 'ctl' },
        h('button', { class: 'btn pink', type: 'button', text: 'Delete device answers', onClick: async () => {
          const ok = await confirm({ title: 'Delete answers on this device?', body: 'This permanently removes the questionnaire answers stored in this browser. Answers saved to an account are not touched.', confirmLabel: 'Delete', danger: true });
          if (!ok) return;
          await app.answers?.clearDevice?.();
          app.bus.emit('toast', { kind: 'info', text: 'Device answers deleted.' });
        } }))),
      h('div', { class: 'setting' }, h('span', null, 'Account and partner', h('div', { class: 'muted small', text: 'Sign in, pair with your partner, manage shared answers.' })), h('span', { class: 'ctl' },
        h('button', { class: 'btn', type: 'button', text: 'Open account', onClick: () => app.ui.openAccount?.() }))));
    return modal().open({ title: 'Settings', wide: true, body, actions: [{ label: 'Close', kind: 'primary', value: 'close', autofocus: true }] }).result;
  }

  // ================================================================== controls
  function openControls() {
    const rows = [
      ['Move', ['A', 'D'], 'or ← →'],
      ['Jump', ['Space'], 'or W / ↑ — hold for a higher jump'],
      ['Attack', ['J'], 'or left mouse button'],
      ['Dash / dodge', ['K'], 'or Shift'],
      ['Interact / read', ['E'], ''],
      ['Drop through a ledge', ['S'], 'or ↓ while standing on it'],
      ['Pause', ['Esc'], ''],
      ['Confirm', ['Enter'], ''],
    ];
    const body = h('div', { class: 'stack' },
      h('table', { class: 'keys' }, h('tbody', null, rows.map(([a, keys, extra]) => h('tr', null,
        h('td', { text: a }), h('td', null, keys.map((k) => h('kbd', { text: k })), extra ? h('span', { class: 'muted', text: ` ${extra}` }) : null))))),
      h('p', { class: 'muted small', text: 'Touch: on-screen buttons appear automatically on phones and tablets (Settings → Touch controls).' }),
      h('div', { class: 'msg' }, h('b', { text: 'Mule: ' }), 'hold a direction to build skateboard speed. Tap Attack three times for a jab–cross–hook combo. Jump, then Attack in the air for a trick. Land on a rail to grind.'),
      h('div', { class: 'msg' }, h('b', { text: 'Princess: ' }), 'jump twice in the air. Attack fires a light pulse; every third one is a wide burst. Her dash slips through harm.'));
    return modal().open({ title: 'Controls', body, actions: [{ label: 'Close', kind: 'primary', value: 'close', autofocus: true }] }).result;
  }

  // =================================================================== credits
  function openCredits() {
    const body = h('div', { class: 'credits' },
      h('img', { class: 'title-img', style: { width: 'min(420px, 100%)' }, alt: 'MULE × PRINCESS', src: titleDataUrl(['MULE × PRINCESS'], { scale: 4 }) }),
      h('div', null, CREDITS.lines.map(([k, v]) => h('div', null, h('b', { text: `${k}: ` }), v))),
      h('p', { class: 'muted', style: { marginTop: '1.5em', fontStyle: 'italic' }, text: CREDITS.closing }));
    return modal().open({ title: CREDITS.studio, body, actions: [{ label: 'Close', kind: 'primary', value: 'close', autofocus: true }] }).result;
  }

  // ===================================================================== pause
  function showPause(scene) {
    if (pauseOpen || !scene || scene.finished || scene.frozen || scene.player?.dead) return;
    if (modal().isOpen || app.ui.dialogue.active) return;
    pauseOpen = true;
    scene.scene.pause();
    app.audio?.sfx('ui_back');
    let action = 'resume';
    let handle;
    const list = h('div', { class: 'pause-list' },
      h('button', { class: 'btn primary', type: 'button', text: 'Resume', 'data-autofocus': '1', onClick: () => handle.close('resume') }),
      h('button', { class: 'btn', type: 'button', text: 'Restart from checkpoint', onClick: () => { action = 'restart'; handle.close('restart'); } }),
      h('button', { class: 'btn', type: 'button', text: 'Controls', onClick: () => openControls() }),
      h('button', { class: 'btn', type: 'button', text: 'Settings', onClick: () => openSettings() }),
      h('button', { class: 'btn pink', type: 'button', text: 'Return to main menu', onClick: async () => {
        const ok = await confirm({ title: 'Return to the main menu?', body: 'Your progress up to the last checkpoint is saved. You can continue from the menu.', confirmLabel: 'Return to menu' });
        if (ok) { action = 'menu'; handle.close('menu'); }
      } }));
    arrowNav(list);
    handle = modal().open({
      title: 'Paused', narrow: true, body: list,
      onClose: () => {
        pauseOpen = false;
        scene.scene.resume();
        if (action === 'restart') scene.restartFromCheckpoint();
        else if (action === 'menu') scene.exitToMenu();
      },
    });
  }

  app.bus.on('pause:request', ({ scene }) => showPause(scene ?? app.currentLevel));

  return { confirm, showMainMenu, hideMainMenu, showCharacterSelect, hideCharacterSelect, openSettings, openControls, openCredits, showPause };
}

