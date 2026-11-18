// Lightwork: the obstacles that interrupt the characters' time together.
//   walker - patrols a stretch of ground, spots you, winds up (telegraph), then strikes.
//   drone  - hovers along a line, dives at you when you pass underneath, then retreats.
// Both can be hurt, knocked back, stunned and defeated. Contact hurts, but the player's
// post-hit invulnerability stops it from chaining.
import Phaser from 'phaser';
import { app } from '../../app.js';

const WALKER = { speed: 34, chase: 66, detectX: 140, detectY: 54, range: 28, windup: 430, strike: 170, recover: 520, hp: 3, bw: 14, bh: 22 };
const DRONE = { speed: 42, chase: 80, detectX: 120, detectY: 120, windup: 380, dive: 190, hp: 2, bw: 16, bh: 10 };

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, spec) {
    const drone = spec.type === 'drone';
    super(scene, spec.x, spec.y, drone ? 'drone_hover_0' : 'lw_idle_0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.id = spec.id;
    this.kind = drone ? 'drone' : 'walker';
    this.cfg = drone ? DRONE : WALKER;
    this.hp = spec.hp ?? this.cfg.hp;
    this.patrol = spec.patrol ?? [spec.x - 60, spec.x + 60];
    this.homeY = spec.y;
    this.facing = 1;
    this.state = 'patrol';
    this.t = 0;
    this.cooldown = 800;
    this.contactCd = 0;
    this.dying = false;
    this.setDepth(6);
    const b = this.body;
    if (drone) {
      this.setOrigin(0.5, 0.5);
      b.setSize(this.cfg.bw, this.cfg.bh).setOffset(4, 6);
      b.allowGravity = false;
    } else {
      this.setOrigin(0.5, 1);
      b.setSize(this.cfg.bw, this.cfg.bh).setOffset(7, 28 - this.cfg.bh);
    }
    this.pose = '';
    this.glow = scene.add.image(this.x, this.y, drone ? 'glow_pink' : 'glow_blue').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35).setDepth(5).setScale(0.6);
  }

  setPose(key) {
    if (this.pose === key) return;
    this.pose = key;
    this.anims.stop();
    this.setTexture(key);
  }

  loop(key) {
    if (this.pose === key) return;
    this.pose = key;
    this.anims.play(key, true);
  }

  get target() { return this.scene.player; }

  update(time, dt) {
    if (!this.active) return;
    this.glow.setPosition(this.x, this.y - (this.kind === 'walker' ? 18 : 0)).setAlpha(this.dying ? 0 : 0.3 + 0.1 * Math.sin(time / 180));
    if (this.dying) return;
    if (this.scene.frozen) { this.body.setVelocityX(0); return; }
    this.contactCd = Math.max(0, this.contactCd - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.t += dt;
    const p = this.target;
    const alive = p && !p.dead;
    const dx = alive ? p.x - this.x : 0;
    const dy = alive ? (p.y - 14) - (this.kind === 'walker' ? this.y - 14 : this.y) : 0;
    this.setFlipX(this.facing < 0);
    if (this.kind === 'walker') this.updateWalker(dt, alive, dx, dy);
    else this.updateDrone(time, dt, alive, dx, dy);
    if (alive) this.contactTest(p);
  }

  // ------------------------------------------------------------------ walker
  updateWalker(dt, alive, dx, dy) {
    const c = this.cfg, b = this.body;
    const [x0, x1] = this.patrol;
    switch (this.state) {
      case 'stun':
        if (this.t >= 260) this.enter('patrol');
        return;
      case 'patrol': {
        if (this.x <= x0) this.facing = 1; else if (this.x >= x1) this.facing = -1;
        b.setVelocityX(this.facing * c.speed);
        this.loop('lw_walk');
        if (alive && Math.abs(dx) < c.detectX && Math.abs(dy) < c.detectY) this.enter('chase');
        break;
      }
      case 'chase': {
        if (!alive || Math.abs(dx) > c.detectX * 1.6 || Math.abs(dy) > c.detectY * 1.8) return this.enter('patrol');
        this.facing = dx >= 0 ? 1 : -1;
        const inBounds = this.x > x0 - 40 && this.x < x1 + 40;
        b.setVelocityX(inBounds || Math.sign(dx) !== (this.x > x1 ? 1 : -1) ? this.facing * c.chase : 0);
        this.loop('lw_walk');
        if (Math.abs(dx) < c.range && Math.abs(dy) < 26 && this.cooldown <= 0) this.enter('windup');
        break;
      }
      case 'windup':
        b.setVelocityX(0);
        this.setPose('lw_windup_0');
        if (this.t >= c.windup) this.enter('strike');
        break;
      case 'strike': {
        this.setPose('lw_strike_0');
        b.setVelocityX(this.t < 110 ? this.facing * 170 : 0);
        this.strikeTest();
        if (this.t >= c.strike) { this.cooldown = 900; this.enter('recover'); }
        break;
      }
      case 'recover':
        b.setVelocityX(0);
        this.loop('lw_idle');
        if (this.t >= c.recover) this.enter('chase');
        break;
      default:
        break;
    }
  }

  strikeTest() {
    const p = this.target;
    if (!p || p.dead || this.struck) return;
    const reach = 22;
    const x0 = this.facing > 0 ? this.x + 4 : this.x - 4 - reach;
    const r = new Phaser.Geom.Rectangle(x0, this.y - 26, reach, 26);
    if (Phaser.Geom.Intersects.RectangleToRectangle(r, p.body.getBounds(new Phaser.Geom.Rectangle()))) {
      if (p.hurt(1, this.x, 190)) this.struck = true;
    }
  }

  // ------------------------------------------------------------------- drone
  updateDrone(time, dt, alive, dx, dy) {
    const c = this.cfg, b = this.body;
    const [x0, x1] = this.patrol;
    switch (this.state) {
      case 'stun':
        if (this.t >= 200) this.enter('patrol');
        return;
      case 'patrol': {
        if (this.x <= x0) this.facing = 1; else if (this.x >= x1) this.facing = -1;
        b.setVelocityX(this.facing * c.speed);
        b.setVelocityY((this.homeY + Math.sin(time / 300) * 6 - this.y) * 3);
        this.loop('drone_hover');
        if (alive && Math.abs(dx) < c.detectX && dy > 0 && dy < c.detectY && this.cooldown <= 0) this.enter('windup');
        break;
      }
      case 'windup':
        b.setVelocity(0, -10);
        this.setPose('drone_hover_1');
        this.setTint(0xff9aa8);
        if (this.t >= c.windup) { this.clearTint(); this.diveTarget = alive ? { x: this.target.x, y: this.target.y - 14 } : { x: this.x, y: this.y + 60 }; this.enter('dive'); }
        break;
      case 'dive': {
        this.setPose('drone_dive_0');
        const vx = this.diveTarget.x - this.x, vy = this.diveTarget.y - this.y;
        const d = Math.hypot(vx, vy) || 1;
        b.setVelocity((vx / d) * c.dive, (vy / d) * c.dive);
        this.facing = vx >= 0 ? 1 : -1;
        if (d < 8 || this.t > 700) { this.cooldown = 1600; this.enter('return'); }
        break;
      }
      case 'return': {
        const vx = (this.patrol[0] + this.patrol[1]) / 2 - this.x, vy = this.homeY - this.y;
        const d = Math.hypot(vx, vy) || 1;
        b.setVelocity((vx / d) * 90, (vy / d) * 90);
        this.loop('drone_hover');
        if (d < 14) this.enter('patrol');
        break;
      }
      default:
        break;
    }
  }

  enter(state) {
    this.state = state;
    this.t = 0;
    this.struck = false;
    if (state === 'windup') app.audio?.sfx('enemy_windup');
    if (state === 'patrol' || state === 'chase') this.pose = '';
  }

  contactTest(p) {
    if (this.contactCd > 0 || this.state === 'stun') return;
    if (Phaser.Geom.Intersects.RectangleToRectangle(this.body.getBounds(new Phaser.Geom.Rectangle()), p.body.getBounds(new Phaser.Geom.Rectangle()))) {
      this.contactCd = 800;
      p.hurt(1, this.x, 160);
    }
  }

  // ------------------------------------------------------------------ damage
  hit(dmg, dirX, knock) {
    if (this.dying) return;
    this.hp -= dmg;
    this.state = 'stun';
    this.t = 0;
    this.pose = '';
    this.setPose(this.kind === 'walker' ? 'lw_hurt_0' : 'drone_hurt_0');
    this.body.setVelocity(dirX * knock, this.kind === 'walker' ? -140 : -30);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.active && this.clearTint());
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dying = true;
    this.body.setVelocity(0, 0);
    this.body.allowGravity = false;
    this.body.checkCollision.none = true;
    this.clearTint();
    app.audio?.sfx('enemy_die');
    this.scene.fx?.burst(this.x, this.y - 10, 'p_blue', 14, 110);
    this.pose = '';
    this.anims.play(this.kind === 'walker' ? 'lw_die' : 'drone_die');
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { this.glow.destroy(); this.destroy(); });
    this.scene.onEnemyDefeated?.(this);
  }

  destroy(fromScene) {
    this.glow?.destroy();
    super.destroy(fromScene);
  }
}
