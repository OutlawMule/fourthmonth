// In-game HUD (HTML): health, character icon, stage, objective, collectibles,
// combo, interaction prompt, pause button and the memory-fragment toast.
import { h, clear, canvasFromAtlasFrame } from './dom.js';
import { ART } from '../game/art/pixel.js';
import { CHARACTERS } from '../data/characters.js';

export class Hud {
  constructor(root, app) {
    this.app = app;
    this.el = h('div', { class: 'hud', hidden: true });
    this.face = null;
    this.faceKey = null;
    this.pips = h('div', { class: 'pips', role: 'img' });
    this.stage = h('div', { class: 'hud-stage' });
    this.obj = h('div', { class: 'hud-obj', role: 'status', 'aria-live': 'polite' });
    this.stats = h('div', { class: 'hud-stats' });
    this.faceWrap = h('div');
    this.prompt = h('div', { class: 'prompt', hidden: true });
    const pause = h('button', { class: 'hud-btn', type: 'button', 'aria-label': 'Pause', text: 'II', onClick: () => this.app.bus.emit('pause:request', { scene: this.app.currentLevel }) });
    this.el.append(
      h('div', { class: 'hud-top' },
        h('div', { class: 'hud-left' }, this.faceWrap, this.pips),
        h('div', { class: 'hud-mid' }, this.stage, this.obj),
        h('div', { class: 'hud-right' }, this.stats, pause)),
      this.prompt);
    root.append(this.el);
    app.bus.on('hud:update', (d) => this.render(d));
    app.bus.on('hud:hide', () => { this.el.hidden = true; });
    app.bus.on('fragment:toast', (t) => this.fragmentToast(t));
  }

  show() { this.el.hidden = false; }

  render(d) {
    this.el.hidden = false;
    const accent = CHARACTERS[d.character]?.accent ?? '#9B5CFF';
    this.el.style.setProperty('--accent', accent);
    if (this.faceKey !== d.character) {
      this.faceKey = d.character;
      clear(this.faceWrap);
      this.face = canvasFromAtlasFrame(ART.get(d.character), 'idle_0', 44, 44, { x: 8, y: 6, w: 32, h: 32 });
      this.face.className = 'hud-face';
      this.faceWrap.append(this.face);
    }
    // health pips
    if (this.pips.childElementCount !== d.maxHp) {
      clear(this.pips);
      for (let i = 0; i < d.maxHp; i++) this.pips.append(h('span', { class: 'pip' }));
    }
    [...this.pips.children].forEach((p, i) => p.classList.toggle('off', i >= d.hp));
    this.pips.setAttribute('aria-label', `Health ${d.hp} of ${d.maxHp}`);

    this.stage.textContent = `STAGE 0${d.stageNumber}  ·  ${d.stageTitle}`;
    this.obj.textContent = d.objective ?? '';

    clear(this.stats);
    const row = (cls, text) => this.stats.append(h('div', { class: `s ${cls}`, text }));
    if (d.fragments?.need) row('c-frag', `◆ FRAGMENTS ${d.fragments.have}/${d.fragments.need}${d.fragments.optTotal ? `  +${d.fragments.optHave}/${d.fragments.optTotal}` : ''}`);
    else if (d.fragments?.optTotal) row('c-frag', `◆ BONUS ${d.fragments.optHave}/${d.fragments.optTotal}`);
    if (d.defeats) row('c-def', `⚡ LIGHTWORK ${d.defeats.have}/${d.defeats.need}`);
    row('c-chip', `▣ CHIPS ${d.chips}   SCORE ${d.score}`);
    if (d.combo) row('c-combo', `COMBO ×${d.combo.mult}  (${d.combo.n})`);

    this.prompt.hidden = !d.prompt;
    if (d.prompt) this.prompt.textContent = d.prompt;
  }

  fragmentToast(t) {
    const el = h('div', { class: 'frag-toast', role: 'status' },
      h('div', { class: 't', text: t.required === false ? 'Bonus memory fragment' : 'Memory fragment found' }),
      h('div', { class: 'l', text: t.label }),
      t.excerpt ? h('div', { class: 'q', text: `“${t.excerpt}”` }) : null);
    this.el.append(el);
    setTimeout(() => el.remove(), 3700);
  }
}
