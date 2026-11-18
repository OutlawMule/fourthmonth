// Application singleton. main.js fills it in before Phaser starts; scenes and UI import
// `app` instead of passing a dozen references around. Keeps services decoupled from
// Phaser while giving every layer one obvious place to look.
import { bus } from './game/EventBus.js';
import { input } from './game/systems/InputManager.js';

export const app = {
  bus,
  input,
  settings: null,      // SettingsStore (src/ui/settingsStore.js)
  progress: null,      // ProgressManager
  audio: null,         // AudioManager
  ui: null,            // UI facade (HUD, dialogue, modals, menus)
  game: null,          // Phaser.Game
  auth: null,          // auth facade (works as a no-op when Supabase is not configured)
  answers: null,       // answer service (device storage, or the shared database)
  relationship: null,  // pairing + relationship space
  sync: null,          // game-progress sync with the account
  closing: null,       // editable closing message
  currentLevel: null,  // the running LevelScene, if any
  startStage: null,    // (stageId, data) => void   set in main.js
  goTo: null,          // (sceneKey, data) => void  set in main.js
  version: '1.0.0',
};

/** Convenience used by scenes: respects the reduced-motion / reduced-shake settings. */
export function motionAllowed() {
  return !app.settings?.get().reducedMotion;
}
export function shakeAllowed() {
  const s = app.settings?.get();
  return !(s?.reducedShake || s?.reducedMotion);
}
