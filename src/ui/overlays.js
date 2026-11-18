// Small always-available overlays: toasts, the cinematic letterbox + skip button, and
// on-screen touch controls. Pure HTML so they stay crisp at any window size.
import { h } from './dom.js';

// ------------------------------------------------------------------------- toasts
export class Toasts {
  constructor(root, app) {
    this.el = h('div', { class: 'toasts', 'aria-live': 'polite' });
    root.append(this.el);
    app.bus.on('toast', (t) => this.show(t));
  }

  show({ kind = 'info', text }) {
    if (!text) return;
    const el = h('div', { class: `toast ${kind}`, role: 'status', text });
    this.el.append(el);
    while (this.el.childElementCount > 4) this.el.firstChild.remove();
    setTimeout(() => el.remove(), 3300);
  }
}

// --------------------------------------------------------------------- cinematic UI
// Letterbox bars slide in during scripted scenes. A Skip button appears when skipping
// is allowed (scene already seen + "skip seen scenes" on, or an always-skippable scene).
export class CineControls {
  constructor(root, app) {
    this.app = app;
    this.top = h('div', { class: 'letterbox top', hidden: true });
    this.bottom = h('div', { class: 'letterbox bottom', hidden: true });
    this.btn = h('button', { class: 'btn cine-skip', type: 'button', text: 'Skip ▸', hidden: true, onClick: () => this.skip() });
    root.append(this.top, this.bottom, this.btn);
    this.active = false;
    this.canSkip = false;
    app.bus.on('cine:begin', ({ canSkip }) => this.begin(canSkip));
    app.bus.on('cine:end', () => this.end());
    document.addEventListener('keydown', (e) => {
      if (this.active && this.canSkip && e.key === 'Escape') { e.preventDefault(); this.skip(); }
    });
  }

  begin(canSkip) {
    this.active = true;
    this.canSkip = !!canSkip;
    this.top.hidden = this.bottom.hidden = false;
    this.btn.hidden = !canSkip;
  }

  end() {
    this.active = false;
    this.canSkip = false;
    this.top.hidden = this.bottom.hidden = this.btn.hidden = true;
  }

  skip() {
    this.app.audio?.sfx('ui_back');
    this.app.bus.emit('cine:skip');
  }
}

// ------------------------------------------------------------------- touch controls
export class TouchControls {
  constructor(root, app) {
    this.app = app;
    this.el = h('div', { class: 'touch', hidden: true, 'aria-hidden': 'true' });
    this.held = new Map(); // pointerId -> action
    const mk = (action, label, cls = '') => {
      const b = h('button', { class: `tbtn ${cls}`, type: 'button', tabindex: '-1', text: label, 'aria-label': action });
      const down = (e) => {
        e.preventDefault();
        try { b.setPointerCapture?.(e.pointerId); } catch { /* the finger may already have lifted */ }
        b.classList.add('down');
        this.held.set(e.pointerId, action);
        app.input.press(action, `touch:${e.pointerId}`);
        app.input.lastDevice = 'touch';
      };
      const up = (e) => {
        if (!this.held.has(e.pointerId)) return;
        this.held.delete(e.pointerId);
        b.classList.remove('down');
        app.input.release(action, `touch:${e.pointerId}`);
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };
    this.el.append(
      h('div', { class: 'grp l' }, mk('left', '◀', 'big'), mk('right', '▶', 'big')),
      h('div', { class: 'grp r' }, mk('attack', 'HIT'), mk('dash', 'DASH', 'sm'), mk('interact', 'USE', 'sm'), mk('jump', 'JUMP', 'big')));
    root.append(this.el);
    this.inLevel = false;
    app.bus.on('hud:update', () => { this.inLevel = true; this.refresh(); });
    app.bus.on('hud:hide', () => { this.inLevel = false; this.refresh(); });
    app.bus.on('settings:changed', () => this.refresh());
  }

  wanted() {
    const mode = this.app.settings.get().touchControls;
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  }

  refresh() {
    const show = this.inLevel && this.wanted();
    this.el.hidden = !show;
    // On a phone held upright the game only uses a thin strip of the screen. Say so, once per visit.
    if (show && !this.tipShown && typeof matchMedia === 'function' && matchMedia('(orientation: portrait)').matches) {
      this.tipShown = true;
      this.app.bus.emit('toast', { kind: 'info', text: 'Tip: turn your phone sideways for a bigger view.' });
    }
  }
}
