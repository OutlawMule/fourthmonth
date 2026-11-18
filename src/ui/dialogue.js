// Dialogue box (typewriter, choices), narration captions and in-world speech/thought
// bubbles. All HTML so text stays crisp, scalable and screen-reader friendly.
import { h, clear } from './dom.js';
import { CHARACTERS } from '../data/characters.js';

const SPEAKER = {
  mule: { name: 'MULE', color: '#9B5CFF' },
  princess: { name: 'PRINCESS', color: '#FF72C6' },
  narrator: { name: '', color: '#43D9FF' },
};

export class Dialogue {
  constructor(root, app) {
    this.app = app;
    this.root = root;
    this.box = h('div', { class: 'dialogue', hidden: true, role: 'dialog', 'aria-live': 'polite', 'aria-label': 'Dialogue' });
    this.spk = h('div', { class: 'spk' });
    this.txt = h('div', { class: 'txt' });
    this.adv = h('div', { class: 'adv', text: 'ENTER ▸' });
    this.choicesEl = h('div', { class: 'choices' });
    this.box.append(this.spk, this.txt, this.choicesEl, this.adv);
    this.captionEl = h('div', { class: 'caption', hidden: true, role: 'status' });
    root.append(this.box, this.captionEl);
    this.active = false;
    this.token = 0;
    this.box.addEventListener('pointerdown', (e) => { if (!e.target.closest?.('.choices')) { e.preventDefault(); this.advance(); } });
    document.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  speakerInfo(who, name) {
    if (CHARACTERS[who]) return { name: name ?? CHARACTERS[who].short, color: SPEAKER[who]?.color ?? CHARACTERS[who].accent };
    return SPEAKER[who] ? { name: name ?? SPEAKER[who].name, color: SPEAKER[who].color } : { name: name ?? who ?? '', color: '#C8A7FF' };
  }

  /** lines: [{ who, text, name? }] or strings. Resolves when the last line is dismissed. */
  async say(lines, opts = {}) {
    const list = (Array.isArray(lines) ? lines : [lines]).map((l) => (typeof l === 'string' ? { who: 'narrator', text: l } : l));
    this.beginSession();
    for (const line of list) {
      if (!this.active) break;
      await this.showLine(line);
    }
    this.endSession();
    void opts;
  }

  beginSession() {
    if (!this.active) { this.active = true; this.app.input.block(); }
    this.box.hidden = false;
    this.choicesEl.hidden = true;
    clear(this.choicesEl);
  }

  endSession() {
    if (!this.active) return;
    this.active = false;
    this.box.hidden = true;
    this.token++;
    this.app.input.unblock();
  }

  showLine(line) {
    return new Promise((resolve) => {
      const info = this.speakerInfo(line.who, line.name);
      this.spk.textContent = info.name;
      this.spk.style.setProperty('--spk', info.color);
      this.spk.hidden = !info.name;
      this.box.style.borderColor = info.color;
      this.txt.textContent = '';
      this.adv.hidden = true;
      this.choicesEl.hidden = true;
      const token = ++this.token;
      const full = String(line.text ?? '');
      const instant = this.app.settings.get().reducedMotion;
      let i = 0;
      let timer = null;
      const finishTyping = () => {
        clearInterval(timer); timer = null;
        this.txt.textContent = full;
        this.adv.hidden = false;
        this.state = 'wait';
      };
      this.state = 'typing';
      this.finish = finishTyping;
      this.resolveLine = () => { resolve(); };
      if (instant || !full) finishTyping();
      else {
        timer = setInterval(() => {
          if (token !== this.token) { clearInterval(timer); return; }
          i += 1;
          this.txt.textContent = full.slice(0, i);
          if (full[i - 1] !== ' ') this.app.audio?.blip();
          if (i >= full.length) finishTyping();
        }, 22);
      }
    });
  }

  advance() {
    if (!this.active) return;
    if (this.state === 'typing') { this.finish?.(); return; }
    if (this.state === 'wait') { this.state = 'idle'; this.app.audio?.sfx('ui_move'); this.resolveLine?.(); }
  }

  onKey(e) {
    if (!this.active || this.state === 'choosing') return;
    if (['Enter', 'KeyE', 'Space'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.advance(); }
  }

  /** Fast-forward used by the cinematic skip button. */
  skipCurrent() {
    if (!this.active || this.state === 'choosing') return;
    this.finish?.();
    this.state = 'idle';
    this.resolveLine?.();
  }

  /**
   * Presents options. Resolves with the chosen option id, or null when cancelled.
   * choose({ who, text, options:[{id,label}], cancelLabel })
   */
  choose({ who = 'narrator', text = '', options, cancelLabel = null }) {
    return new Promise((resolve) => {
      this.beginSession();
      const info = this.speakerInfo(who);
      this.spk.textContent = info.name; this.spk.hidden = !info.name;
      this.spk.style.setProperty('--spk', info.color);
      this.txt.textContent = text;
      this.adv.hidden = true;
      this.state = 'choosing';
      clear(this.choicesEl);
      this.choicesEl.hidden = false;
      const done = (v) => { this.endSession(); resolve(v); };
      options.forEach((o) => this.choicesEl.append(h('button', { class: 'btn', type: 'button', text: o.label, disabled: o.disabled, onClick: () => { this.app.audio?.sfx('ui_ok'); done(o.id); } })));
      if (cancelLabel) this.choicesEl.append(h('button', { class: 'btn ghost', type: 'button', text: cancelLabel, onClick: () => { this.app.audio?.sfx('ui_back'); done(null); } }));
      queueMicrotask(() => this.choicesEl.querySelector('button:not([disabled])')?.focus());
      const onEsc = (e) => { if (e.key === 'Escape' && cancelLabel) { e.preventDefault(); e.stopPropagation(); document.removeEventListener('keydown', onEsc, true); done(null); } };
      document.addEventListener('keydown', onEsc, true);
      const arrows = (e) => {
        if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
        const items = [...this.choicesEl.querySelectorAll('button:not([disabled])')];
        const i = items.indexOf(document.activeElement);
        e.preventDefault();
        items[(i + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
      };
      this.choicesEl.addEventListener('keydown', arrows);
    });
  }

  caption(text) { this.captionEl.textContent = text; this.captionEl.hidden = false; }
  clearCaption() { this.captionEl.hidden = true; }
}

// ================================================================== world bubbles
export class Bubbles {
  constructor(root, app) { this.root = root; this.app = app; }

  /** Shows a bubble above `sprite` until the time runs out or the player taps/presses Enter. */
  show(scene, sprite, text, { kind = 'thought', ms = null, wait = null } = {}) {
    return new Promise((resolve) => {
      const el = h('div', { class: `bubble ${kind}`, role: 'status', text });
      this.root.append(el);
      let alive = true;
      const place = () => {
        if (!alive) return;
        try {
          const cam = scene.cameras.main;
          const rect = scene.game.canvas.getBoundingClientRect();
          const k = rect.width / cam.width;
          const top = sprite.getTopCenter();
          el.style.left = `${rect.left + (top.x - cam.scrollX) * k}px`;
          el.style.top = `${rect.top + (top.y - cam.scrollY) * k - 8}px`;
        } catch { /* scene gone */ }
        requestAnimationFrame(place);
      };
      place();
      const dur = ms ?? Math.max(1700, text.length * 55);
      const end = () => {
        if (!alive) return;
        alive = false;
        el.remove();
        window.removeEventListener('pointerdown', end, true);
        document.removeEventListener('keydown', onKey, true);
        resolve();
      };
      const onKey = (e) => { if (['Enter', 'KeyE', 'Space'].includes(e.code)) end(); };
      window.addEventListener('pointerdown', end, true);
      document.addEventListener('keydown', onKey, true);
      (wait ? wait(dur) : new Promise((r) => setTimeout(r, dur))).then(end);
    });
  }
}
