// Stage 03 - After Everyone Else Is Asleep. A quiet street at night: hop garden walls,
// time the motion-sensor floodlights, then wait outside her house. Reaching the meeting
// point triggers the car-arrival scene (headlights, light sweep, the car pulling into
// the driveway, music softening) followed by a short optional conversation.
//
// Replays can change the night (clear / rain / fog); the other nights are unlocked by
// the two optional fragments. The weather is atmosphere only - it does not claim that
// anything happened on a particular night.
import Phaser from 'phaser';
import { app, motionAllowed } from '../../app.js';
import { LevelScene } from './LevelScene.js';
import { STAGE3, STAGE3_META } from '../../data/levels/stage3.js';
import { STAGES } from '../../data/stages.js';
import { DIALOGUE, MIDNIGHT_LINES } from '../../data/memories.js';
import { getQuestion } from '../../data/questions.js';
import { VIEW_W, VIEW_H } from '../constants.js';

const NIGHTS = {
  clear: { label: 'Clear night', dim: 0, prompt: null },
  rain: { label: 'Rainy night', dim: 0.22, prompt: 'night.rain' },
  fog: { label: 'Foggy night', dim: 0.16, prompt: 'night.fog' },
};

export class MidnightScene extends LevelScene {
  constructor() {
    super('MidnightScene', 'stage3');
  }

  buildLevel() { return STAGE3; }

  specialSetup() {
    this.weatherObjs = [];
    this.fogLayers = [];
    this.applyWeather(this.run.variation);
    // the meeting point: a warm patch of light outside her door
    const { x, y } = this.spec.anchors.house;
    this.meetGlow = this.add.image(x, y - 4, 'glow_warm').setBlendMode(Phaser.BlendModes.ADD).setDepth(2).setScale(3.4, 0.7).setAlpha(0.45);
    if (motionAllowed()) this.tweens.add({ targets: this.meetGlow, alpha: 0.7, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.arrived = false;
  }

  /** The nights the player may pick: clear always, rain/fog once their fragment is found. */
  unlockedNights() {
    const pm = app.progress;
    return STAGES.stage3.variations.filter((v) => !v.unlockedBy || pm.has('stage3', v.unlockedBy));
  }

  async onStart(resumed) {
    const pm = app.progress;
    const nights = this.unlockedNights();
    if (!resumed && nights.length > 1) {
      this.frozen = true;
      const pick = await app.ui.dialogue.choose({
        who: 'narrator',
        text: 'Which night do you want to walk through?',
        options: nights.map((n) => ({ id: n.key, label: n.label + (n.key === this.run.variation ? '  ✓' : '') })),
      });
      this.frozen = false;
      if (pick && pick !== this.run.variation) {
        this.run.variation = pick;
        pm.setVariation(pick);
        this.saveRun();
        this.applyWeather(pick);
      }
    }
    if (!resumed) this.titleCard('STAGE 03', 'AFTER EVERYONE ELSE IS ASLEEP');
    this.time.delayedCall(resumed ? 400 : 2800, () => app.bus.emit('toast', { kind: 'info', text: STAGE3_META.hint }));
  }

  objectiveText(st) {
    const base = app.progress.character === 'princess'
      ? 'Slip out and wait by your front door for the car.'
      : this.stage.objective;
    return st.complete ? base : `${base}  ·  ${NIGHTS[this.run.variation]?.label ?? ''}`;
  }

  onFragmentCollected(key, def) {
    if (def?.unlocksVariation) {
      const n = NIGHTS[def.unlocksVariation];
      app.bus.emit('toast', { kind: 'achievement', text: `${n.label} unlocked. Choose it when you replay this stage.` });
    }
  }

  // ----------------------------------------------------------------------- weather
  applyWeather(key) {
    for (const o of this.weatherObjs) o.destroy();
    this.weatherObjs = [];
    this.fogLayers = [];
    app.audio?.loop('rain', 0);
    const night = NIGHTS[key] ?? NIGHTS.clear;
    const keep = (o) => { this.weatherObjs.push(o); return o; };

    if (night.dim) {
      keep(this.add.rectangle(0, 0, VIEW_W, VIEW_H, key === 'fog' ? 0x2a1850 : 0x0c0722, night.dim).setOrigin(0).setScrollFactor(0).setDepth(70));
    }
    if (key === 'rain') {
      app.audio?.loop('rain', 0.9);
      if (motionAllowed()) {
        const rain = this.add.particles(0, 0, 'rain_drop', {
          x: { min: -20, max: VIEW_W + 80 }, y: -10, lifespan: 620, speedY: { min: 380, max: 460 }, speedX: { min: -70, max: -50 },
          quantity: 2, frequency: 18, alpha: { start: 0.85, end: 0.25 }, rotate: 8,
        }).setScrollFactor(0).setDepth(75);
        keep(rain);
      }
      // puddles that ripple under the street lights
      for (let x = 160; x < this.spec.world.w; x += 230) {
        const p = this.add.sprite(x, 217, 'puddle_0').setDepth(2.5).setAlpha(0.9);
        if (motionAllowed()) p.play('puddle');
        keep(p);
      }
    }
    if (key === 'fog') {
      for (const [y, h, a, d, sp] of [[96, 90, 0.5, -85, 6], [150, 100, 0.42, 60, 11], [196, 80, 0.5, 61, 17]]) {
        const f = this.add.tileSprite(0, y, VIEW_W, h, 'fog').setOrigin(0).setScrollFactor(0).setDepth(d).setAlpha(a).setTint(0xc8b6ff);
        this.fogLayers.push({ f, sp });
        keep(f);
      }
    }
  }

  extraUpdate(time, dt) {
    for (const L of this.fogLayers) L.f.tilePositionX += (L.sp * dt) / 1000 + this.cameras.main.scrollX * 0.0006;
    const p = this.player;
    if (!this.arrived && !this.frozen && !p.dead && p.grounded && Math.abs(p.x - this.spec.anchors.house.x) < 36) this.playArrival();
  }

  // ------------------------------------------------------------- the car-arrival scene
  async playArrival() {
    if (this.arrived) return;
    this.arrived = true;
    const pm = app.progress;
    const other = this.otherKey, me = pm.character;
    const { x: driveX, y } = this.spec.anchors.driveway;
    const house = this.spec.anchors.house;
    const stopX = driveX + 70;
    const tellOther = other === 'princess' ? 'She steps out of the car and walks over.' : 'He steps out of the car and walks over.';

    app.audio?.soften(true);
    let car = null, beam = null, sweep = null, walker = null;
    await this.cutscene(async (c) => {
      this.player.facing = -1;
      this.player.setFlipX(true);
      await Promise.all([this.dimScreen(0.3, 800), this.panTo(house.x - 120, y - 70, 1000)]);

      // 1. headlights, far down the street
      car = this.add.image(this.cameras.main.scrollX - 120, y, 'car_night').setOrigin(0.5, 1).setDepth(8);
      beam = this.add.image(car.x + 40, y - 14, 'beam_h').setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(7).setAlpha(0);
      const follow = () => beam.setPosition(car.x + 38, car.y - 13);
      await c.caption(DIALOGUE.midnightArrive, 1800);
      app.audio?.loop('engine', 0.45);
      this.tweens.add({ targets: beam, alpha: 0.95, duration: 900 });

      // 2. the car rolls in and slows into the driveway; the light sweeps over the street
      sweep = this.add.image(driveX - 60, y - 44, 'glow_warm').setBlendMode(Phaser.BlendModes.ADD).setDepth(6).setScale(5, 2.4).setAlpha(0);
      this.tweens.add({ targets: sweep, x: house.x + 30, duration: 4200, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: sweep, alpha: { from: 0, to: 0.4 }, duration: 1800, yoyo: true });
      await c.tween({ targets: car, x: stopX, duration: motionAllowed() ? 4800 : 1, ease: 'Cubic.easeOut', onUpdate: follow });
      follow();
      app.audio?.loop('engine', 0);

      // 3. it stops; the beam settles to a soft glow
      app.audio?.sfx('land');
      this.setFlag('carArrived', true);
      pm.grant('midnight');
      this.tweens.add({ targets: beam, alpha: 0.4, duration: 800 });
      await this.panTo((stopX + house.x) / 2, y - 70, 800);
      await c.wait(600);

      // 4. the other one steps out and walks over
      walker = this.cast(other, stopX + 6, y, 'idle', false);
      walker.setAlpha(0);
      this.add.image(stopX + 4, y - 1, 'door_open').setOrigin(0.5, 1).setDepth(9);
      await c.tween({ targets: walker, alpha: 1, duration: 500 });
      await c.caption(tellOther, 1500);
      await this.walkCast(walker, house.x - 34, 58, 'run');
      this.playCast(walker, 'idle');
      walker.setFlipX(false);
      this.player.facing = -1;

      // 5. a few words (placeholder lines, editable in src/data/memories.js)
      const lines = MIDNIGHT_LINES.map((l) => ({ who: l.who === 'me' ? me : other, text: l.text }));
      await c.say(lines);
    }, { key: 'car-arrival' });
    this.frozen = true;
    app.audio?.loop('engine', 0);
    void car; void sweep; void walker;

    // 6. optional conversation: pick a prompt (answer or skip) or just enjoy the quiet
    await this.talkPrompts();
    this.setFlag('midnightTalk', true);
    app.audio?.soften(false);
    await this.finishStage();
  }

  async talkPrompts() {
    const pm = app.progress;
    const dlg = app.ui.dialogue;
    const night = NIGHTS[this.run.variation] ?? NIGHTS.clear;
    const keys = ['night.wait', 'night.quiet', ...(night.prompt ? [night.prompt] : [])];
    const questions = keys.map((k) => ({ key: k, text: getQuestion(k)?.text ?? k }));
    await dlg.say([{ who: 'narrator', text: DIALOGUE.midnightPrompts }]);
    let asked = 0;
    for (;;) {
      const options = questions.map((q) => ({ id: q.key, label: `${pm.state.answered.includes(q.key) ? '✓  ' : ''}${q.text}` }));
      options.push({ id: '__quiet', label: asked ? 'Stay a little longer in the quiet.' : 'Just enjoy the quiet.' });
      const pick = await dlg.choose({ who: 'narrator', text: 'What do you talk about?', options });
      if (pick == null || pick === '__quiet') break;
      asked++;
      await app.ui.openQuestion(pick, { context: 'night' });
    }
  }
}
