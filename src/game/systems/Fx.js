// Small, pooled visual effects (particles, dash ghosts, floating labels). Particle
// counts are deliberately low and every emitter belongs to the scene, so everything is
// destroyed with it. Reduced-motion mode skips the decorative extras.
import Phaser from 'phaser';
import { app, motionAllowed } from '../../app.js';
import { makeCanvas, drawText, textWidth } from '../art/pixel.js';

const labelCache = new Map();

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.emitters = {};
    this.ghosts = 0;
  }

  emitter(key, tex, cfg) {
    if (!this.emitters[key]) {
      this.emitters[key] = this.scene.add.particles(0, 0, tex, { emitting: false, ...cfg }).setDepth(25);
    }
    return this.emitters[key];
  }

  dust(x, y, tex = 'p_lav', n = 4) {
    this.emitter(`dust_${tex}`, tex, {
      lifespan: 320, speed: { min: 20, max: 60 }, angle: { min: 200, max: 340 },
      scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 }, gravityY: 40,
    }).explode(n, x, y);
  }

  sparks(x, y) {
    this.emitter('sparks', 'p_warm', {
      lifespan: 280, speed: { min: 50, max: 130 }, angle: { min: 200, max: 340 },
      scale: { start: 1, end: 0 }, gravityY: 260,
    }).explode(3, x, y);
  }

  impact(x, y, tex = 'p_white') {
    this.emitter(`impact_${tex}`, tex, {
      lifespan: 260, speed: { min: 40, max: 150 }, angle: { min: 0, max: 360 },
      scale: { start: 1.3, end: 0 }, alpha: { start: 1, end: 0 },
    }).explode(motionAllowed() ? 9 : 4, x, y);
  }

  burst(x, y, tex = 'p_lav', n = 18, speed = 120) {
    this.emitter(`burst_${tex}_${speed}`, tex, {
      lifespan: { min: 400, max: 800 }, speed: { min: speed * 0.3, max: speed }, angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 }, alpha: { start: 1, end: 0 }, gravityY: 30,
    }).explode(motionAllowed() ? n : Math.ceil(n / 3), x, y);
  }

  /** Dash after-image. */
  ghost(player) {
    if (!motionAllowed() || this.ghosts > 7) return;
    this.ghosts++;
    const g = this.scene.add.image(player.x, player.y, player.texture.key, player.frame.name)
      .setOrigin(0.5, 1).setFlipX(player.flipX).setAlpha(0.5).setDepth(9)
      .setTint(player.isMule ? 0x9b5cff : 0xff72c6);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 240, onComplete: () => { g.destroy(); this.ghosts--; } });
  }

  /** Pixel-font label that floats up and fades ("TRICK +200"). */
  label(x, y, text, color = '#C8A7FF', scale = 1) {
    const key = `lbl_${text}_${color}_${scale}`;
    if (!this.scene.textures.exists(key)) {
      const w = textWidth(text, scale) + 4, h = 7 * scale + 4;
      const { canvas, ctx } = makeCanvas(w, h);
      drawText(ctx, text, 3, 3, '#09090F', scale);
      drawText(ctx, text, 2, 2, color, scale);
      this.scene.textures.addCanvas(key, canvas);
      labelCache.set(key, true);
    }
    const img = this.scene.add.image(x, y, key).setDepth(40).setOrigin(0.5);
    this.scene.tweens.add({ targets: img, y: y - 22, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => img.destroy() });
    return img;
  }

  /** Short full-screen tint flash (skipped for reduced motion). */
  flash(color = 0xffffff, alpha = 0.5, ms = 160) {
    if (!motionAllowed()) return;
    const cam = this.scene.cameras.main;
    cam.flash(ms, (color >> 16) & 255, (color >> 8) & 255, color & 255, false);
    void alpha;
  }

  destroy() {
    for (const e of Object.values(this.emitters)) e.destroy();
    this.emitters = {};
  }
}

export { Phaser, app };
