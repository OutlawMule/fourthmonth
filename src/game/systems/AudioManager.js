// Procedural audio: no audio files required. Web Audio synthesises every sound effect
// and a small step-sequencer plays original music per location. Optional audio files
// can be registered later (see FILE_TRACKS) and take over automatically when present.
//
// Browser autoplay rules: the AudioContext is only created/resumed after a user
// gesture (click, key, touch). Anything requested earlier is queued and starts then.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz
const A = { A1: 33, C2: 36, D2: 38, E2: 40, F2: 41, G2: 43, A2: 45, C3: 48, D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59, C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, G5: 79, A5: 81, C6: 84 };

/** Drop-in music files. Fill this in to replace the procedural music for a track. */
export const FILE_TRACKS = {
  // drag: 'assets/audio/drag.mp3',
  // park: 'assets/audio/park.mp3',
};

const TRACKS = {
  menu: { bpm: 84, root: A.A2, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [0, 0, 0, 0], arp: [0, 2, 4, 2], drums: false, pad: 0.05, arpVol: 0.035 },
  drag: { bpm: 126, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bassRoots: [33, 29, 36, 31], drums: true, pad: 0.035, arpVol: 0.045 },
  park: { bpm: 74, chords: [[53, 57, 60], [55, 59, 62], [57, 60, 64], [52, 55, 59]], drums: false, pad: 0.05, arpVol: 0.05, soft: true, crickets: true },
  night: { bpm: 62, chords: [[45, 52, 57], [41, 48, 53], [43, 50, 55], [40, 47, 52]], drums: false, pad: 0.06, arpVol: 0.03, soft: true, bells: true },
  roof: { bpm: 68, chords: [[60, 64, 67], [67, 71, 74], [57, 60, 64], [65, 69, 72]], drums: false, pad: 0.05, arpVol: 0.05, soft: true, melody: true },
  dawn: { bpm: 66, chords: [[60, 64, 67], [65, 69, 72], [67, 71, 74], [57, 60, 64]], drums: false, pad: 0.055, arpVol: 0.055, soft: true, melody: true, bright: true },
  intro_hum: { bpm: 60, chords: [[33, 40, 45]], drums: false, pad: 0.05, arpVol: 0, hum: true },
  intro_romance: { bpm: 64, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], drums: false, pad: 0.05, arpVol: 0.05, soft: true, melody: true },
};

export class AudioManager {
  constructor(getSettings, bus) {
    this.getSettings = getSettings;
    this.bus = bus;
    this.ctx = null;
    this.unlocked = false;
    this.pendingTrack = null;
    this.track = null;
    this.trackName = null;
    this.timer = null;
    this.nextStep = 0;
    this.stepIdx = 0;
    this.loops = {};
    this.files = new Map();
    this.lastBlip = 0;
  }

  // ---------------------------------------------------------------- setup
  attachUnlockListeners() {
    const go = () => {
      this.unlock();
      if (this.unlocked) for (const e of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(e, go, true);
    };
    for (const e of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(e, go, true);
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.comp = this.ctx.createDynamicsCompressor();
        this.musicGain.connect(this.master);
        this.sfxGain.connect(this.master);
        this.master.connect(this.comp);
        this.comp.connect(this.ctx.destination);
        // shared noise buffer
        const len = this.ctx.sampleRate * 1;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applySettings();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      this.unlocked = this.ctx.state !== 'closed';
      if (this.unlocked && this.pendingTrack) {
        const t = this.pendingTrack;
        this.pendingTrack = null;
        this.playMusic(t.name, t.opts);
      }
    } catch {
      /* audio is optional: never block the game */
    }
  }

  applySettings() {
    if (!this.ctx) return;
    const s = this.getSettings();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 1, t, 0.05);
    this.musicGain.gain.setTargetAtTime(s.musicVolume * 0.55, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(s.sfxVolume * 0.8, t, 0.05);
  }

  // --------------------------------------------------------------- voices
  _env(g, t, dur, vol, attack = 0.005, release = 0.05) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
  }

  tone({ type = 'square', freq = 440, to = null, t = null, dur = 0.15, vol = 0.2, attack = 0.005, release = 0.06, dest = null, detune = 0, lp = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    t = t ?? c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    o.detune.value = detune;
    this._env(g, t, dur, vol, attack, release);
    let node = o;
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
    node.connect(g);
    g.connect(dest ?? this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ t = null, dur = 0.1, vol = 0.2, type = 'lowpass', freq = 1000, to = null, q = 1, dest = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    t = t ?? c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    this._env(g, t, dur, vol, 0.003, Math.min(0.06, dur / 2));
    s.connect(f); f.connect(g); g.connect(dest ?? this.sfxGain);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- sfx
  sfx(name, opt = {}) {
    if (!this.ctx || !this.unlocked) return;
    const s = this.getSettings();
    if (s.muted || s.sfxVolume <= 0) return;
    const f = SFX[name];
    if (f) { try { f(this, opt); } catch { /* ignore */ } }
  }

  blip() { // dialogue typewriter tick, rate limited
    const now = performance.now();
    if (now - this.lastBlip < 45) return;
    this.lastBlip = now;
    this.sfx('blip');
  }

  /** Start/stop/update a continuous loop: skate roll, grind, engine, rain... */
  loop(name, level) {
    if (!this.ctx || !this.unlocked) return;
    let l = this.loops[name];
    if (level <= 0.01) {
      if (l) { l.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05); l.stopAt = this.ctx.currentTime + 0.4; }
      return;
    }
    if (!l || (l.stopAt && l.stopAt < this.ctx.currentTime)) {
      const c = this.ctx;
      const g = c.createGain(); g.gain.value = 0.0001;
      let src;
      const f = c.createBiquadFilter();
      if (name === 'engine') {
        src = c.createOscillator(); src.type = 'sawtooth'; src.frequency.value = 52;
        f.type = 'lowpass'; f.frequency.value = 220;
      } else {
        src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
        f.type = name === 'grind' ? 'highpass' : name === 'rain' ? 'highpass' : 'bandpass';
        f.frequency.value = name === 'grind' ? 2600 : name === 'rain' ? 1800 : 500;
      }
      src.connect(f); f.connect(g); g.connect(name === 'rain' ? this.musicGain : this.sfxGain);
      src.start();
      l = this.loops[name] = { src, gain: g, filter: f, stopAt: 0 };
    }
    l.stopAt = 0;
    const base = { skate: 0.16, grind: 0.1, engine: 0.12, rain: 0.05 }[name] ?? 0.1;
    l.gain.gain.setTargetAtTime(base * Math.min(1, level), this.ctx.currentTime, 0.08);
    if (name === 'skate') l.filter.frequency.setTargetAtTime(350 + level * 900, this.ctx.currentTime, 0.1);
    if (name === 'engine') l.src.frequency.setTargetAtTime(48 + level * 70, this.ctx.currentTime, 0.2);
  }

  stopLoops() { for (const n of Object.keys(this.loops)) this.loop(n, 0); }

  // -------------------------------------------------------------- music
  playMusic(name, opts = {}) {
    if (!TRACKS[name]) return;
    if (this.trackName === name && this.timer) return;
    if (!this.ctx || !this.unlocked) { this.pendingTrack = { name, opts }; this.trackName = null; return; }
    this.stopMusic(opts.fade ?? 0.6);
    this.trackName = name;
    this.track = TRACKS[name];
    this.stepIdx = 0;
    this.nextStep = this.ctx.currentTime + 0.12;
    const fileUrl = FILE_TRACKS[name];
    if (fileUrl) this._playFile(name, fileUrl);
    this.timer = setInterval(() => this._schedule(), 30);
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    const s = this.getSettings();
    this.musicGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(s.musicVolume * 0.55, this.ctx.currentTime + (opts.fade ?? 0.6));
  }

  async _playFile(name, url) {
    try {
      if (!this.files.has(name)) {
        const buf = await (await fetch(url)).arrayBuffer();
        this.files.set(name, await this.ctx.decodeAudioData(buf));
      }
      if (this.trackName !== name) return;
      clearInterval(this.timer); this.timer = null;
      const src = this.ctx.createBufferSource();
      src.buffer = this.files.get(name); src.loop = true;
      src.connect(this.musicGain); src.start();
      this.fileSrc = src;
    } catch { /* missing file: procedural music keeps playing */ }
  }

  /** Smoothly lowers (or restores) the music for quiet story moments. */
  soften(on = true, secs = 1.4) {
    if (!this.ctx || !this.unlocked) return;
    const s = this.getSettings();
    const level = s.muted ? 0.0001 : Math.max(0.0001, s.musicVolume * 0.55 * (on ? 0.4 : 1));
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
    this.musicGain.gain.linearRampToValueAtTime(level, t + secs);
  }

  stopMusic(fade = 0.4) {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.pendingTrack = null;
    if (this.fileSrc) { try { this.fileSrc.stop(); } catch { /* */ } this.fileSrc = null; }
    this.trackName = null;
    this.track = null;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
      this.musicGain.gain.linearRampToValueAtTime(0.0001, t + fade);
    }
  }

  _schedule() {
    if (!this.ctx || !this.track) return;
    const tr = this.track;
    const stepDur = 60 / tr.bpm / 4; // 16th notes
    while (this.nextStep < this.ctx.currentTime + 0.15) {
      this._step(tr, this.stepIdx, this.nextStep, stepDur);
      this.nextStep += stepDur;
      this.stepIdx++;
    }
  }

  _step(tr, i, t, sd) {
    const s = i % 16, bar = Math.floor(i / 16), chord = tr.chords[bar % tr.chords.length];
    const dest = this.musicGain;
    if (tr.hum) {
      if (s === 0 && bar % 2 === 0) {
        this.tone({ type: 'sine', freq: 55, t, dur: sd * 32, vol: 0.12, attack: 1.2, release: 1.2, dest });
        this.tone({ type: 'sine', freq: 110.5, t, dur: sd * 32, vol: 0.05, attack: 1.4, release: 1.2, dest });
      }
      if (Math.random() < 0.04) this.tone({ type: 'square', freq: 2000 + Math.random() * 3000, t, dur: 0.02, vol: 0.015, dest });
      return;
    }
    // pad: a chord per bar
    if (s === 0) for (const n of chord) this.tone({ type: tr.soft ? 'sine' : 'sawtooth', freq: NOTE(n), t, dur: sd * 16, vol: tr.pad, attack: 0.5, release: 0.6, dest, lp: tr.soft ? null : 900, detune: Math.random() * 8 - 4 });
    if (tr.drums) {
      if (s % 4 === 0) { this.tone({ type: 'sine', freq: 130, to: 42, t, dur: 0.16, vol: 0.28, dest }); }
      if (s === 4 || s === 12) this.noise({ t, dur: 0.12, vol: 0.12, type: 'bandpass', freq: 1800, q: 0.8, dest });
      if (s % 2 === 1) this.noise({ t, dur: 0.03, vol: 0.05, type: 'highpass', freq: 7000, dest });
      const root = tr.bassRoots[bar % tr.bassRoots.length];
      if (s % 2 === 0) this.tone({ type: 'sawtooth', freq: NOTE(root + (s % 8 === 6 ? 12 : 0)), t, dur: sd * 1.6, vol: 0.07, release: 0.05, dest, lp: 520 });
    }
    // arpeggio
    if (tr.arpVol && (tr.drums ? s % 2 === 0 : s % 4 === 0)) {
      const seq = [0, 1, 2, 1, 2, 1, 0, 1];
      const n = chord[seq[(s >> (tr.drums ? 1 : 2)) % seq.length] % chord.length] + (tr.drums ? 12 : 12);
      this.tone({ type: tr.soft ? 'triangle' : 'square', freq: NOTE(n), t, dur: sd * (tr.soft ? 4 : 1.4), vol: tr.arpVol, release: tr.soft ? 0.25 : 0.04, dest, lp: tr.soft ? null : 2400 });
    }
    if (tr.melody && (s === 0 || s === 6 || s === 10) && Math.random() < 0.85) {
      const n = chord[(s / 2 + bar) % chord.length | 0] + 24;
      this.tone({ type: 'triangle', freq: NOTE(n), t, dur: sd * 6, vol: tr.bright ? 0.06 : 0.045, attack: 0.01, release: 0.5, dest });
    }
    if (tr.bells && s % 8 === 4 && Math.random() < 0.5) {
      this.tone({ type: 'sine', freq: NOTE(chord[2] + 24), t, dur: 1.2, vol: 0.03, attack: 0.005, release: 1.0, dest });
    }
    if (tr.crickets && s % 2 === 0 && Math.random() < 0.3) {
      this.noise({ t, dur: 0.02, vol: 0.012, type: 'bandpass', freq: 5200, q: 8, dest });
    }
  }
}

// --------------------------------------------------------------------------- sfx table
const SFX = {
  jump: (a) => a.tone({ type: 'square', freq: 260, to: 520, dur: 0.12, vol: 0.12 }),
  doublejump: (a) => a.tone({ type: 'triangle', freq: 420, to: 880, dur: 0.14, vol: 0.14 }),
  land: (a) => a.noise({ dur: 0.07, vol: 0.12, freq: 500, to: 120 }),
  punch: (a) => { a.noise({ dur: 0.07, vol: 0.16, type: 'bandpass', freq: 1500, to: 500 }); a.tone({ type: 'sine', freq: 160, to: 60, dur: 0.1, vol: 0.2 }); },
  whoosh: (a) => a.noise({ dur: 0.1, vol: 0.07, type: 'bandpass', freq: 600, to: 2200 }),
  hit: (a) => { a.noise({ dur: 0.09, vol: 0.2, freq: 3000, to: 300 }); a.tone({ type: 'sawtooth', freq: 300, to: 90, dur: 0.12, vol: 0.12 }); },
  hurt: (a) => a.tone({ type: 'sawtooth', freq: 420, to: 110, dur: 0.22, vol: 0.18, lp: 1600 }),
  dash: (a) => a.noise({ dur: 0.16, vol: 0.12, type: 'highpass', freq: 800, to: 4000 }),
  slip: (a) => { a.tone({ type: 'sine', freq: 1200, to: 300, dur: 0.16, vol: 0.12 }); a.noise({ dur: 0.1, vol: 0.05, type: 'highpass', freq: 3000 }); },
  pulse: (a) => { a.tone({ type: 'sine', freq: 1000, to: 320, dur: 0.14, vol: 0.14 }); a.tone({ type: 'triangle', freq: 1500, to: 500, dur: 0.1, vol: 0.06 }); },
  burst: (a) => { a.tone({ type: 'sawtooth', freq: 700, to: 150, dur: 0.22, vol: 0.14, lp: 2000 }); a.noise({ dur: 0.15, vol: 0.1, type: 'bandpass', freq: 2500, to: 400 }); },
  enemy_die: (a) => { a.tone({ type: 'sawtooth', freq: 500, to: 50, dur: 0.35, vol: 0.14, lp: 1200 }); a.noise({ dur: 0.25, vol: 0.1, type: 'highpass', freq: 5000, to: 800 }); },
  enemy_windup: (a) => a.tone({ type: 'square', freq: 220, to: 330, dur: 0.18, vol: 0.06 }),
  collect: (a) => { const t = a.ctx.currentTime; a.tone({ type: 'square', freq: 880, t, dur: 0.07, vol: 0.1 }); a.tone({ type: 'square', freq: 1320, t: t + 0.07, dur: 0.1, vol: 0.1 }); },
  heal: (a) => { const t = a.ctx.currentTime; [523, 659, 784].forEach((f, i) => a.tone({ type: 'triangle', freq: f, t: t + i * 0.06, dur: 0.14, vol: 0.12 })); },
  fragment: (a) => { const t = a.ctx.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => { a.tone({ type: 'sine', freq: f, t: t + i * 0.07, dur: 0.5, vol: 0.12, release: 0.4 }); a.tone({ type: 'triangle', freq: f * 2, t: t + i * 0.07, dur: 0.3, vol: 0.04 }); }); },
  unlock: (a) => { const t = a.ctx.currentTime; [262, 330, 392, 523].forEach((f) => a.tone({ type: 'sawtooth', freq: f, t, dur: 1.2, vol: 0.06, attack: 0.15, release: 0.9, lp: 1800 })); a.tone({ type: 'sine', freq: 1047, t: t + 0.4, dur: 0.9, vol: 0.1 }); },
  checkpoint: (a) => { const t = a.ctx.currentTime; a.tone({ type: 'sine', freq: 660, t, dur: 0.25, vol: 0.12 }); a.tone({ type: 'sine', freq: 990, t: t + 0.12, dur: 0.35, vol: 0.12 }); },
  trick: (a) => a.tone({ type: 'triangle', freq: 500, to: 1600, dur: 0.22, vol: 0.12 }),
  mount: (a) => { a.noise({ dur: 0.05, vol: 0.1, freq: 900 }); a.tone({ type: 'square', freq: 180, to: 120, dur: 0.06, vol: 0.08 }); },
  rail: (a) => a.noise({ dur: 0.12, vol: 0.1, type: 'highpass', freq: 3000 }),
  ui_move: (a) => a.tone({ type: 'square', freq: 660, dur: 0.035, vol: 0.05 }),
  ui_ok: (a) => { const t = a.ctx.currentTime; a.tone({ type: 'square', freq: 700, t, dur: 0.05, vol: 0.07 }); a.tone({ type: 'square', freq: 1050, t: t + 0.05, dur: 0.08, vol: 0.07 }); },
  ui_back: (a) => a.tone({ type: 'square', freq: 520, to: 330, dur: 0.09, vol: 0.06 }),
  blip: (a) => a.tone({ type: 'square', freq: 520 + Math.random() * 120, dur: 0.03, vol: 0.035 }),
  car_door: (a) => { a.noise({ dur: 0.08, vol: 0.18, freq: 700, to: 200 }); a.tone({ type: 'sine', freq: 110, to: 70, dur: 0.12, vol: 0.14 }); },
  glitch: (a) => { a.noise({ dur: 0.07, vol: 0.1, type: 'bandpass', freq: 3500, q: 3 }); a.tone({ type: 'square', freq: 90 + Math.random() * 400, dur: 0.05, vol: 0.06 }); },
  scan: (a) => a.tone({ type: 'sine', freq: 200, to: 1800, dur: 1.2, vol: 0.05, attack: 0.3, release: 0.5 }),
  whoosh_long: (a) => a.noise({ dur: 1.4, vol: 0.14, type: 'bandpass', freq: 300, to: 3500, q: 0.6 }),
  zap: (a) => { a.noise({ dur: 0.14, vol: 0.12, type: 'highpass', freq: 4000 }); a.tone({ type: 'sawtooth', freq: 140, dur: 0.14, vol: 0.08 }); },
  thump: (a) => a.tone({ type: 'sine', freq: 90, to: 45, dur: 0.14, vol: 0.2 }),
};
