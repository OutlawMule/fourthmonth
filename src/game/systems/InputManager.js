// One input layer for keyboard, mouse and touch. Gameplay reads *actions*
// (left/right/jump/attack/dash/interact/pause/confirm) rather than raw keys.
//
// - Page-scrolling keys are only prevented while gameplay is active and no HTML
//   overlay is open, so normal browser shortcuts and form typing keep working.
// - Typing in <input>/<textarea>/<select> never triggers game actions.
// - Releasing focus (window blur) releases every key so nothing sticks.

const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyW: 'jump', ArrowUp: 'jump',
  KeyS: 'down', ArrowDown: 'down',
  KeyJ: 'attack',
  KeyK: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash',
  KeyE: 'interact',
  Escape: 'pause',
  Enter: 'confirm',
};
const SCROLL_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function isTypingTarget(t) {
  if (!t || !t.tagName) return false;
  const tag = t.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable === true;
}

export class InputManager {
  constructor() {
    this.held = new Map();      // action -> Set of sources currently holding it
    this.queued = new Set();    // pressed since the last begin()
    this.queuedUp = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.gameplayActive = false;  // a level scene is running
    this.blockers = 0;            // open overlays (dialogue, modal, pause...)
    this.lastDevice = 'keyboard';
    this._onKeyDown = (e) => this.keyDown(e);
    this._onKeyUp = (e) => this.keyUp(e);
    this._onBlur = () => this.releaseAll();
    this._attached = false;
  }

  attach(target = window) {
    if (this._attached) return;
    this._attached = true;
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
  }

  detach(target = window) {
    target.removeEventListener('keydown', this._onKeyDown);
    target.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this._attached = false;
  }

  get blocked() { return this.blockers > 0; }
  block() { this.blockers++; this.releaseAll(); }
  unblock() { this.blockers = Math.max(0, this.blockers - 1); }
  setGameplayActive(v) { this.gameplayActive = v; if (!v) this.releaseAll(); }

  keyDown(e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    if (isTypingTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    if (this.gameplayActive && !this.blocked && SCROLL_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.lastDevice = 'keyboard';
    this.press(action, e.code);
  }

  keyUp(e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    this.release(action, e.code);
  }

  /** source: any string identifying who holds the action (a key code, 'touch:jump'...). */
  press(action, source = 'virtual') {
    if (this.blocked) return; // overlays swallow input; nothing may leak into the game
    let set = this.held.get(action);
    if (!set) this.held.set(action, (set = new Set()));
    if (!set.size) this.queued.add(action);
    set.add(source);
  }

  release(action, source = 'virtual') {
    const set = this.held.get(action);
    if (!set) return;
    set.delete(source);
    if (!set.size) { this.held.delete(action); this.queuedUp.add(action); }
  }

  /** Quick tap used for mouse clicks. */
  tap(action, ms = 90) {
    this.press(action, 'tap');
    setTimeout(() => this.release(action, 'tap'), ms);
  }

  releaseAll() {
    for (const [a] of this.held) this.queuedUp.add(a);
    this.held.clear();
  }

  /** Call once at the start of every gameplay update(). */
  begin() {
    this.justPressed = this.queued;
    this.justReleased = this.queuedUp;
    this.queued = new Set();
    this.queuedUp = new Set();
  }

  isDown(action) { return !this.blocked && this.held.has(action); }
  pressed(action) { return !this.blocked && this.justPressed.has(action); }
  released(action) { return this.justReleased.has(action); }

  /** -1, 0 or 1 */
  axis() { return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0); }
}

export const input = new InputManager();
