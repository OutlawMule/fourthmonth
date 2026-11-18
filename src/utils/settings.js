// Audio + accessibility preferences. Pure: validated on load, no browser APIs.

export const DEFAULT_SETTINGS = Object.freeze({
  musicVolume: 0.6,
  sfxVolume: 0.8,
  muted: false,
  textScale: 1,            // 0.85 .. 1.5
  reducedMotion: false,
  reducedShake: false,
  highContrast: false,
  skipSeenScenes: true,    // offer to skip cinematics you have already watched
  touchControls: 'auto',   // 'auto' | 'on' | 'off'
  introSeen: false,
});

const clamp = (n, lo, hi, d) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);

export function sanitizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    musicVolume: clamp(r.musicVolume, 0, 1, d.musicVolume),
    sfxVolume: clamp(r.sfxVolume, 0, 1, d.sfxVolume),
    muted: bool(r.muted, d.muted),
    textScale: clamp(r.textScale, 0.85, 1.5, d.textScale),
    reducedMotion: bool(r.reducedMotion, d.reducedMotion),
    reducedShake: bool(r.reducedShake, d.reducedShake),
    highContrast: bool(r.highContrast, d.highContrast),
    skipSeenScenes: bool(r.skipSeenScenes, d.skipSeenScenes),
    touchControls: ['auto', 'on', 'off'].includes(r.touchControls) ? r.touchControls : d.touchControls,
    introSeen: bool(r.introSeen, d.introSeen),
  };
}
