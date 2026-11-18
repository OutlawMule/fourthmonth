// Accessible modal dialogs: focus trap, Escape to close, focus restoration, and game
// input blocking (so typing in a form never moves the character).
import { h, focusables } from './dom.js';

export class ModalManager {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.stack = [];
    this.uid = 0;
    document.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get isOpen() { return this.stack.length > 0; }

  /**
   * open({ title, body, actions, wide, narrow, closable, onClose, className })
   * actions: [{ label, kind?, value?, onClick?(close), keepOpen?, autofocus? }]
   * Returns { el, close(value), result: Promise<value> }
   */
  open(opts) {
    const id = `modal-${++this.uid}`;
    const prevFocus = document.activeElement;
    let resolve;
    const result = new Promise((r) => { resolve = r; });
    const closable = opts.closable !== false;
    let closed = false;

    const close = (value = null) => {
      if (closed) return;
      closed = true;
      scrim.remove();
      this.stack = this.stack.filter((m) => m.id !== id);
      this.app.input.unblock();
      try { opts.onClose?.(value); } catch (err) { console.error('[modal] onClose handler failed:', err?.message ?? err); }
      resolve(value);
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
    };

    const head = h('div', { class: 'panel-head' },
      h('h2', { id: `${id}-t`, text: opts.title ?? '' }),
      closable ? h('button', { class: 'x-btn', type: 'button', 'aria-label': 'Close', text: '✕', onClick: () => close(null) }) : null);
    const body = h('div', { class: 'panel-body' }, opts.body);
    const foot = opts.actions?.length
      ? h('div', { class: 'panel-foot' }, opts.actions.map((a) => h('button', {
          class: `btn ${a.kind ?? ''}`, type: 'button', text: a.label, disabled: a.disabled,
          'data-autofocus': a.autofocus ? '1' : null,
          onClick: async () => {
            if (a.onClick) { const r = await a.onClick(close); if (r === false) return; }
            if (!a.keepOpen) close(a.value ?? a.label);
          },
        })))
      : null;
    const panel = h('div', { class: `panel ${opts.wide ? 'wide' : ''} ${opts.narrow ? 'narrow' : ''} ${opts.className ?? ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-t` }, head, body, foot);
    const scrim = h('div', { class: 'scrim', onPointerdown: (e) => { if (e.target === scrim && closable) close(null); } }, panel);
    this.root.append(scrim);
    this.app.input.block();
    this.stack.push({ id, close, panel, closable });

    queueMicrotask(() => {
      const af = panel.querySelector('[data-autofocus]') ?? panel.querySelector('.panel-foot .btn.primary') ?? focusables(panel).find((el) => !el.classList.contains('x-btn')) ?? panel;
      if (af === panel) panel.tabIndex = -1;
      af.focus?.();
    });
    return { el: panel, body, close, result };
  }

  onKey(e) {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    if (e.key === 'Escape' && top.closable) {
      const t = e.target;
      // let Escape leave a <select> without closing the dialog
      if (t?.tagName === 'SELECT') return;
      e.preventDefault(); e.stopPropagation();
      top.close(null);
      this.app.audio?.sfx('ui_back');
    } else if (e.key === 'Tab') {
      const items = focusables(top.panel);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !top.panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  closeAll() { for (const m of [...this.stack].reverse()) m.close(null); }
}
