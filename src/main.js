import './styles.css';
import { app } from './app.js';
import { bus } from './game/EventBus.js';
import { input } from './game/systems/InputManager.js';
import { SettingsStore } from './ui/settingsStore.js';
import { ProgressManager } from './game/systems/ProgressManager.js';
import { AudioManager } from './game/systems/AudioManager.js';
import { UI } from './ui/ui.js';
import { createServices } from './services/index.js';
import { createGame } from './game/config.js';
import { goTo, startStage } from './game/sceneFlow.js';

function showFatal(message) {
  const note = document.getElementById('boot-note');
  if (note) note.textContent = message;
  const fill = document.getElementById('boot-bar-fill');
  if (fill) fill.style.background = '#ff4d6d';
}

function bindMouseAttack() {
  const host = document.getElementById('game');
  host.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button === 0 && input.gameplayActive) input.press('attack', 'mouse');
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') input.release('attack', 'mouse');
  });
}

function boot() {
  app.settings = new SettingsStore(bus);
  app.progress = new ProgressManager(bus);
  app.audio = new AudioManager(() => app.settings.get(), bus);
  app.audio.attachUnlockListeners();
  bus.on('settings:changed', () => app.audio.applySettings());
  app.startStage = startStage;
  app.goTo = goTo;

  // Auth, pairing, answers, progress sync, closing message. All of it works offline / as a guest.
  const services = createServices(app);
  app.auth = services.auth;
  app.relationship = services.relationship;
  app.answers = services.answers;
  app.sync = services.sync;
  app.closing = services.closing;

  input.attach(window);
  bindMouseAttack();
  app.ui = new UI(document.getElementById('ui-root'));

  // Leaving the tab while playing pauses the game instead of letting enemies keep hitting.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && app.currentLevel && !app.ui.modal.isOpen) bus.emit('pause:request', { scene: app.currentLevel });
  });

  app.game = createGame('game');
  // Phaser measures its parent when a resize event arrives, but phones often report the new window
  // size a moment later (rotation especially), which can leave the canvas at the old size. Measure
  // again shortly after every resize so the game always fits the screen.
  const refit = () => { for (const ms of [0, 120, 400]) setTimeout(() => app.game?.scale?.refresh(), ms); };
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);
  window.visualViewport?.addEventListener('resize', refit);
  app.auth.init();            // restores a saved session (if any); never blocks the game
  if (import.meta.env.DEV) window.__app = app; // handy in the browser console during development
}

try {
  boot();
} catch (err) {
  console.error('Game failed to start:', err?.message ?? err);
  showFatal('The game could not start. Please reload the page.');
}
