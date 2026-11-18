// Stage 04 - Learning Your World. A quiet street, a holographic gate that opens once four
// memory objects have been opened, a climb up the side of a building and the rooftop.
// Every memory object opens one category of the "learn about each other" questions - each
// question can be answered, skipped, or left for later. Reaching the bench at the far end
// of the roof starts the dawn and the ending (standard, or extended when everything
// optional has been found and answered).
import Phaser from 'phaser';
import { app, motionAllowed } from '../../app.js';
import { LevelScene } from './LevelScene.js';
import { STAGE4, STAGE4_META } from '../../data/levels/stage4.js';
import { CATEGORIES } from '../../data/questions.js';
import { DIALOGUE } from '../../data/memories.js';
import { extendedEndingStatus } from '../../utils/progress.js';
import { VIEW_W } from '../constants.js';

const GY = 214;
const OBJECT_COLORS = { affection: 0xff72c6, activities: 0x43d9ff, experiences: 0xffc857, communication: 0xc8a7ff, comfort: 0x9b5cff, memories: 0xffc857, learning: 0x43d9ff, hopes: 0xff72c6 };

export class LearningScene extends LevelScene {
  constructor() {
    super('LearningScene', 'stage4');
  }

  buildLevel() { return STAGE4; }

  // ------------------------------------------------------------------------- setup
  specialSetup() {
    this.objectSprites = new Map();
    this.need = this.stage.required.counters.memoryObjects;
    this.syncCounter();

    for (const o of this.spec.objects) this.placeObject(o);

    // the memory gate: holds the climb until enough objects are open
    const g = this.spec.gates[0];
    this.gate = null;
    if (this.run.counters.memoryObjects < this.need) {
      this.gate = this.addGate(g.x, GY, { w: 14, h: GY - g.y0 });
      this.addInteractable({
        x: g.x - 26, y: GY - 40, range: 46, rangeY: 80,
        enabled: () => !!this.gate && !this.gate.isOpen(),
        label: () => `Holo gate · ${this.run.counters.memoryObjects}/${this.need} memory objects open`,
        onInteract: () => this.talk([{ who: 'narrator', text: `The gate opens once ${this.need} memory objects are open. Each one holds a few questions: answer, skip, or just look. There are ${this.countObjectsOnStreet()} on this street.` }]),
      });
    }

    // the bench at the end of the roof
    const { x, y } = this.spec.anchors.dawn;
    this.benchGlow = this.add.image(x, y - 26, 'glow_pink').setBlendMode(Phaser.BlendModes.ADD).setDepth(0).setScale(2).setAlpha(0.18);
    this.addInteractable({
      x, y, range: 56, rangeY: 70,
      label: () => (this.stageComplete().complete ? 'Watch the dawn' : 'The bench'),
      onInteract: () => this.tryDawn(),
    });

    // gentle drifting lights on the rooftop
    if (motionAllowed()) {
      this.add.particles(0, 0, 'p_lav', {
        x: { min: 1800, max: this.spec.world.w }, y: { min: -480, max: -300 }, lifespan: { min: 3500, max: 6000 },
        speedX: { min: -6, max: 6 }, speedY: { min: -8, max: 2 }, scale: { start: 1, end: 0 }, alpha: { start: 0.8, end: 0 },
        frequency: 140, blendMode: 'ADD',
      }).setDepth(6);
    }
  }

  onStart(resumed) {
    if (!resumed) this.titleCard('STAGE 04', 'LEARNING YOUR WORLD');
    this.time.delayedCall(resumed ? 400 : 2800, () => app.bus.emit('toast', { kind: 'info', text: STAGE4_META.hint }));
  }

  countObjectsOnStreet() { return this.spec.objects.filter((o) => o.area === 'street').length; }

  // ------------------------------------------------------------- memory objects
  categoryFor(objectKey) { return CATEGORIES.find((c) => c.object === objectKey); }

  /** The "objects opened this run" counter that the stage rule (and the gate) read. */
  syncCounter() {
    const n = Object.keys(this.run.flags).filter((k) => k.startsWith('obj_') && this.run.flags[k]).length;
    this.run.counters.memoryObjects = n;
    return n;
  }

  isOpened(key) { return !!this.run.flags[`obj_${key}`]; }

  placeObject(o) {
    const cat = this.categoryFor(o.key);
    const opened = this.isOpened(o.key);
    const color = OBJECT_COLORS[o.key] ?? 0xc8a7ff;
    const s = this.add.sprite(o.x, o.y + 1, opened ? `mo_${o.key}_done` : `mo_${o.key}_0`).setOrigin(0.5, 1).setDepth(5);
    if (!opened && motionAllowed()) s.play(`mo_${o.key}`);
    const halo = this.add.image(o.x, o.y - 26, 'glow_lav').setBlendMode(Phaser.BlendModes.ADD).setDepth(4).setTint(color).setScale(1.1).setAlpha(opened ? 0.1 : 0.4);
    if (!opened && motionAllowed()) this.tweens.add({ targets: halo, alpha: 0.2, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.objectSprites.set(o.key, { s, halo });
    this.addInteractable({
      x: o.x, y: o.y - 14, range: 40, rangeY: 56,
      label: () => `${this.isOpened(o.key) ? 'Look again' : 'Open memory'}: ${cat?.title ?? o.key}`,
      onInteract: () => this.openObject(o, cat),
    });
  }

  async openObject(o, cat) {
    if (this.busy || this.finished || !cat) return;
    this.busy = true;
    const pm = app.progress;
    const first = !this.isOpened(o.key);
    this.frozen = true;
    this.promptText = null;
    this.emitHud();
    try {
      if (first) {
        this.run.flags[`obj_${o.key}`] = true;
        this.syncCounter();
        this.saveRun();
        if (pm.openObject(o.key) && pm.state.memoryObjects.length >= this.spec.objects.length) pm.grant('curious');
        app.audio?.sfx('fragment');
        this.fx.burst(o.x, o.y - 26, 'p_lav', 22, 110);
      }
      await app.ui.openCategory(cat.key, { source: 'object', objectKey: o.key });
      if (first) this.markOpened(o);
      this.checkGate();
    } finally {
      this.frozen = false;
      this.busy = false;
      this.emitHud();
    }
  }

  markOpened(o) {
    const ref = this.objectSprites.get(o.key);
    if (!ref) return;
    ref.s.anims.stop();
    ref.s.setTexture(`mo_${o.key}_done`);
    this.tweens.killTweensOf(ref.halo);
    ref.halo.setAlpha(0.1);
  }

  checkGate() {
    if (this.gate && !this.gate.isOpen() && this.run.counters.memoryObjects >= this.need) {
      this.gate.open();
      app.bus.emit('toast', { kind: 'info', text: 'The holo gate is open. The climb is next.' });
    }
  }

  // ------------------------------------------------------------------------- loop
  extraUpdate(time) {
    const p = this.player;
    if (!this.run.flags.rooftopReached && !p.dead && p.grounded && p.x > 1830 && p.y <= this.spec.anchors.dawn.y + 2) {
      this.setFlag('rooftopReached', true);
      app.bus.emit('toast', { kind: 'info', text: 'Rooftop reached. The bench is at the far end.' });
    }
    const ready = this.stageComplete().complete;
    this.benchGlow.setAlpha(ready ? 0.35 + Math.sin(time / 420) * 0.1 : 0.14);
  }

  // ------------------------------------------------------------------ dawn and ending
  async tryDawn() {
    if (this.busy || this.finished) return;
    this.busy = true;
    try {
      const st = this.stageComplete();
      if (!st.complete) {
        app.audio?.sfx('ui_back');
        await this.talk([{ who: 'narrator', text: `Not quite yet. Still needed: ${st.missing.join(', ')}.` }]);
        return;
      }
      await this.playDawn();
    } finally {
      this.busy = false;
    }
  }

  async playDawn() {
    const { x, y } = this.spec.anchors.dawn;
    const pm = app.progress;
    const me = pm.character, other = this.otherKey;
    app.audio?.soften(true);
    const fast = !motionAllowed();
    await this.cutscene(async (c) => {
      this.hidePlayer();
      await this.panTo(x - 30, y - 70, 900);
      // seated on the bench: seat top is 17 px above the roof, the sit pose hangs 14 px below the hip
      const seat = y - 3;
      const a = this.cast(me, x - 12, seat, 'sit');
      const b = this.cast(other, x + 12, seat, 'sit', true);
      this.playCast(a, 'sit'); this.playCast(b, 'sit');
      await c.wait(700);
      await c.caption(DIALOGUE.roofIntro ?? STAGE4_META.intro, 2400);

      // sunrise: the sky blends through its four stages while the music changes to "dawn"
      app.audio?.playMusic('dawn', { fade: 3 });
      const skies = [1, 2, 3].map((i) => this.add.image(0, 0, `bg_sky_roof_${i}`).setOrigin(0).setScrollFactor(0).setDepth(-99 + i * 0.01).setAlpha(0));
      const sun = this.add.image(VIEW_W * 0.62, 150, 'glow_warm').setOrigin(0.5).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(-60).setScale(0.2).setAlpha(0);
      this.tweens.add({ targets: sun, alpha: 0.85, scale: 5, duration: fast ? 1 : 11000, ease: 'Sine.easeIn' });
      const lines = ['The sky starts to change.', 'Somewhere below, the city is waking up.', 'A new day, and plenty left to learn about each other.'];
      for (let i = 0; i < skies.length; i++) {
        await Promise.all([
          c.tween({ targets: skies[i], alpha: 1, duration: fast ? 1 : 3600, ease: 'Sine.easeInOut' }),
          c.caption(lines[i], fast ? 400 : 3200),
        ]);
      }
      await c.wait(fast ? 100 : 900);
      this.playCast(a, 'sit_lean'); this.playCast(b, 'sit_lean');
      await c.wait(fast ? 100 : 1500);
    }, { key: 'dawn' });
    this.frozen = true;
    app.audio?.soften(false);
    await this.finishStage();
  }

  /** Stage 04 is the last stage: journal, then the ending screen, then back to the menu. */
  async finishStage() {
    if (this.finished) return;
    this.finished = true;
    this.frozen = true;
    const pm = app.progress;
    pm.finishStage(this.stageId);
    app.audio?.sfx('unlock');
    await app.ui.showJournal(this.stageId);
    const status = extendedEndingStatus(pm.state);
    const kind = status.ready ? 'extended' : 'standard';
    pm.finishGame(kind);
    if (status.ready) pm.grant('extended');
    await app.ui.showEnding({ kind, status });
    this.fadeTo('MainMenuScene', {}, 900);
  }
}
