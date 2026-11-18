// Reactive settings (audio + accessibility). Persists through utils/storage.js and
// applies the visual ones (text size, contrast, reduced motion) straight to <html>.
import { loadSettings, saveSettings, readJSON, KEYS } from '../utils/storage.js';
import { sanitizeSettings } from '../utils/settings.js';

export class SettingsStore {
  constructor(bus) {
    this.bus = bus;
    const hadSaved = readJSON(KEYS.settings) != null;
    this.s = loadSettings();
    if (!hadSaved && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.s = { ...this.s, reducedMotion: true }; // honour the OS preference on first run
    }
    this.apply();
  }

  get() { return this.s; }

  set(patch) {
    this.s = sanitizeSettings({ ...this.s, ...patch });
    saveSettings(this.s);
    this.apply();
    this.bus.emit('settings:changed', this.s);
  }

  apply() {
    const root = document.documentElement;
    root.style.setProperty('--text-scale', String(this.s.textScale));
    root.classList.toggle('hc', this.s.highContrast);
    root.classList.toggle('reduced-motion', this.s.reducedMotion);
  }
}
