// Scene switching that is safe from both Phaser code and HTML buttons: every other
// running/paused scene is stopped first, so listeners and timers are always released.
import { app } from '../app.js';
import { STAGES } from '../data/stages.js';

export function goTo(key, data = {}) {
  const game = app.game;
  if (!game) return;
  for (const sc of game.scene.getScenes(false)) {
    const k = sc.sys.settings.key;
    if (k === key) continue;
    if (sc.sys.isActive() || sc.sys.isPaused() || sc.sys.isSleeping()) game.scene.stop(k);
  }
  app.ui?.modal?.closeAll();
  game.scene.start(key, data);
}

export function startStage(id, data = {}) {
  const stage = STAGES[id];
  if (!stage) return;
  app.ui?.hideMainMenu?.();
  goTo(stage.scene, data);
}
