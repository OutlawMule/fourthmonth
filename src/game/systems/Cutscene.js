// Promise-based helpers for scripted sequences. Every wait/tween can be fast-forwarded:
// calling skip() resolves pending waits immediately and snaps tweens to their end
// values, so a skipped cinematic always lands in exactly the same final state.
import { app } from '../../app.js';

const RESERVED = new Set(['targets', 'duration', 'ease', 'yoyo', 'repeat', 'delay', 'hold', 'onComplete', 'onUpdate', 'onStart', 'repeatDelay', 'paused', 'completeDelay', 'persist']);

export class Cutscene {
  constructor(scene) {
    this.scene = scene;
    this.skipping = false;
    this.waiters = new Set();
  }

  skip() {
    this.skipping = true;
    for (const w of [...this.waiters]) w();
    app.ui?.dialogue?.skipCurrent?.();
  }

  reset() {
    this.skipping = false;
    this.waiters.clear();
  }

  destroy() {
    this.skipping = true;
    for (const w of [...this.waiters]) w();
    this.waiters.clear();
  }

  wait(ms) {
    return new Promise((resolve) => {
      if (this.skipping) return resolve();
      let timer = null;
      const done = () => {
        this.waiters.delete(done);
        timer?.remove(false);
        resolve();
      };
      timer = this.scene.time.delayedCall(ms, done);
      this.waiters.add(done);
    });
  }

  applyEnd(config) {
    const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
    for (const t of targets) {
      if (!t) continue;
      for (const [k, v] of Object.entries(config)) {
        if (RESERVED.has(k)) continue;
        if (typeof v === 'number') t[k] = v;
        else if (v && typeof v === 'object' && 'to' in v && typeof v.to === 'number') t[k] = v.to;
        else if (typeof v === 'string' && /^[+-]=/.test(v)) t[k] = (t[k] ?? 0) + Number(v.slice(0, 1) + v.slice(2));
      }
    }
  }

  tween(config) {
    return new Promise((resolve) => {
      if (this.skipping) { this.applyEnd(config); config.onComplete?.(); return resolve(); }
      let tw = null;
      const finish = () => { this.waiters.delete(skipFn); resolve(); };
      const skipFn = () => { tw?.stop(); this.applyEnd(config); config.onComplete?.(); finish(); };
      tw = this.scene.tweens.add({ ...config, onComplete: () => { config.onComplete?.(); finish(); } });
      this.waiters.add(skipFn);
    });
  }

  /** Dialogue lines through the HTML dialogue box (auto-advances while skipping). */
  async say(lines, opts = {}) {
    if (this.skipping) return;
    await app.ui.dialogue.say(lines, opts);
  }

  /** A speech/thought bubble above a sprite; resolves when dismissed or timed out. */
  async bubble(sprite, text, { kind = 'thought', ms = 2200, color = null } = {}) {
    if (this.skipping) return;
    await app.ui.bubble.show(this.scene, sprite, text, { kind, ms, color, wait: (n) => this.wait(n) });
  }

  /** Narration strip at the bottom (not part of the canonical letter). */
  async caption(text, ms = 1800) {
    if (this.skipping) return;
    app.ui.dialogue.caption(text);
    await this.wait(ms);
    app.ui.dialogue.clearCaption();
  }
}
