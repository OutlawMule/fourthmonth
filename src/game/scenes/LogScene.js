// Stage 02 - The Log (city park). Gather the conversation fragments, find the log, sit
// down together and pick prompts to talk about (answer, skip, or just sit), then the
// time-skip montage. Prompts are optional and never required to be answered; only
// reaching the log and letting the time pass completes the stage.
import Phaser from 'phaser';
import { app, motionAllowed } from '../../app.js';
import { LevelScene } from './LevelScene.js';
import { STAGE2, STAGE2_META } from '../../data/levels/stage2.js';
import { DIALOGUE } from '../../data/memories.js';
import { VIEW_W, VIEW_H } from '../constants.js';
import { pixelText, pixelTextKey } from '../systems/pixelText.js';
import { tex } from '../art/common.js';
import { disc, glow, px } from '../art/pixel.js';

const SEAT_Y = 203; // sprite origin so that a seated character rests on top of the log
const CLOCK = ['11:48 PM', '12:20 AM', '12:51 AM', '1:17 AM', '1:46 AM', '2:30 AM', '3:12 AM'];
const CAPTIONS = ['Time passes.', 'The park gets quieter.', 'The night keeps going.', 'The conversation does too.'];

export class LogScene extends LevelScene {
  constructor() {
    super('LogScene', 'stage2');
  }

  buildLevel() { return STAGE2; }

  specialSetup() {
    this.pondTiles = (this.spec.ponds ?? []).map((p) => this.add.tileSprite(p.x, 216, p.w, 54, 'pond_0').setOrigin(0).setDepth(1));
    for (const p of this.spec.ponds ?? []) {
      for (let x = p.x + 18; x < p.x + p.w - 12; x += 52) {
        const l = this.add.sprite(x, 217, 'lily_0').setOrigin(0.5, 1).setDepth(1.5);
        l.play('lily');
      }
    }
    if (motionAllowed()) {
      // fireflies
      this.add.particles(0, 0, 'p_warm', {
        x: { min: 0, max: this.spec.world.w }, y: { min: 70, max: 205 }, lifespan: { min: 3000, max: 5200 },
        speedX: { min: -8, max: 8 }, speedY: { min: -10, max: 6 }, scale: { start: 1, end: 0 }, alpha: { start: 0.95, end: 0 },
        frequency: 55, blendMode: 'ADD',
      }).setDepth(6);
    }
    const { x, y } = this.spec.anchors.log;
    this.logMarker = this.add.image(x, y - 54, 'glow_lav').setBlendMode(Phaser.BlendModes.ADD).setDepth(1).setScale(1.5).setAlpha(0.25);
    this.addInteractable({
      x, y, range: 70, rangeY: 70,
      label: () => (this.requirementsMet() ? 'Sit at the log' : 'The log'),
      onInteract: () => this.tryLog(),
    });
  }

  onStart(resumed) {
    if (!resumed) this.titleCard('STAGE 02', 'THE LOG');
    this.time.delayedCall(resumed ? 400 : 2800, () => app.bus.emit('toast', { kind: 'info', text: STAGE2_META.hint }));
  }

  requirementsMet() {
    const need = this.stage.required.fragments;
    return need.every((k) => app.progress.has(this.stageId, k));
  }

  extraUpdate(time) {
    const f = Math.floor(time / 260) % 4;
    if (f !== this.pondFrame) { this.pondFrame = f; for (const t of this.pondTiles) t.setTexture(`pond_${f}`); }
    if (this.logMarker) this.logMarker.setAlpha(this.requirementsMet() ? 0.4 + Math.sin(time / 420) * 0.1 : 0.2);
  }

  async tryLog() {
    if (this.busy || this.finished) return;
    this.busy = true;
    try {
      if (!this.requirementsMet()) {
        const left = this.stage.required.fragments.filter((k) => !app.progress.has(this.stageId, k)).length;
        app.audio?.sfx('ui_back');
        await this.talk([{ who: 'narrator', text: `The log is waiting. ${left} conversation fragment${left > 1 ? 's' : ''} still to find in the park.` }]);
        return;
      }
      await this.playLog();
    } finally {
      this.busy = false;
    }
  }

  // ------------------------------------------------------------------- the log scene
  async playLog() {
    const { x, y } = this.spec.anchors.log;
    const pm = app.progress;
    const me = pm.character, other = this.otherKey;
    this.walkers = null;
    app.audio?.soften(true);

    // 1. both characters walk to the log and sit down
    await this.cutscene(async (c) => {
      this.hidePlayer();
      await this.panTo(x, y - 52, 700);
      const a = this.cast(me, this.player.x < x ? this.player.x : x - 120, y, 'run');
      const b = this.cast(other, x + 150, y, 'run', true);
      this.walkers = [a, b];
      await Promise.all([this.walkCast(a, x - 17, 80, 'run'), this.walkCast(b, x + 17, 80, 'run')]);
      a.setFlipX(false); b.setFlipX(true);
      a.y = b.y = SEAT_Y;
      this.playCast(a, 'sit'); this.playCast(b, 'sit');
      app.audio?.sfx('land');
      await c.wait(600);
      await c.say([{ who: 'narrator', text: DIALOGUE.logIntro }]);
    }, { key: 'log-sit' });
    this.frozen = true;

    // 2. prompts: pick one to answer, skip it, or just sit for a while
    const opened = await this.logPrompts();
    if (opened) pm.grant('log');
    this.setFlag('logVisited', true);
    const [a, b] = this.walkers;
    this.playCast(a, 'sit_lean'); this.playCast(b, 'sit_lean');

    // 3. time passes
    await this.cutscene((c) => this.timeSkip(c), { key: 'log-timeskip' });
    this.frozen = true;
    this.setFlag('timeSkipDone', true);
    app.audio?.soften(false);
    await this.finishStage();
  }

  /** Returns true when the player opened at least one prompt. */
  async logPrompts() {
    const pm = app.progress;
    const dlg = app.ui.dialogue;
    const frags = this.stage.fragments.filter((f) => pm.has(this.stageId, f.key));
    await dlg.say([{ who: 'narrator', text: DIALOGUE.logPrompts }]);
    let opened = false;
    for (;;) {
      const options = frags.map((f) => ({ id: f.prompt, label: `${pm.state.answered.includes(f.prompt) ? '✓  ' : ''}${f.label}` }));
      options.push({ id: '__sit', label: opened ? 'Keep sitting. Let time pass.' : 'Just sit for a while.' });
      const pick = await dlg.choose({ who: 'narrator', text: 'What do you talk about?', options });
      if (pick == null || pick === '__sit') break;
      opened = true;
      await app.ui.openQuestion(pick, { context: 'log' });
    }
    return opened;
  }

  // ----------------------------------------------------------------- time-skip montage
  async timeSkip(c) {
    const fast = !motionAllowed();
    const D = (ms) => (fast ? Math.min(ms, 350) : ms);
    const objs = [];
    const fixed = (o, depth = 500) => { o.setScrollFactor(0).setDepth(depth); objs.push(o); return o; };

    // black out the world first, then build the montage on top of it
    const blackout = fixed(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000).setOrigin(0).setAlpha(0), 490);
    await c.tween({ targets: blackout, alpha: 1, duration: D(600) });

    tex(this.textures, 'moon_mont', 48, 48, (g) => { glow(g, 24, 24, 23, '#C8A7FF', 0.7, 5); disc(g, 24, 24, 13, '#e6dcff'); disc(g, 28, 21, 9, '#f4eeff'); px(g, 20, 26, 3, 3, '#cbb8ff'); });
    fixed(this.add.image(0, 0, 'bg_sky_park').setOrigin(0));
    const moon = fixed(this.add.image(80, 120, 'moon_mont'));
    fixed(this.add.image(VIEW_W / 2, 135, 'bg_far_park').setScale(1).setAlpha(0.7).setCrop(0, 100, 512, 130));
    fixed(this.add.rectangle(0, 214, VIEW_W, 56, 0x07050f).setOrigin(0));
    fixed(this.add.rectangle(0, 214, VIEW_W, 2, 0x5cffb0).setOrigin(0).setAlpha(0.35));
    fixed(this.add.image(VIEW_W / 2, 224, 'log').setScale(2).setOrigin(0.5, 1));
    // the pair, scaled up, resting on the top of the (scaled) log: seat row 34 of 48
    const seatY = 224 - (34 - 8) * 2 + 13 * 2;
    const mk = (key, x, flip) => fixed(this.add.sprite(x, seatY, key, 'sit_lean_0').setOrigin(0.5, 1).setScale(2).setFlipX(flip));
    const a = mk(this.walkers[0].charKey, VIEW_W / 2 - 34, false);
    const b = mk(this.walkers[1].charKey, VIEW_W / 2 + 34, true);
    const lamps = [96, 384].map((x) => fixed(this.add.image(x, 160, 'glow_warm').setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setAlpha(0.55)));
    const clock = fixed(pixelText(this, VIEW_W / 2, 56, CLOCK[0], { color: '#F4EEFF', scale: 3, glow: '#9B5CFF' }));
    const cap = fixed(pixelText(this, VIEW_W / 2, 100, ' ', { color: '#43D9FF', scale: 1, glow: '#43D9FF' }));
    const veil = fixed(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000).setOrigin(0).setAlpha(1), 505);
    await c.tween({ targets: veil, alpha: 0, duration: D(700) });

    const total = CLOCK.length;
    for (let i = 0; i < total; i++) {
      clock.setTexture(pixelTextKey(this, CLOCK[i], { color: '#F4EEFF', scale: 3, glow: '#9B5CFF' }));
      app.audio?.sfx('ui_move');
      if (i % 2 === 0 && CAPTIONS[i / 2]) {
        cap.setTexture(pixelTextKey(this, CAPTIONS[i / 2].toUpperCase(), { color: '#43D9FF', scale: 1, glow: '#43D9FF' })).setAlpha(0);
        this.tweens.add({ targets: cap, alpha: 1, duration: D(500) });
      }
      const t = (i + 1) / total;
      await Promise.all([
        c.tween({ targets: moon, x: 80 + t * 320, y: 120 - Math.sin(t * Math.PI) * 60 + t * 24, duration: D(1500), ease: 'Sine.easeInOut' }),
        c.tween({ targets: lamps, alpha: Math.max(0.1, 0.55 - t * 0.42), duration: D(1500) }),
      ]);
      if (i === 3) app.audio?.sfx('scan');
      if (i % 2 === 1) this.tweens.add({ targets: cap, alpha: 0, duration: D(400) });
    }
    await c.wait(D(500));
    await c.tween({ targets: veil, alpha: 1, duration: D(700) });
    for (const o of objs) if (o !== blackout) o.destroy();
    // bring the world back (the two of them still seated on the log)
    await c.tween({ targets: blackout, alpha: 0, duration: D(700) });
    blackout.destroy();
    void a; void b;
  }
}
