// Shared platformer engine. Each stage scene extends this and only describes its level
// (platforms, enemies, pickups, hazards, decor) plus its story beats; movement,
// collisions, combat, checkpoints, death/respawn, camera, parallax, HUD updates, pause
// and stage completion live here so all four stages behave identically.
import Phaser from 'phaser';
import { app, motionAllowed } from '../../app.js';
import { getStage, nextStageId, evaluateStage, STAGES } from '../../data/stages.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Fx } from '../systems/Fx.js';
import { Cutscene } from '../systems/Cutscene.js';
import { pixelText } from '../systems/pixelText.js';
import { otherCharacter } from '../../data/characters.js';

import { VIEW_W, VIEW_H } from '../constants.js';
export { VIEW_W, VIEW_H };

export class LevelScene extends Phaser.Scene {
  constructor(sceneKey, stageId) {
    super(sceneKey);
    this.stageId = stageId;
  }

  init(data) {
    this.startData = data ?? {};
  }

  // ======================================================================= lifecycle
  create() {
    const pm = app.progress;
    this.stage = getStage(this.stageId);
    this.offs = [];
    this.frozen = false;
    this.finished = false;
    this.paused = false;
    this.score = 0;
    this.combo = { n: 0, t: 0 };
    this.chips = 0;
    this.layers = [];
    this.interactables = [];
    this.lasers = [];
    this.cars = [];
    this.pads = [];
    this.kickers = [];
    this.fragSprites = new Map();
    this.checkpoints = [];
    this.lastGroundKind = 'ground';
    this.hudTimer = 0;
    this.promptText = null;

    // --- restore or start the run
    const run = pm.state.run;
    const resume = this.startData.resume && run && run.stageId === this.stageId;
    this.run = resume
      ? { checkpoint: run.checkpoint, defeated: new Set(run.defeated), flags: { ...run.flags }, counters: { ...run.counters }, variation: run.variation }
      : { checkpoint: 0, defeated: new Set(), flags: {}, counters: {}, variation: this.startData.variation ?? pm.state.prefs.stage3Variation ?? 'clear' };
    if (!resume) pm.saveRun({ stageId: this.stageId, checkpoint: 0, defeated: [], flags: {}, counters: {}, variation: this.run.variation });

    this.spec = this.buildLevel();
    this.fx = new Fx(this);
    this.cine = new Cutscene(this);
    this.cameras.main.setBackgroundColor('#10091D');
    const top = this.spec.world.top ?? 0;
    this.physics.world.setBounds(0, top - 400, this.spec.world.w, this.spec.world.h - top + 1000);
    this.physics.world.setBoundsCollision(true, true, false, false);

    this.addBackground(this.spec.bg);
    this.groundGroup = this.physics.add.staticGroup();
    this.oneWayGroup = this.physics.add.staticGroup();
    this.railGroup = this.physics.add.staticGroup();
    this.enemies = this.add.group({ runChildUpdate: false });
    this.pulses = this.physics.add.group({ allowGravity: false });
    this.pickups = this.physics.add.group({ allowGravity: false });

    this.buildPlatforms(this.spec.platforms ?? []);
    this.addWorldWalls();
    this.addDecor(this.spec.decor ?? []);
    this.spawnPlayer();
    this.buildContent();
    this.setupCollisions();
    this.setupCamera();
    this.bindEvents();
    this.specialSetup?.();

    app.currentLevel = this;
    app.input.setGameplayActive(true);
    this.cameras.main.fadeIn(450, 16, 9, 29);
    app.audio?.playMusic(this.stage.music ?? 'drag');
    app.bus.emit('scene:level', { stageId: this.stageId, scene: this });
    this.emitHud();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.onStart?.(!!resume);
  }

  cleanup() {
    for (const off of this.offs) off();
    this.offs = [];
    this.fx?.destroy();
    this.cine?.destroy();
    app.audio?.stopLoops();
    if (app.currentLevel === this) app.currentLevel = null;
    app.input.setGameplayActive(false);
    app.bus.emit('hud:hide');
    app.bus.emit('scene:left', { stageId: this.stageId });
  }

  track(off) { this.offs.push(off); return off; }

  // ========================================================================== world
  buildLevel() { throw new Error('buildLevel() must be implemented by the stage'); }

  addBackground(bg) {
    if (!bg) return;
    this.skyImg = this.add.image(0, 0, bg.sky).setOrigin(0).setScrollFactor(0).setDepth(-100);
    for (const L of bg.layers ?? []) {
      const mk = (key, alpha) => {
        const t = this.add.tileSprite(0, L.y ?? 0, VIEW_W, VIEW_H, key).setOrigin(0).setScrollFactor(0).setDepth(L.depth ?? -90 + this.layers.length).setAlpha(alpha);
        if (L.tint) t.setTint(L.tint);
        return t;
      };
      const base = mk(L.key, 1);
      const alt = L.alt ? mk(L.alt, 0) : null;
      this.layers.push({ base, alt, f: L.f, fy: L.fy ?? 0, y: L.y ?? 0 });
      if (alt && motionAllowed()) {
        // lit windows swap between two patterns so the skyline feels alive
        this.time.addEvent({ delay: 900 + Math.random() * 900, loop: true, callback: () => this.tweens.add({ targets: alt, alpha: Phaser.Math.FloatBetween(0, 0.85), duration: 700 }) });
      }
    }
    if (bg.flyers && motionAllowed()) {
      const spawn = () => {
        const key = Math.random() < 0.5 ? 'flyer_a' : 'flyer_b';
        const dir = Math.random() < 0.5 ? 1 : -1;
        const f = this.add.image(dir > 0 ? -30 : VIEW_W + 30, Phaser.Math.Between(20, 110), key).setScrollFactor(0).setDepth(-95).setFlipX(dir < 0).setAlpha(0.8);
        this.tweens.add({ targets: f, x: dir > 0 ? VIEW_W + 30 : -30, duration: Phaser.Math.Between(9000, 16000), onComplete: () => f.destroy() });
      };
      this.time.addEvent({ delay: 3500, loop: true, callback: spawn });
      spawn();
    }
  }

  buildPlatforms(list) {
    for (const p of list) {
      const kind = p.kind ?? 'ground';
      const theme = p.theme ?? this.spec.theme;
      if (kind === 'ground') {
        this.add.tileSprite(p.x, p.y, p.w, 16, `g_${theme}_top`).setOrigin(0).setDepth(2);
        if (p.h > 16) this.add.tileSprite(p.x, p.y + 16, p.w, p.h - 16, `g_${theme}_fill`).setOrigin(0).setDepth(1);
        this.addBody(this.groundGroup, p.x, p.y, p.w, p.h);
      } else if (kind === 'ledge') {
        if (!p.hidden) this.add.tileSprite(p.x, p.y, p.w, 8, `ledge_${theme}`).setOrigin(0).setDepth(2);
        const b = this.addBody(this.oneWayGroup, p.x, p.y, p.w, 6);
        b.body.checkCollision.down = false; b.body.checkCollision.left = false; b.body.checkCollision.right = false;
      } else if (kind === 'rail') {
        this.add.tileSprite(p.x, p.y, p.w, 8, 'rail_t').setOrigin(0).setDepth(3);
        for (const px of [p.x + 2, p.x + p.w - 8]) this.add.image(px, p.y + 4, 'rail_post').setOrigin(0, 0).setDepth(1);
        const b = this.addBody(this.railGroup, p.x, p.y, p.w, 5);
        b.body.checkCollision.down = false; b.body.checkCollision.left = false; b.body.checkCollision.right = false;
        b.rail = { left: p.x, right: p.x + p.w };
      } else if (kind === 'wall') {
        this.add.tileSprite(p.x, p.y, p.w, p.h, `g_${theme}_fill`).setOrigin(0).setDepth(1);
        this.addBody(this.groundGroup, p.x, p.y, p.w, p.h);
      }
    }
  }

  addBody(group, x, y, w, h) {
    const z = this.add.zone(x + w / 2, y + h / 2, w, h);
    this.physics.add.existing(z, true);
    group.add(z);
    return z;
  }

  /** Invisible walls at both ends of the level so nobody can walk off the map. */
  addWorldWalls() {
    const top = (this.spec.world.top ?? 0) - 400;
    const height = this.spec.world.h - top + 400;
    this.addBody(this.groundGroup, -24, top, 24, height);
    this.addBody(this.groundGroup, this.spec.world.w, top, 24, height);
  }

  /**
   * A solid holographic gate that blocks the way until open() is called (Stage 01 holds
   * the meeting point behind it until every Lightwork is down; Stage 04 holds the
   * rooftop until enough memory objects are open). Returns { open, isOpen, label }.
   */
  addGate(x, y, { w = 14, h = 64, label = null, tex = 'gate_holo' } = {}) {
    const body = this.addBody(this.groundGroup, x - w / 2, y - h, w, h);
    const sprite = this.add.sprite(x, y, `${tex}_0`).setOrigin(0.5, 1).setDepth(6).setAlpha(0.9);
    if (this.anims.exists(tex)) sprite.play(tex);
    sprite.setDisplaySize(w, h);
    const g = this.add.image(x, y - h / 2, 'glow_blue').setBlendMode(Phaser.BlendModes.ADD).setDepth(5).setAlpha(0.4).setScale(0.8, 1.6);
    const gate = {
      x, y, w, h, label, body, sprite, glow: g, opened: false,
      isOpen() { return this.opened; },
      open: () => {
        if (gate.opened) return;
        gate.opened = true;
        this.groundGroup.remove(body, true, true);
        app.audio?.sfx('unlock');
        this.fx.burst(x, y - h / 2, 'p_blue', 22, 120);
        this.tweens.add({ targets: [sprite, g], alpha: 0, duration: 500, onComplete: () => { sprite.destroy(); g.destroy(); } });
      },
    };
    return gate;
  }

  addDecor(list) {
    for (const d of list) {
      const key = d.anim ? `${d.tex}_0` : d.tex;
      const s = this.add.sprite(d.x, d.y, this.textures.exists(key) ? key : d.tex).setOrigin(d.ox ?? 0.5, d.oy ?? 1).setDepth(d.depth ?? 0);
      if (d.anim && this.anims.exists(d.anim)) s.play(d.anim);
      if (d.flip) s.setFlipX(true);
      if (d.scale) s.setScale(d.scale);
      if (d.alpha != null) s.setAlpha(d.alpha);
      if (d.sf != null) s.setScrollFactor(d.sf);
      if (d.tint) s.setTint(d.tint);
      if (d.glow) {
        const g = this.add.image(d.x + (d.gx ?? 0), d.y - (d.gy ?? 0), d.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth((d.depth ?? 0) - 0.1).setAlpha(d.galpha ?? 0.55).setScale(d.gscale ?? 1);
        if (d.sf != null) g.setScrollFactor(d.sf);
        if (d.flicker && motionAllowed()) this.tweens.add({ targets: g, alpha: { from: (d.galpha ?? 0.55) * 0.5, to: d.galpha ?? 0.55 }, duration: 250 + Math.random() * 500, yoyo: true, repeat: -1 });
      }
      if (d.bob && motionAllowed()) this.tweens.add({ targets: s, y: d.y - d.bob, duration: 1400 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  // ========================================================================= content
  spawnPlayer() {
    const cp = this.run.checkpoint > 0 ? this.spec.checkpoints?.[this.run.checkpoint - 1] : null;
    const at = cp ? { x: cp.x, y: cp.y } : this.spec.spawn;
    this.player = new Player(this, at.x, at.y, app.progress.character);
    this.respawnPoint = { x: at.x, y: at.y };
  }

  buildContent() {
    const spec = this.spec;
    const pm = app.progress;
    for (const e of spec.enemies ?? []) {
      if (this.run.defeated.has(e.id)) continue;
      this.enemies.add(new Enemy(this, e));
    }
    this.enemyTotal = (spec.enemies ?? []).length;

    for (const f of spec.fragments ?? []) {
      if (pm.has(this.stageId, f.key)) continue; // already owned: never re-awarded
      this.spawnFragment(f);
    }
    for (const c of spec.chips ?? []) this.spawnChip(c.x, c.y);
    for (const h of spec.hearts ?? []) this.spawnHeart(h.x, h.y);

    (spec.checkpoints ?? []).forEach((c, i) => this.spawnCheckpoint(c, i + 1));
    for (const h of spec.hazards ?? []) this.spawnHazard(h);
    for (const p of spec.pads ?? []) this.spawnPad(p);
    for (const k of spec.kickers ?? []) this.spawnKicker(k);
  }

  spawnFragment(f) {
    const s = this.physics.add.sprite(f.x, f.y, 'frag_0').setDepth(8);
    s.body.setAllowGravity(false).setSize(16, 22).setOffset(2, 2);
    s.play('frag');
    s.fragKey = f.key;
    s.glowImg = this.add.image(f.x, f.y, 'glow_lav').setBlendMode(Phaser.BlendModes.ADD).setDepth(7).setAlpha(0.7);
    if (motionAllowed()) this.tweens.add({ targets: [s, s.glowImg], y: f.y - 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.pickups.add(s);
    this.fragSprites.set(f.key, s);
    return s;
  }

  spawnChip(x, y) {
    const s = this.physics.add.sprite(x, y, 'chip_0').setDepth(8);
    s.body.setAllowGravity(false).setSize(10, 10);
    s.play('chip');
    s.isChip = true;
    this.pickups.add(s);
  }

  spawnHeart(x, y) {
    const s = this.physics.add.sprite(x, y, 'heart_pick').setDepth(8);
    s.body.setAllowGravity(false);
    s.isHeart = true;
    if (motionAllowed()) this.tweens.add({ targets: s, y: y - 3, duration: 700, yoyo: true, repeat: -1 });
    this.pickups.add(s);
  }

  spawnCheckpoint(c, index) {
    const active = this.run.checkpoint >= index;
    const s = this.physics.add.sprite(c.x, c.y, active ? 'beacon_on_0' : 'beacon_off').setOrigin(0.5, 1).setDepth(3);
    s.body.setAllowGravity(false).setSize(22, 40).setOffset(-3, -4);
    s.index = index;
    s.active2 = active;
    if (active) s.play('beacon_on');
    this.checkpoints.push(s);
  }

  activateCheckpoint(s) {
    if (s.active2) return;
    s.active2 = true;
    s.play('beacon_on');
    this.run.checkpoint = Math.max(this.run.checkpoint, s.index);
    this.respawnPoint = { x: s.x, y: s.y };
    app.audio?.sfx('checkpoint');
    this.fx.burst(s.x, s.y - 28, 'p_pink', 14, 90);
    this.fx.label(s.x, s.y - 44, 'CHECKPOINT', '#FF72C6');
    this.saveRun();
  }

  saveRun() {
    app.progress.saveRun({
      stageId: this.stageId, checkpoint: this.run.checkpoint, defeated: [...this.run.defeated],
      flags: this.run.flags, counters: this.run.counters, variation: this.run.variation,
    });
  }

  spawnHazard(h) {
    if (h.type === 'laser') {
      const postKey = h.post ?? 'laser_post', beamKey = h.beam ?? 'laser_0', bw = h.bw ?? 8;
      const top = this.add.image(h.x, h.y - h.h, postKey).setOrigin(0.5, 0).setDepth(4);
      const bot = this.add.image(h.x, h.y, postKey).setOrigin(0.5, 1).setFlipY(true).setDepth(4);
      const beam = this.add.tileSprite(h.x, h.y - h.h / 2, bw, h.h - 40, beamKey).setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
      beam.angle = 0;
      // the damaging beam fills the whole gate (posts included) so it cannot be walked under
      this.lasers.push({ h, top, bot, beam, t: h.phase ?? 0, on: false, rect: new Phaser.Geom.Rectangle(h.x - bw / 2, h.y - h.h + 30, bw, h.h - 32) });
    } else if (h.type === 'traffic') {
      const car = this.add.sprite(h.x0, h.y, h.tex ?? 'car_b').setOrigin(0.5, 1).setDepth(5).setFlipX(h.speed < 0);
      const light = this.add.image(0, 0, 'cone_light').setBlendMode(Phaser.BlendModes.ADD).setDepth(4).setAlpha(0.7).setOrigin(0, 0.5).setScale(1.2, 0.5);
      this.cars.push({ h, car, light, x: h.x0 + (h.offset ?? 0) });
    } else if (h.type === 'flood') {
      // motion-sensor floodlight: a lamp on a post that lights a cone of ground on a cycle.
      // The cone only hurts while it is fully lit; it flickers for a moment first (a warning).
      const post = h.post ?? 70, w = h.w ?? 54;
      this.add.image(h.x, h.y, 'flood_post').setOrigin(0.5, 1).setDepth(4);
      const cone = this.add.image(0, 0, 'cone_light').setOrigin(0.5, 0).setScale(w / 62, (post - 8) / 48).setTint(0xffd98a).setBlendMode(Phaser.BlendModes.ADD);
      const pool = this.add.image(0, post - 8, 'glow_warm').setScale((w / 48) * 1.3, 0.28).setBlendMode(Phaser.BlendModes.ADD);
      const beam = this.add.container(h.x, h.y - post + 8, [cone, pool]).setDepth(4);
      this.lasers.push({ h, flood: true, beam, t: h.phase ?? 0, on: false, rect: new Phaser.Geom.Rectangle(h.x - w / 2 + 4, h.y - 46, w - 8, 46) });
    }
  }

  spawnPad(p) {
    const s = this.physics.add.sprite(p.x, p.y, 'pad_0').setOrigin(0.5, 1).setDepth(3);
    s.body.setAllowGravity(false).setSize(22, 6).setOffset(0, 2);
    s.play('pad');
    this.pads.push(s);
  }

  spawnKicker(k) {
    const s = this.add.image(k.x, k.y, 'kicker').setOrigin(0.5, 1).setDepth(3);
    this.kickers.push({ s, rect: new Phaser.Geom.Rectangle(k.x - 20, k.y - 20, 40, 20) });
  }

  // ===================================================================== collisions
  setupCollisions() {
    const p = this.player;
    p.body.setCollideWorldBounds(true);
    this.physics.add.collider(p, this.groundGroup);
    this.colOneWay = this.physics.add.collider(p, this.oneWayGroup, () => { this.lastGroundKind = 'ledge'; });
    this.physics.add.collider(p, this.railGroup, (pl, rail) => {
      if (pl.body.touching.down) { this.lastGroundKind = 'ledge'; if (pl.isMule && pl.riding) pl.beginGrind(rail.rail); }
    });
    this.physics.add.collider(this.enemies, this.groundGroup);
    this.physics.add.collider(this.enemies, this.oneWayGroup);
    this.physics.add.overlap(p, this.pickups, (pl, pk) => this.onPickup(pk));
    this.physics.add.overlap(this.pulses, this.enemies, (pu, en) => this.onPulseHit(pu, en));
    this.physics.add.collider(this.pulses, this.groundGroup, (pu) => this.killPulse(pu));
    for (const c of this.checkpoints) this.physics.add.overlap(p, c, () => this.activateCheckpoint(c));
    for (const pad of this.pads) this.physics.add.overlap(p, pad, () => this.usePad(pad));
  }

  dropThrough() {
    if (this.lastGroundKind !== 'ledge') return false;
    this.colOneWay.active = false;
    this.time.delayedCall(300, () => { if (this.colOneWay) this.colOneWay.active = true; });
    this.player.body.setVelocityY(40);
    this.player.coyote = 0;
    return true;
  }

  usePad(pad) {
    const p = this.player;
    if (p.dead || p.body.velocity.y < -100) return;
    p.body.setVelocityY(-430);
    p.airRide = p.isMule && p.riding;
    p.trickDone = false;
    pad.play('pad');
    app.audio?.sfx('doublejump');
    this.fx.burst(pad.x, pad.y - 6, 'p_pink', 8, 80);
  }

  onPickup(pk) {
    if (!pk.active) return;
    if (pk.isChip) {
      pk.destroy();
      this.chips++;
      app.audio?.sfx('collect');
      this.bump(25, null, pk.x, pk.y - 8, false);
    } else if (pk.isHeart) {
      if (this.player.hp >= this.player.maxHp) return; // leave it for when it is needed
      pk.destroy();
      this.player.heal(1);
      this.fx.label(pk.x, pk.y - 8, '+1 HP', '#FF72C6');
    } else if (pk.fragKey) this.collectFragment(pk.fragKey, pk);
  }

  collectFragment(key, sprite) {
    const def = this.stage.fragments.find((f) => f.key === key);
    const added = app.progress.collect(this.stageId, key);
    if (sprite) {
      this.fx.burst(sprite.x, sprite.y, 'p_lav', 26, 140);
      sprite.glowImg?.destroy();
      sprite.destroy();
    }
    this.fragSprites.delete(key);
    if (!added) return;
    app.audio?.sfx('fragment');
    this.fx.flash(0xc8a7ff, 0.3, 220);
    app.bus.emit('fragment:toast', { key, label: def?.label ?? key, excerpt: def?.excerpt ?? def?.note ?? null, required: !!def?.required });
    this.onFragmentCollected?.(key, def);
    this.emitHud();
  }

  // ======================================================================== combat
  spawnPulse(x, y, dir, burst, a) {
    const spec = burst ? a.burst : a.pulse;
    if (this.pulses.countActive() >= 4) return;
    const s = this.pulses.create(x, y, burst ? 'burst_0' : 'pulse_0').setDepth(12);
    s.play(burst ? 'burst' : 'pulse');
    s.body.setAllowGravity(false).setVelocity(dir * spec.speed, 0);
    s.body.setSize(burst ? 14 : 8, burst ? 14 : 8, true);
    s.dmg = spec.damage; s.knock = spec.knockback; s.startX = x; s.range = spec.rangePx; s.dir = dir; s.burst = burst;
    this.fx.dust(x, y, 'p_pink', 3);
  }

  killPulse(s) {
    if (!s.active) return;
    this.fx.impact(s.x, s.y, 'p_pink');
    s.destroy();
  }

  onPulseHit(a, b) {
    // Phaser passes a plain-Group member (the enemy) first when it is paired with a physics group (the
    // pulses), so the two arguments can arrive in either order. Tell them apart by what they are.
    const pu = this.pulses.contains(a) ? a : b;
    const en = pu === a ? b : a;
    if (!pu?.active || !en?.active || en.dying || typeof en.hit !== 'function') return;
    en.hit(pu.dmg, pu.dir, pu.knock);
    app.audio?.sfx('hit');
    this.fx.impact(en.x, en.y - 10, 'p_pink');
    this.onPlayerHitEnemy(en);
    if (!pu.burst) pu.destroy();
  }

  onPlayerHitEnemy() {
    this.combo.n++;
    this.combo.t = 3200;
    this.emitHud();
  }

  onEnemyDefeated(en) {
    this.run.defeated.add(en.id);
    app.progress.addDefeat();
    this.bump(100, 'LIGHTWORK', en.x, en.y - 24, true);
    const roll = (en.id.length * 7 + this.run.defeated.size * 13) % 10;
    this.spawnChip(en.x - 8, en.y - 20); this.spawnChip(en.x + 8, en.y - 20);
    if (roll < 4) this.spawnHeart(en.x, en.y - 30);
    this.saveRun();
    this.onProgressChanged();
    if (this.defeatedAll()) this.onAllDefeated?.();
  }

  defeatedAll() {
    const need = this.stage.required.defeats ?? 0;
    return need > 0 && this.run.defeated.size >= need;
  }

  // ---- score / combo
  bump(points, label, x, y, comboUp = true) {
    if (comboUp) { this.combo.n++; this.combo.t = 3200; }
    const mult = 1 + Math.floor(this.combo.n / 3);
    this.score += points * mult;
    if (label) this.fx.label(x, y, `${label} +${points * mult}`, '#43D9FF');
    app.progress.reportCombo(this.combo.n);
    this.emitHud();
  }

  onTrickStarted() { this.emitHud(); }
  onTrickLanded(p) {
    this.bump(150, 'TRICK', p.x, p.y - 40);
    if (this.combo.n >= 5) app.progress.grant('tricks');
  }
  onGrindStart(p) { this.fx.label(p.x, p.y - 40, 'GRIND', '#C8A7FF'); }
  onGrindTick(p) { this.bump(40, null, p.x, p.y - 30); }

  onPlayerHurt() { this.combo.n = 0; this.combo.t = 0; this.emitHud(); }

  // ========================================================================= death
  onPlayerDied() {
    app.progress.addDeath();
    this.frozen = true;
    this.fx.flash(0xff4d6d, 0.5, 200);
    this.cameras.main.fadeOut(420, 16, 9, 29);
    this.time.delayedCall(520, () => {
      if (!this.scene.isActive()) return;
      this.respawnPlayer();
    });
  }

  respawnPlayer() {
    this.player.respawn(this.respawnPoint.x, this.respawnPoint.y);
    this.frozen = false;
    this.cameras.main.fadeIn(350, 16, 9, 29);
    this.emitHud();
  }

  pitFall() {
    const p = this.player;
    if (p.dead) return;
    p.hp = Math.max(0, p.hp - 1);
    app.audio?.sfx('hurt');
    if (p.hp <= 0) { p.die(); return; }
    this.frozen = true;
    this.cameras.main.fadeOut(260, 16, 9, 29);
    this.time.delayedCall(340, () => {
      p.setPosition(this.respawnPoint.x, this.respawnPoint.y);
      p.body.reset(this.respawnPoint.x, this.respawnPoint.y);
      p.iframes = 1500; p.stun = 0;
      this.frozen = false;
      this.cameras.main.fadeIn(260, 16, 9, 29);
      this.emitHud();
    });
  }

  // ===================================================================== camera/hud
  setupCamera() {
    const cam = this.cameras.main;
    const top = this.spec.world.top ?? 0;
    cam.setBounds(0, top, this.spec.world.w, this.spec.world.h - top);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setDeadzone(24, 16);
    cam.setRoundPixels(true);
  }

  emitHud() {
    const p = this.player;
    const st = evaluateStage(this.stageId, this.runState());
    const pm = app.progress;
    const req = this.stage.required;
    const have = req.fragments.filter((k) => pm.has(this.stageId, k)).length;
    const optHave = this.stage.fragments.filter((f) => !f.required && pm.has(this.stageId, f.key)).length;
    const optTotal = this.stage.fragments.filter((f) => !f.required).length;
    const mult = 1 + Math.floor(this.combo.n / 3);
    app.bus.emit('hud:update', {
      character: p?.charKey ?? pm.character,
      hp: p?.hp ?? 0, maxHp: p?.maxHp ?? 0,
      stageNumber: this.stage.number, stageTitle: this.stage.title,
      objective: this.objectiveText(st),
      fragments: { have, need: req.fragments.length, optHave, optTotal },
      defeats: req.defeats ? { have: Math.min(this.run.defeated.size, req.defeats), need: req.defeats } : null,
      chips: this.chips, score: this.score,
      combo: this.combo.n > 1 ? { n: this.combo.n, mult } : null,
      prompt: this.promptText,
      riding: !!p?.riding,
    });
  }

  runState() {
    const pm = app.progress;
    return { fragments: pm.state.collected[this.stageId] ?? [], defeats: this.run.defeated.size, flags: this.run.flags, counters: this.run.counters };
  }

  objectiveText(st) {
    if (st.complete) return this.stage.objective;
    return `${this.stage.objective}${st.missing.length ? ` (left: ${st.missing.join(', ')})` : ''}`;
  }

  onProgressChanged() { this.emitHud(); }

  setFlag(name, value = true) {
    this.run.flags[name] = value;
    this.saveRun();
    this.emitHud();
  }

  stageComplete() {
    return evaluateStage(this.stageId, this.runState());
  }

  // ======================================================================== events
  bindEvents() {
    this.track(app.bus.on('settings:changed', () => this.emitHud()));
    this.track(app.bus.on('cine:skip', () => this.cine.skip()));
  }

  addInteractable(i) { this.interactables.push(i); return i; }

  // =========================================================================== loop
  update(time, dt) {
    const inp = app.input;
    inp.begin();
    const p = this.player;
    if (!p) return;
    const cam = this.cameras.main;

    if (!this.frozen && inp.pressed('pause') && !this.finished) { app.bus.emit('pause:request', { scene: this }); return; }

    p.update(time, dt);
    for (const e of this.enemies.getChildren()) e.update(time, dt);

    // camera look-ahead
    cam.followOffset.x = Phaser.Math.Linear(cam.followOffset.x, -p.facing * 26, 0.05);

    // parallax
    // Horizontal parallax scrolls the tile; vertical parallax moves the strip itself so a
    // tall level (the rooftop climb) never repeats the skyline vertically.
    for (const L of this.layers) {
      L.base.tilePositionX = cam.scrollX * L.f;
      if (L.alt) L.alt.tilePositionX = L.base.tilePositionX;
      if (L.fy) {
        const y = L.y - cam.scrollY * L.fy;
        L.base.y = y;
        if (L.alt) L.alt.y = y;
      }
    }

    // pulses: expire after their range
    for (const s of this.pulses.getChildren()) if (s.active && Math.abs(s.x - s.startX) > s.range) this.killPulse(s);

    this.updateHazards(time, dt);
    this.updateKickers(p);
    this.updateInteraction();

    if (this.combo.t > 0) { this.combo.t -= dt; if (this.combo.t <= 0) { this.combo.n = 0; this.emitHud(); } }
    if (!p.dead && p.y > this.spec.world.h + 40) this.pitFall();
    this.lastGroundKind = p.grounded ? this.lastGroundKind : 'air';
    this.hudTimer += dt;
    if (this.hudTimer > 250) { this.hudTimer = 0; this.emitHud(); }
    this.extraUpdate?.(time, dt);
  }

  updateHazards(time, dt) {
    const p = this.player;
    const pb = p.dead ? null : p.body.getBounds(new Phaser.Geom.Rectangle());
    for (const L of this.lasers) {
      L.t += dt;
      const h = L.h, cyc = h.onMs + h.offMs, m = L.t % cyc;
      const on = m < h.onMs, warn = !on && m > cyc - 420;
      if (on !== L.on) { L.on = on; if (on) app.audio?.sfx(L.flood ? 'thump' : 'zap'); }
      L.beam.setVisible(on || warn).setAlpha(on ? 1 : 0.25);
      if (L.beam.tilePositionY !== undefined) L.beam.tilePositionY += 6;
      if (on && pb && !this.frozen && Phaser.Geom.Intersects.RectangleToRectangle(L.rect, pb)) p.hurt(1, L.h.x, 200);
    }
    for (const c of this.cars) {
      const h = c.h;
      c.x += h.speed * (dt / 1000);
      const m = h.margin ?? 80;
      const lo = Math.min(h.x0, h.x1) - m, hi = Math.max(h.x0, h.x1) + m;
      if (h.speed > 0 && c.x > hi) c.x = lo; else if (h.speed < 0 && c.x < lo) c.x = hi;
      c.car.setPosition(c.x, h.y);
      c.light.setPosition(c.x + (h.speed > 0 ? 28 : -28), h.y - 8).setFlipX(h.speed < 0).setOrigin(h.speed > 0 ? 0 : 1, 0.5);
      if (pb && !this.frozen) {
        const r = new Phaser.Geom.Rectangle(c.x - 26, h.y - 16, 52, 16);
        if (Phaser.Geom.Intersects.RectangleToRectangle(r, pb)) p.hurt(1, c.x, 240);
      }
    }
  }

  updateKickers(p) {
    if (!p.isMule || p.dead) return;
    for (const k of this.kickers) {
      if (p.riding && p.grounded && Math.abs(p.body.velocity.x) > 110 && Phaser.Geom.Rectangle.Contains(k.rect, p.x, p.y - 2)) {
        p.body.setVelocityY(-360);
        p.airRide = true; p.trickDone = false;
        app.audio?.sfx('doublejump');
        this.fx.burst(p.x, p.y, 'p_vio', 10, 90);
      }
    }
  }

  updateInteraction() {
    const p = this.player;
    let best = null, bd = 1e9;
    if (!this.frozen && !p.dead) {
      for (const i of this.interactables) {
        if (i.enabled && !i.enabled()) continue;
        const dx = Math.abs(p.x - i.x), dy = Math.abs((p.y - 14) - i.y);
        if (dx < (i.range ?? 34) && dy < (i.rangeY ?? 44) && dx < bd) { best = i; bd = dx; }
      }
    }
    const text = best ? `E  ${typeof best.label === 'function' ? best.label() : best.label}` : null;
    if (text !== this.promptText) { this.promptText = text; this.emitHud(); }
    if (best && app.input.pressed('interact')) { app.audio?.sfx('ui_ok'); best.onInteract(); }
  }

  // ===================================================================== utilities
  /** Runs a blocking scripted sequence; gameplay is frozen and HUD prompt hidden. */
  async cutscene(fn, { key = null, skippable = false } = {}) {
    this.frozen = true;
    this.promptText = null;
    this.emitHud();
    const seen = key && app.progress.hasSeen(key);
    const canSkip = skippable || (seen && app.settings.get().skipSeenScenes);
    app.bus.emit('cine:begin', { canSkip });
    try {
      await fn(this.cine);
    } finally {
      app.bus.emit('cine:end');
      this.cine.reset();
      if (key) app.progress.see(key);
      this.frozen = false;
    }
  }

  fadeTo(sceneKey, data, ms = 500) {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(ms, 16, 9, 29);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(sceneKey, data));
  }

  /** Marks the stage complete, shows the journal, then moves on. */
  async finishStage() {
    if (this.finished) return;
    this.finished = true;
    this.frozen = true;
    const pm = app.progress;
    pm.finishStage(this.stageId);
    app.audio?.sfx('unlock');
    this.fx.flash(0xc8a7ff, 0.5, 400);
    await app.ui.showJournal(this.stageId);
    const next = nextStageId(this.stageId);
    if (next) this.fadeTo(STAGES[next].scene, { resume: false });
    else this.fadeTo('MainMenuScene', {});
  }

  restartFromCheckpoint() {
    this.saveRun();
    this.scene.restart({ resume: true });
  }

  exitToMenu() {
    this.saveRun();
    this.fadeTo('MainMenuScene', {}, 350);
  }

  wait(ms) { return this.cine.wait(ms); }

  // ============================================================ story / cinematic helpers
  get otherKey() { return otherCharacter(app.progress.character); }

  /** Short dialogue that freezes the world (enemies, hazards) while it is open. */
  async talk(lines) {
    if (this.talking) return;
    this.talking = true;
    const was = this.frozen;
    this.frozen = true;
    this.promptText = null;
    this.emitHud();
    try { await app.ui.dialogue.say(lines); } finally { this.frozen = was; this.talking = false; }
  }

  /** A standalone character sprite for scripted scenes (never the controllable player). */
  cast(charKey, x, y, anim = 'idle', flip = false) {
    const s = this.add.sprite(x, y, charKey, 'idle_0').setOrigin(0.5, 1).setDepth(9).setFlipX(flip);
    s.charKey = charKey;
    this.playCast(s, anim);
    return s;
  }

  playCast(s, anim) { s.anims.play(`${s.charKey}:${anim}`, true); return s; }

  hidePlayer() { this.player.setVisible(false); this.player.setActive(true); }
  showPlayer() { this.player.setVisible(true); }

  /** Pans the camera to a world point and waits (the camera keeps ignoring the player). */
  panTo(x, y, ms = 900) {
    const cam = this.cameras.main;
    cam.stopFollow();
    return this.cine.tween({ targets: cam, scrollX: x - cam.width / 2, scrollY: y - cam.height / 2, duration: ms, ease: 'Sine.easeInOut' });
  }

  followPlayer() {
    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setDeadzone(24, 16);
  }

  /** Walks a cast sprite to x at `speed` px/s (flips to face the way it walks). */
  async walkCast(s, toX, speed = 70, anim = 'run') {
    const dist = Math.abs(toX - s.x);
    if (dist < 1) return;
    s.setFlipX(toX < s.x);
    this.playCast(s, anim);
    await this.cine.tween({ targets: s, x: toX, duration: (dist / speed) * 1000, ease: 'Linear' });
  }

  /** Stage title card (pixel font) that fades in and out without blocking play. */
  titleCard(line1, line2 = null) {
    const make = (text, y, opts, hold) => {
      const img = pixelText(this, VIEW_W / 2, y, text, opts).setScrollFactor(0).setDepth(300).setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: motionAllowed() ? 500 : 1, hold, yoyo: true, delay: 350, onComplete: () => img.destroy() });
      return img;
    };
    make(line1, 96, { color: '#FF72C6', scale: 1, glow: '#FF72C6' }, 2200);
    if (line2) make(line2, 116, { color: '#F4EEFF', scale: 2, glow: '#9B5CFF' }, 2200);
  }

  /** Darkens (or restores) the whole screen for story moments; resolves when done. */
  dimScreen(alpha = 0.3, ms = 700, color = 0x05030c) {
    if (!this.dimmer) this.dimmer = this.add.rectangle(0, 0, VIEW_W, VIEW_H, color, 0).setOrigin(0).setScrollFactor(0).setDepth(250);
    return this.cine.tween({ targets: this.dimmer, fillAlpha: alpha, duration: motionAllowed() ? ms : 1 });
  }

  /** One-time control hint toast for the very first stage. */
  controlHint() {
    if (app.progress.hasSeen('hint-controls')) return;
    app.progress.see('hint-controls');
    const touch = app.input.lastDevice === 'touch';
    app.bus.emit('toast', { kind: 'info', text: touch ? 'Use the on-screen buttons: move, JUMP, HIT, DASH and USE.' : 'Move A/D · Jump Space · Attack J · Dash K · Use E · Pause Esc' });
  }
}
