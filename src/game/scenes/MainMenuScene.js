// Main menu backdrop: a slow-moving midnight skyline with both characters on the wet
// street. The actual menu (buttons, title) is HTML on top - see src/ui/menus.js.
import Phaser from 'phaser';
import { app, motionAllowed } from '../../app.js';
import { VIEW_W, VIEW_H } from '../constants.js';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenuScene');
  }

  create() {
    const gy = 214;
    this.add.image(0, 0, 'bg_sky_drag').setOrigin(0).setDepth(-100);
    this.far = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'bg_far_drag_0').setOrigin(0).setDepth(-90);
    this.farAlt = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'bg_far_drag_1').setOrigin(0).setDepth(-89).setAlpha(0);
    this.mid = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'bg_mid_drag_0').setOrigin(0).setDepth(-80);
    this.midAlt = this.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'bg_mid_drag_1').setOrigin(0).setDepth(-79).setAlpha(0);

    if (motionAllowed()) {
      for (const t of [this.farAlt, this.midAlt]) {
        this.time.addEvent({ delay: 1100 + Math.random() * 900, loop: true, callback: () => this.tweens.add({ targets: t, alpha: Phaser.Math.FloatBetween(0, 0.85), duration: 800 }) });
      }
      const spawnFlyer = () => {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const f = this.add.image(dir > 0 ? -30 : VIEW_W + 30, Phaser.Math.Between(18, 100), Math.random() < 0.5 ? 'flyer_a' : 'flyer_b').setFlipX(dir < 0).setDepth(-85).setAlpha(0.85);
        this.tweens.add({ targets: f, x: dir > 0 ? VIEW_W + 30 : -30, duration: Phaser.Math.Between(8000, 14000), onComplete: () => f.destroy() });
      };
      this.time.addEvent({ delay: 3200, loop: true, callback: spawnFlyer });
      spawnFlyer();
    }

    // wet street
    this.add.tileSprite(0, gy, VIEW_W, 16, 'g_drag_top').setOrigin(0).setDepth(2);
    this.add.tileSprite(0, gy + 16, VIEW_W, VIEW_H - gy - 16, 'g_drag_fill').setOrigin(0).setDepth(1);

    // props
    this.add.image(386, 56, 'sign_blaq').setDepth(-60).setScale(1);
    this.add.sprite(300, 92, 'holo_a_0').setDepth(-60).play('holo_a').setAlpha(0.85);
    for (const x of [28, 458]) {
      this.add.image(x, gy, 'pole').setOrigin(0.5, 1).setDepth(3);
      this.add.image(x + 4, gy - 76, 'glow_lav').setBlendMode(Phaser.BlendModes.ADD).setDepth(3).setAlpha(0.6);
    }
    // a car passing on the far lane
    const car = this.add.image(-70, gy - 2, 'car_a').setOrigin(0.5, 1).setDepth(0).setAlpha(0.9);
    const drive = () => {
      car.setPosition(-70, gy - 2).setTexture(Phaser.Utils.Array.GetRandom(['car_a', 'car_b', 'car_c', 'car_d']));
      this.tweens.add({ targets: car, x: VIEW_W + 90, duration: 5200, onComplete: () => this.time.delayedCall(Phaser.Math.Between(2500, 6000), drive) });
    };
    if (motionAllowed()) this.time.delayedCall(1800, drive);

    // the two of them
    this.mule = this.add.sprite(320, gy, 'mule', 'idle_0').setOrigin(0.5, 1).setScale(2).setDepth(5);
    this.princess = this.add.sprite(398, gy, 'princess', 'idle_0').setOrigin(0.5, 1).setScale(2).setDepth(5).setFlipX(true);
    this.mule.play('mule:idle');
    this.princess.play('princess:idle');
    this.time.addEvent({ delay: 3400, loop: true, callback: () => this.fidget() });

    // drifting light dust
    if (motionAllowed()) {
      this.add.particles(0, 0, 'p_lav', {
        x: { min: 0, max: VIEW_W }, y: { min: 20, max: gy }, lifespan: 5000, speedY: { min: -8, max: -2 }, speedX: { min: -6, max: 6 },
        scale: { start: 1, end: 0 }, alpha: { start: 0.7, end: 0 }, frequency: 220, quantity: 1,
      }).setDepth(6);
    }

    this.cameras.main.fadeIn(600, 16, 9, 29);
    app.audio?.playMusic('menu');
    app.ui.showMainMenu();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { app.ui.hideMainMenu(); });
  }

  fidget() {
    const pick = Math.random();
    if (pick < 0.5) {
      this.mule.play('mule:nervous');
      this.time.delayedCall(1600, () => this.mule.active && this.mule.play('mule:idle'));
    } else {
      this.princess.play('princess:wave');
      this.time.delayedCall(1600, () => this.princess.active && this.princess.play('princess:idle'));
    }
  }

  update(time, dt) {
    const s = dt / 1000;
    this.far.tilePositionX += 4 * s; this.farAlt.tilePositionX = this.far.tilePositionX;
    this.mid.tilePositionX += 11 * s; this.midAlt.tilePositionX = this.mid.tilePositionX;
  }
}
