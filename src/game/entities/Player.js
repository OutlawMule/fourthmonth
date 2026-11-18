// The playable character. One class drives both Big Boss Mule and Princess; the
// character data (src/data/characters.js) supplies every tuning number, and the two
// abilities that differ in kind (skateboard + boxing vs double jump + light pulse) are
// separate methods below. Frames are chosen explicitly so animation always matches the
// attack timing.
import Phaser from 'phaser';
import { app, shakeAllowed } from '../../app.js';
import { getCharacter } from '../../data/characters.js';
import { FRAME } from '../art/rig.js';

const COYOTE_MS = 90;
const BUFFER_MS = 110;
const IFRAME_MS = 1200;
const STUN_MS = 260;

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, charKey) {
    super(scene, x, y, charKey, 'idle_0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.charKey = charKey;
    this.cfg = getCharacter(charKey);
    this.ph = this.cfg.physics;
    this.isMule = charKey === 'mule';
    this.setOrigin(0.5, 1).setDepth(10);
    const b = this.body;
    b.setSize(this.ph.body.w, this.ph.body.h);
    b.setOffset((FRAME - this.ph.body.w) / 2, FRAME - this.ph.body.h);
    b.setMaxVelocity(this.ph.walkSpeed, 720);
    b.setCollideWorldBounds(false);

    this.maxHp = this.ph.maxHealth;
    this.hp = this.maxHp;
    this.facing = 1;
    this.frozen = false;
    this.dead = false;
    this.iframes = 0;
    this.stun = 0;
    this.coyote = 0;
    this.buffer = 0;
    this.jumpsLeft = this.ph.extraJumps;
    this.airDashUsed = false;
    this.dashing = false;
    this.dashT = 0;
    this.dashCd = 0;
    this.attacking = false;
    this.attackT = 0;
    this.attackStep = 0;
    this.comboWindow = 0;
    this.queuedAttack = false;
    this.hitSet = new Set();
    this.castFired = false;
    this.shots = 0;
    this.attackCd = 0;
    this.rideCharge = 0;
    this.riding = false;
    this.airRide = false;
    this.trickT = 0;
    this.trickDone = false;
    this.grindRail = null;
    this.grindTick = 0;
    this.ghostT = 0;
    this.wasGround = true;
    this.dropT = 0;
    this.lastFrame = '';
  }

  get grounded() { return this.body.blocked.down || this.body.touching.down; }
  get center2() { return { x: this.x, y: this.y - this.body.height * 0.5 }; }

  // ------------------------------------------------------------------ main update
  update(time, dt) {
    const inp = app.input;
    const b = this.body;
    if (this.dead) return;
    if (this.frozen || this.scene.frozen) { this.idleFreeze(); return; }

    const ground = this.grounded;
    if (ground) {
      this.coyote = COYOTE_MS;
      this.jumpsLeft = this.ph.extraJumps;
      this.airDashUsed = false;
      if (!this.wasGround) this.onLand();
    } else this.coyote = Math.max(0, this.coyote - dt);
    this.wasGround = ground;
    if (inp.pressed('jump')) this.buffer = BUFFER_MS; else this.buffer = Math.max(0, this.buffer - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    this.setAlpha(this.iframes > 0 && !this.dashing ? (Math.floor(time / 70) % 2 ? 0.35 : 1) : this.dashing && !this.isMule ? 0.5 : 1);

    if (this.stun > 0) { this.pickFrame(); return; }

    // --- dash
    if (this.dashing) { this.updateDash(dt); this.pickFrame(); return; }
    if (inp.pressed('dash') && this.dashCd <= 0 && !(this.airDashUsed && !ground)) this.startDash();

    // --- horizontal movement
    const axis = inp.axis();
    if (axis !== 0 && !(this.attacking && ground)) this.facing = axis;
    this.updateRide(dt, axis, ground);
    const planted = this.attacking && ground;
    const maxX = planted ? this.ph.walkSpeed * 0.35 : this.currentMaxSpeed();
    b.maxVelocity.x = Math.max(maxX, Math.abs(b.velocity.x) > maxX && !ground ? Math.abs(b.velocity.x) : maxX);
    if (axis !== 0 && !planted) {
      const opposing = Math.sign(b.velocity.x) === -axis && Math.abs(b.velocity.x) > 40;
      const control = ground ? 1 : this.ph.airControl;
      b.setAccelerationX(axis * this.ph.accel * control * (opposing ? 2.2 : 1));
      b.setDragX(0);
    } else {
      b.setAccelerationX(0);
      b.setDragX(ground ? (this.riding && !planted ? this.ph.rideDrag : this.ph.groundDrag) : 260);
    }

    // --- rails (grind)
    this.updateGrind(dt, axis);

    // --- jump
    const canJump = this.grindRail || this.coyote > 0 || (!ground && this.jumpsLeft > 0 && this.buffer > 0);
    if (this.buffer > 0 && canJump && !(this.attacking && ground && this.attackStep === 2)) {
      if (inp.isDown('down') && ground && this.scene.dropThrough?.(this)) { this.buffer = 0; }
      else this.doJump(ground);
    }
    if (inp.released('jump') && b.velocity.y < -120) b.setVelocityY(b.velocity.y * this.ph.jumpCutMultiplier);

    // --- attack
    this.updateAttack(dt, time);
    if (inp.pressed('attack') && !this.frozen) this.pressAttack();

    // --- interaction handled by the scene (E)

    this.updateSounds(ground);
    this.pickFrame();
  }

  idleFreeze() {
    const b = this.body;
    b.setAccelerationX(0);
    b.setDragX(1400);
    if (this.grounded) b.setVelocityX(Math.abs(b.velocity.x) < 8 ? 0 : b.velocity.x);
    this.riding = false;
    this.rideCharge = 0;
    app.audio?.loop('skate', 0);
    this.pickFrame(true);
  }

  // ------------------------------------------------------------------ movement
  currentMaxSpeed() {
    if (!this.isMule) return this.ph.walkSpeed;
    return Phaser.Math.Linear(this.ph.walkSpeed, this.ph.rideMaxSpeed, this.rideCharge);
  }

  /** Mule: holding a direction on the ground builds board speed ("ride charge"). */
  updateRide(dt, axis, ground) {
    if (!this.isMule) return;
    const secs = dt / 1000;
    const vx = this.body.velocity.x;
    if (this.attacking || this.stun > 0) this.rideCharge = Math.min(this.rideCharge, 0.18);
    else if (ground) {
      if (axis !== 0 && Math.sign(vx) !== -axis) this.rideCharge = Math.min(1, this.rideCharge + this.ph.rideRampPerSec * secs);
      else if (axis !== 0) this.rideCharge = Math.max(0, this.rideCharge - 2.6 * secs); // turning around: bail the speed
      else this.rideCharge = Math.abs(vx) > 50 ? Math.max(0, this.rideCharge - 0.45 * secs) : Math.max(0, this.rideCharge - 3 * secs);
    }
    const was = this.riding;
    this.riding = this.rideCharge > 0.22 && !this.attacking;
    if (this.riding && !was && ground) app.audio?.sfx('mount');
  }

  doJump(ground) {
    const b = this.body;
    const airborneJump = !ground && this.coyote <= 0 && !this.grindRail;
    if (airborneJump) this.jumpsLeft--;
    b.setVelocityY(this.ph.jumpVelocity);
    this.buffer = 0;
    this.coyote = 0;
    if (this.grindRail) this.endGrind(true);
    this.airRide = this.isMule && this.riding;
    this.trickDone = false;
    this.trickT = 0;
    app.audio?.sfx(airborneJump ? 'doublejump' : 'jump');
    this.scene.fx?.dust(this.x, this.y, airborneJump ? 'p_pink' : 'p_lav', airborneJump ? 6 : 4);
  }

  onLand() {
    app.audio?.sfx('land');
    this.scene.fx?.dust(this.x, this.y, 'p_lav', 4);
    if (this.isMule && this.trickDone && this.airRide) this.scene.onTrickLanded?.(this);
    this.airRide = false;
    this.trickT = 0;
    this.trickDone = false;
  }

  // -------------------------------------------------------------------- dash
  startDash() {
    const d = this.cfg.dash;
    const axis = app.input.axis();
    if (axis) this.facing = axis;
    this.dashing = true;
    this.dashT = 0;
    this.dashDir = this.facing;
    this.dashCd = d.cooldownMs;
    this.attacking = false;
    this.comboWindow = 0;
    if (!this.grounded) this.airDashUsed = true;
    this.body.allowGravity = false;
    this.body.setAccelerationX(0);
    this.body.setVelocity(this.dashDir * d.speed, 0);
    this.iframes = Math.max(this.iframes, d.invulnMs);
    this.rideCharge = this.isMule ? Math.max(this.rideCharge, 0.55) : 0;
    app.audio?.sfx(this.isMule ? 'dash' : 'slip');
    this.scene.fx?.dust(this.x, this.y, this.isMule ? 'p_vio' : 'p_pink', 6);
  }

  updateDash(dt) {
    const d = this.cfg.dash;
    this.dashT += dt;
    this.ghostT -= dt;
    this.body.setVelocity(this.dashDir * d.speed, 0);
    if (this.ghostT <= 0) { this.ghostT = 38; this.scene.fx?.ghost(this); }
    if (this.dashT >= d.durationMs) {
      this.dashing = false;
      this.body.allowGravity = true;
      this.body.setVelocityX(this.dashDir * d.speed * 0.45);
    }
  }

  // ------------------------------------------------------------------- attacks
  pressAttack() {
    if (this.dashing || this.stun > 0 || this.dead) return;
    if (this.isMule) {
      if (!this.grounded && this.airRide && !this.trickT) return this.startTrick();
      if (this.attacking) {
        const spec = this.cfg.attack.combo[this.attackStep];
        if (this.attackT >= spec.startMs && this.attackStep < 2) this.queuedAttack = true;
      } else if (this.attackCd <= 0) {
        this.startPunch(this.comboWindow > 0 ? (this.attackStep + 1) % 3 : 0);
      }
    } else if (!this.attacking && this.attackCd <= 0) this.startCast();
  }

  startPunch(step) {
    this.attacking = true;
    this.attackStep = step;
    this.attackT = 0;
    this.queuedAttack = false;
    this.hitSet.clear();
    this.rideCharge = Math.min(this.rideCharge, 0.18);
    this.riding = false;
    if (this.grounded) this.body.setVelocityX(this.facing * (step === 2 ? 95 : 60));
    app.audio?.sfx('whoosh');
  }

  startCast() {
    this.attacking = true;
    this.attackT = 0;
    this.castFired = false;
    this.attackCd = this.cfg.attack.cooldownMs;
    this.shots++;
  }

  updateAttack(dt, time) {
    if (!this.attacking) return;
    this.attackT += dt;
    if (this.isMule) {
      const spec = this.cfg.attack.combo[this.attackStep];
      if (this.attackT >= spec.startMs && this.attackT <= spec.startMs + spec.activeMs) this.punchHitTest(spec);
      if (this.attackT >= spec.totalMs) {
        this.attacking = false;
        if (this.queuedAttack && this.attackStep < 2) this.startPunch(this.attackStep + 1);
        else {
          this.comboWindow = this.attackStep < 2 ? this.cfg.attack.comboWindowMs : 0;
          this.attackCd = this.attackStep === 2 ? 180 : 0;
        }
      }
    } else {
      const a = this.cfg.attack;
      if (!this.castFired && this.attackT >= 70) {
        this.castFired = true;
        const burst = this.shots % a.burstEvery === 0;
        const hand = this.handPoint();
        this.scene.spawnPulse?.(hand.x, hand.y, this.facing, burst, a);
        app.audio?.sfx(burst ? 'burst' : 'pulse');
      }
      if (this.attackT >= a.totalMs) this.attacking = false;
    }
  }

  handPoint() { return { x: this.x + this.facing * 16, y: this.y - 20 }; }

  punchHitTest(spec) {
    const b = this.body;
    const x0 = this.facing > 0 ? b.right : b.left - spec.reach;
    const rect = new Phaser.Geom.Rectangle(x0, this.y - b.height * 0.85, spec.reach, spec.height + 12);
    for (const e of this.scene.enemies.getChildren()) {
      if (!e.active || e.dying || this.hitSet.has(e)) continue;
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, e.body.getBounds(new Phaser.Geom.Rectangle()))) {
        this.hitSet.add(e);
        e.hit(spec.damage, this.facing, spec.knockback);
        app.audio?.sfx(spec.damage > 1 ? 'hit' : 'punch');
        this.scene.fx?.impact(e.x, e.y - e.body.height * 0.5);
        this.scene.onPlayerHitEnemy?.(e, spec);
        if (shakeAllowed() && spec.damage > 1) this.scene.cameras.main.shake(90, 0.004);
      }
    }
  }

  // ------------------------------------------------------------- skateboard tricks
  startTrick() {
    this.trickT = 1;
    this.trickDone = true;
    this.trickStart = this.scene.time.now;
    app.audio?.sfx('trick');
    this.scene.onTrickStarted?.(this);
  }

  /** Rails: landing on a rail while riding starts a grind that keeps your speed. */
  updateGrind(dt, axis) {
    if (!this.isMule) return;
    if (this.grindRail) {
      const r = this.grindRail;
      const over = this.x > r.left - 4 && this.x < r.right + 4;
      if (!over || this.stun > 0 || this.dashing || (!this.grounded && this.body.velocity.y < -50)) return this.endGrind();
      this.body.setVelocityX(this.facing * Math.max(170, Math.abs(this.body.velocity.x)));
      this.grindTick += dt;
      this.rideCharge = Math.max(this.rideCharge, 0.7);
      if (this.grindTick > 70) { this.grindTick = 0; this.scene.fx?.sparks(this.x - this.facing * 6, this.y); }
      this.grindScoreT = (this.grindScoreT ?? 0) + dt;
      if (this.grindScoreT > 260) { this.grindScoreT = 0; this.scene.onGrindTick?.(this); }
      app.audio?.loop('grind', 0.8);
    } else app.audio?.loop('grind', 0);
  }

  beginGrind(rail) {
    if (this.grindRail || !this.isMule || !this.riding) return;
    this.grindRail = rail;
    this.grindScoreT = 0;
    this.airRide = true;
    this.trickDone = true;
    app.audio?.sfx('rail');
    this.scene.onGrindStart?.(this);
  }

  endGrind() {
    if (!this.grindRail) return;
    this.grindRail = null;
    app.audio?.loop('grind', 0);
  }

  // -------------------------------------------------------------------- damage
  hurt(amount, srcX, knock = 170) {
    if (this.dead || this.iframes > 0 || this.scene.frozen) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.iframes = IFRAME_MS;
    this.stun = STUN_MS;
    this.attacking = false;
    this.dashing = false;
    this.body.allowGravity = true;
    this.endGrind();
    this.rideCharge = 0;
    this.riding = false;
    this.comboWindow = 0;
    const dir = this.x >= srcX ? 1 : -1;
    this.body.setAccelerationX(0);
    this.body.setVelocity(dir * knock, -180);
    this.facing = -dir;
    app.audio?.sfx('hurt');
    if (shakeAllowed()) this.scene.cameras.main.shake(140, 0.006);
    this.scene.fx?.impact(this.x, this.y - 16, 'p_pink');
    this.scene.onPlayerHurt?.(this);
    if (this.hp <= 0) this.die();
    return true;
  }

  heal(n = 1) {
    this.hp = Math.min(this.maxHp, this.hp + n);
    app.audio?.sfx('heal');
    this.scene.emitHud?.();
  }

  die() {
    this.dead = true;
    this.body.setVelocity(0, 0);
    this.body.setAccelerationX(0);
    this.setFrame('hurt_0');
    app.audio?.loop('skate', 0);
    app.audio?.loop('grind', 0);
    this.scene.onPlayerDied?.(this);
  }

  respawn(x, y) {
    this.dead = false;
    this.setPosition(x, y);
    this.body.reset(x, y);
    this.hp = this.maxHp;
    this.iframes = 1600;
    this.stun = 0;
    this.attacking = false;
    this.dashing = false;
    this.body.allowGravity = true;
    this.rideCharge = 0;
    this.riding = false;
    this.setAlpha(1);
    this.scene.emitHud?.();
  }

  // ----------------------------------------------------------- frames & sounds
  updateSounds(ground) {
    const speed = Math.abs(this.body.velocity.x);
    app.audio?.loop('skate', this.riding && ground ? Math.min(1, speed / this.ph.rideMaxSpeed) : 0);
  }

  setPose(name) {
    if (this.lastFrame === name) return;
    this.lastFrame = name;
    this.anims.stop();
    this.setFrame(name);
  }

  playLoop(name, rate = 1) {
    this.lastFrame = '';
    this.anims.timeScale = rate;
    this.anims.play(`${this.charKey}:${name}`, true);
  }

  pickFrame(forceIdle = false) {
    this.setFlipX(this.facing < 0);
    const b = this.body;
    if (this.dead) return this.setPose('hurt_0');
    if (this.stun > 0) return this.setPose('hurt_0');
    if (this.dashing) return this.setPose('dash_0');
    if (this.attacking) {
      if (this.isMule) {
        const s = this.cfg.attack.combo[this.attackStep];
        const i = this.attackT < s.startMs ? 0 : this.attackT < s.startMs + s.activeMs ? 1 : 2;
        return this.setPose(`punch${this.attackStep + 1}_${i}`);
      }
      return this.setPose(`cast_${this.attackT < 70 ? 0 : this.attackT < 130 ? 1 : 2}`);
    }
    const ground = this.grounded;
    if (this.grindRail) return this.playLoop('ride', 1);
    if (!ground) {
      if (this.isMule && this.airRide) {
        if (this.trickT) return this.playLoop('trick', 1);
        return this.setPose(b.velocity.y < 0 ? 'jump_ride_0' : 'fall_ride_0');
      }
      return this.setPose(b.velocity.y < -10 ? 'jump_0' : 'fall_0');
    }
    if (forceIdle) return this.playLoop('idle', 1);
    const speed = Math.abs(b.velocity.x);
    if (speed > 14) {
      if (this.isMule && this.riding) return this.playLoop('ride', Phaser.Math.Clamp(speed / 140, 0.6, 1.8));
      return this.playLoop('run', Phaser.Math.Clamp(speed / this.ph.walkSpeed, 0.6, 1.6));
    }
    return this.playLoop('idle', 1);
  }
}
