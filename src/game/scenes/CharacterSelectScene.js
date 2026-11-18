// Neon selection chamber. The character cards are HTML (src/ui/menus.js); this scene
// provides the room around them: perspective floor grid, light cones and rising motes.
import Phaser from 'phaser';
import { app, motionAllowed } from '../../app.js';
import { VIEW_W, VIEW_H } from '../constants.js';
import { goTo, startStage } from '../sceneFlow.js';

export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super('CharacterSelectScene');
  }

  init(data) {
    this.mode = data?.mode === 'change' ? 'change' : 'new';
  }

  create() {
    const pm = app.progress;
    this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0a0518).setOrigin(0).setDepth(-100);
    const g = this.add.graphics().setDepth(-90);
    // back wall panels
    g.fillStyle(0x1a0d33, 1);
    for (let i = 0; i < 7; i++) g.fillRect(20 + i * 66, 20, 60, 150);
    g.lineStyle(1, 0x9b5cff, 0.35);
    for (let i = 0; i < 7; i++) g.strokeRect(20 + i * 66 + 0.5, 20.5, 59, 149);
    // perspective floor
    const vx = VIEW_W / 2, vy = 150;
    g.lineStyle(1, 0x9b5cff, 0.45);
    for (let i = -10; i <= 10; i++) g.lineBetween(vx, vy, vx + i * 70, VIEW_H);
    for (let k = 1; k <= 9; k++) {
      const y = vy + Math.pow(k / 9, 2) * (VIEW_H - vy);
      g.lineStyle(1, k % 3 === 0 ? 0xff72c6 : 0x9b5cff, 0.35);
      g.lineBetween(0, y, VIEW_W, y);
    }
    // neon tubes
    for (const [x, c] of [[8, 0x9b5cff], [VIEW_W - 8, 0xff72c6]]) {
      this.add.rectangle(x, 0, 3, VIEW_H, c).setOrigin(0.5, 0).setDepth(-80);
      this.add.image(x, VIEW_H / 2, c === 0x9b5cff ? 'glow_lav' : 'glow_pink').setBlendMode(Phaser.BlendModes.ADD).setScale(3, 6).setAlpha(0.35).setDepth(-79);
    }
    // light cones above each pedestal
    const cones = [
      this.add.image(VIEW_W * 0.3, 0, 'cone_light').setOrigin(0.5, 0).setScale(4, 4.6).setTint(0x9b5cff).setBlendMode(Phaser.BlendModes.ADD).setDepth(-70).setAlpha(0.55),
      this.add.image(VIEW_W * 0.7, 0, 'cone_light').setOrigin(0.5, 0).setScale(4, 4.6).setTint(0xff72c6).setBlendMode(Phaser.BlendModes.ADD).setDepth(-70).setAlpha(0.55),
    ];
    if (motionAllowed()) {
      this.tweens.add({ targets: cones, alpha: 0.3, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.add.particles(0, 0, 'p_lav', {
        x: { min: 0, max: VIEW_W }, y: VIEW_H + 4, lifespan: 4200, speedY: { min: -40, max: -14 }, speedX: { min: -6, max: 6 },
        scale: { start: 1.2, end: 0 }, alpha: { start: 0.8, end: 0 }, frequency: 120,
      }).setDepth(-60);
    }
    this.cameras.main.fadeIn(450, 10, 5, 24);
    app.audio?.playMusic('menu');

    app.ui.showCharacterSelect({
      mode: this.mode,
      onBack: () => goTo('MainMenuScene'),
      onStart: (character) => {
        if (this.mode === 'new' || !pm.hasSave) {
          pm.newGame(character);
          startStage('stage1', { resume: false });
        } else {
          pm.chooseCharacter(character);
          startStage(pm.resumeStage, { resume: true });
        }
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => app.ui.hideCharacterSelect());
  }
}
