// Tiny dependency-free event emitter shared by Phaser scenes, HTML UI and services.
// Keeping it free of Phaser lets pure modules (ProgressManager, services) use it in tests.

export class EventBus {
  constructor() {
    this.map = new Map();
  }

  /** Subscribe. Returns an unsubscribe function (use it in scene shutdown handlers). */
  on(event, fn) {
    let set = this.map.get(event);
    if (!set) this.map.set(event, (set = new Set()));
    set.add(fn);
    return () => this.off(event, fn);
  }

  once(event, fn) {
    const off = this.on(event, (...args) => {
      off();
      fn(...args);
    });
    return off;
  }

  off(event, fn) {
    const set = this.map.get(event);
    if (!set) return;
    set.delete(fn);
    if (!set.size) this.map.delete(event);
  }

  emit(event, ...args) {
    const set = this.map.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (err) {
        // A listener must never be able to break the game loop.
        console.error(`[EventBus] listener for "${event}" failed:`, err?.message ?? err);
      }
    }
  }

  listenerCount(event) {
    return this.map.get(event)?.size ?? 0;
  }

  clear() {
    this.map.clear();
  }
}

/** One shared bus for the whole app. */
export const bus = new EventBus();
