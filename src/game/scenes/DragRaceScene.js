// Stage 01 - The Night Our Worlds Collided. Drag-racing district: find the three
// memory fragments, clear the Lightwork, then reach the meeting point for the
// first-meeting cinematic and the letter. The cinematic only ever plays after the
// gameplay requirements are met - the meeting point stays locked until then.
import Phaser from 'phaser';
import { app, motionAllowed } from '../../app.js';
import { LevelScene } from './LevelScene.js';
import { STAGE1, STAGE1_META } from '../../data/levels/stage1.js';
import { evaluateStage } from '../../data/stages.js';
import { MEETING_BEATS, DIALOGUE } from '../../data/memories.js';

export class DragRaceScene extends LevelScene {
  constructor() {
    super('DragRaceScene', 'stage1');
  }

  buildLevel() { return STAGE1; }

  specialSetup() {
    const { x, y } = this.spec.anchors.meet;
    this.add.image(x, y + 1, 'meet_pad').setOrigin(0.5, 1).setDepth(2);
    this.meetHolo = this.add.sprite(x, y - 10, 'meet_holo_0').setOrigin(0.5, 1).setDepth(3).setAlpha(0.3).play('meet_holo');
    this.meetGlow = this.add.image(x, y - 36, 'glow_pink').setBlendMode(Phaser.BlendModes.ADD).setDepth(2).setScale(2.4).setAlpha(0.1);
    this.meetReady = false;
    this.addInteractable({
      x, y, range: 52, rangeY: 70,
      label: () => (this.requirementsMet() ? 'Meet at the meeting point' : 'Meeting point (locked)'),
      onInteract: () => this.tryMeet(),
    });
  }

  onStart(resumed) {
    if (!resumed) this.titleCard('STAGE 01', 'THE NIGHT OUR WORLDS COLLIDED');
    this.controlHint();
    this.time.delayedCall(resumed ? 400 : 2800, () => app.bus.emit('toast', { kind: 'info', text: STAGE1_META.hint }));
  }

  onAllDefeated() {
    app.progress.grant('fighter');
    app.bus.emit('toast', { kind: 'info', text: 'Lightwork cleared.' });
  }

  /** Requirements for the meeting point: everything except the cinematic itself. */
  requirementsMet() {
    return evaluateStage(this.stageId, { ...this.runState(), flags: { ...this.run.flags, meetingRead: true } }).complete;
  }

  extraUpdate(time) {
    const ready = this.requirementsMet();
    if (ready !== this.meetReady) {
      this.meetReady = ready;
      if (ready) {
        app.audio?.sfx('unlock');
        this.fx.burst(this.spec.anchors.meet.x, this.spec.anchors.meet.y - 40, 'p_pink', 24, 120);
        app.bus.emit('toast', { kind: 'info', text: 'The meeting point is open.' });
      }
      this.tweens.add({ targets: this.meetHolo, alpha: ready ? 0.95 : 0.3, duration: 400 });
      this.tweens.add({ targets: this.meetGlow, alpha: ready ? 0.4 : 0.1, duration: 400 });
    }
    if (ready) this.meetGlow.setScale(2.4 + Math.sin(time / 380) * 0.2);
  }

  async tryMeet() {
    if (this.busy || this.finished) return;
    this.busy = true;
    try {
      const st = evaluateStage(this.stageId, { ...this.runState(), flags: { ...this.run.flags, meetingRead: true } });
      if (!st.complete) {
        app.audio?.sfx('ui_back');
        await this.talk([{ who: 'narrator', text: `${DIALOGUE.letterLocked} Still needed: ${st.missing.join(', ')}.` }]);
        return;
      }
      await this.playMeeting();
    } finally {
      this.busy = false;
    }
  }

  // ----------------------------------------------------------------- the cinematic
  async playMeeting() {
    const { x, y } = this.spec.anchors.meet;
    app.audio?.soften(true);
    await this.cutscene(async (c) => {
      this.hidePlayer();
      await this.panTo(x - 10, y - 50, 800);
      const mule = this.cast('mule', x - 70, y, 'idle');
      const princess = this.cast('princess', x + 130, y, 'idle', true);
      const quote = (id) => MEETING_BEATS.find((b) => b.id === id);
      const beat = async (id, sprite = mule, ms = 2500) => {
        const b = quote(id);
        await Promise.all([c.bubble(sprite, b.quote, { kind: 'thought', ms }), c.caption(b.caption, ms)]);
      };

      // 1. he notices her across the track, and freezes
      await c.wait(500);
      await beat('notice');
      this.playCast(mule, 'freeze');
      app.audio?.sfx('thump');
      await beat('freeze');
      this.playCast(mule, 'nervous');
      await beat('nervous');

      // 2. she rushes to him
      this.playCast(mule, 'idle');
      await Promise.all([
        beat('rush', mule, 2100),
        this.walkCast(princess, x - 38, 120, 'run'),
      ]);
      this.playCast(princess, 'idle');
      princess.setFlipX(true);

      // 3. first touch: "she is actually real."
      this.playCast(mule, 'hold'); this.playCast(princess, 'hold');
      this.fx.burst((mule.x + princess.x) / 2, y - 26, 'p_pink', 16, 80);
      app.audio?.sfx('fragment');
      await beat('real');

      // 4. he holds her
      this.tweens.add({ targets: princess, x: mule.x + 15, duration: 400 });
      await c.wait(400);
      this.playCast(mule, 'hug'); this.playCast(princess, 'hug');
      this.hearts(c, mule, princess);
      await beat('hold', mule, 2600);

      // 5. the thumb
      this.playCast(mule, 'hold'); this.playCast(princess, 'hold');
      this.tweens.add({ targets: princess, x: mule.x + 24, duration: 500 });
      await beat('thumb', mule, 2600);

      // 6. she has to go home too early
      this.playCast(princess, 'wave');
      await Promise.all([beat('home', mule, 2600), c.wait(900)]);
      this.playCast(mule, 'wave');
      await this.walkCast(princess, x + 160, 90, 'run');
      this.tweens.add({ targets: princess, alpha: 0, duration: 500 });
      await c.wait(700);
      this.playCast(mule, 'idle');
      await c.wait(500);
      mule.destroy(); princess.destroy();
    }, { key: 'meeting' });
    this.frozen = true;
    app.audio?.soften(false);

    // The letter itself: the canonical text, shown exactly as written (src/data/letter.js).
    app.progress.see('letter');
    await app.ui.readLetter({ continueLabel: 'Continue' });
    app.progress.grant('letter');
    this.setFlag('meetingRead', true);
    await this.finishStage();
  }

  hearts(c, a, b) {
    const n = motionAllowed() ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const hx = (a.x + b.x) / 2 + (i - n / 2) * 6;
      const h = this.add.image(hx, a.y - 40, 'heart_pick').setDepth(20).setAlpha(0);
      this.tweens.add({ targets: h, y: h.y - 26 - i * 4, alpha: { from: 1, to: 0 }, duration: 1300, delay: i * 170, onStart: () => h.setAlpha(1), onComplete: () => h.destroy() });
    }
  }
}
