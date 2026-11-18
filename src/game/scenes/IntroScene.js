// BLAQ STUDIOS: PIXELS & PEONIES - the opening sequence that plays before the main menu.
//
//   1  darkness, a low hum, violet pixel dust and one scan line sweeping down
//   2  the dark-chrome BLAQ STUDIOS logo flickers in, glitches and stabilises
//   3  the logo fractures into pixels that spiral into two streams
//   4  the pixels assemble, petal by petal, into violet blossoms and pink peonies
//      while firefly pixels orbit them
//   5  the flowers drift to opposite sides; "PIXELS & PEONIES" and an italic line appear
//   6  a pulsing ENTER THE WORLD button; pressing it dissolves the flowers into pixel
//      trails, flies the camera through a purple digital tunnel that opens onto neon city
//      light, and fades into the main menu
//
// Every particle is a real, individually animated pixel drawn each frame into a canvas
// texture (software renderer, 480x270, no image files). All motion is a pure function of
// the scene clock, so nothing accumulates state and nothing has to be cleaned up except
// the DOM overlay, the texture and the listeners (see cleanup()).
//
// Accessibility: Skip button + Esc, Enter/click for the button, reduced-motion shows a
// calm static composition, nothing plays audio before a user gesture (the AudioManager
// queues the track until the first click/key), missing audio never blocks the intro.
import Phaser from 'phaser';
import { app, motionAllowed } from '../../app.js';
import { h } from '../../ui/dom.js';
import { VIEW_W as W, VIEW_H as H } from '../constants.js';
import { PAL, mix } from '../art/palette.js';
import { makeCanvas, rng } from '../art/pixel.js';
import { renderTitle, CHROME_DARK } from '../art/title.js';
import { buildCluster, FLOWER_COLORS } from '../art/peonies.js';
import { INTRO_T as T, INTRO_EXIT as X } from '../introTiming.js';

const TEX_KEY = 'intro_buf';
const DN = 260;          // ambient dust pixels
const CLAIMED = 200;     // dust pixels that get pulled into the flowers
const FFN = 14;          // fireflies per flower cluster
const VPX = 240, VPY = 128; // vanishing point of the exit tunnel
const CA = [[170, 130], [312, 130]]; // where the clusters assemble
const CF = [[78, 138], [402, 134]];  // where they drift to
const MID_L = [0x9b5cff, 0xc8a7ff, 0x8a4cf0, 0xb48cff];
const MID_R = [0xff72c6, 0xc8a7ff, 0xff9ad6, 0x9b5cff];
const NEON = [0xff72c6, 0x43d9ff, 0xc8a7ff, 0x9b5cff, 0xffc857];
const FIREFLY = [0xffc857, 0xfff1c2, 0xffc857, 0x43d9ff];

// flower layout inside each cluster (cell offsets from the cluster centre)
const LEFT_PARTS = [
  { r: 25, ox: 0, oy: 5, col: 'violet', seed: 3 }, { r: 16, ox: -38, oy: -28, col: 'violet', seed: 5 },
  { r: 14, ox: 38, oy: -35, col: 'violet', seed: 8 }, { r: 11, ox: -33, oy: 38, col: 'violet', seed: 13 },
  { r: 9, ox: 35, oy: 42, col: 'violet', seed: 21 },
];
const RIGHT_PARTS = [
  { r: 30, ox: 0, oy: 2, col: 'pink', seed: 34 }, { r: 19, ox: -47, oy: -37, col: 'pink', seed: 55 },
  { r: 15, ox: 45, oy: -42, col: 'violet', seed: 89 }, { r: 12, ox: -42, oy: 42, col: 'violet', seed: 144 },
  { r: 10, ox: 42, oy: 40, col: 'pink', seed: 233 },
];

// ------------------------------------------------------------------------------ helpers
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const easeOut = (u) => 1 - (1 - u) * (1 - u) * (1 - u);
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2);
const hash = (n) => {
  n = Math.imul(n ^ (n >>> 15), 1 | n);
  n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
};
/** 0xRRGGBB -> packed ABGR (the byte order of a little-endian Uint32 over RGBA bytes). */
const abgr = (n) => (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
/** Blend two 0xRRGGBB colours and return packed ABGR. */
function lerpAbgr(a, b, k) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const r = ar + (((b >> 16) & 255) - ar) * k, g = ag + (((b >> 8) & 255) - ag) * k, bl = ab + ((b & 255) - ab) * k;
  return (0xff000000 | ((bl | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
}
function mixRgb(a, b, k) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  return (((ar + (((b >> 16) & 255) - ar) * k) | 0) << 16) | (((ag + (((b >> 8) & 255) - ag) * k) | 0) << 8) | ((ab + ((b & 255) - ab) * k) | 0);
}
const hex = (s) => parseInt(s.slice(1), 16);

export class IntroScene extends Phaser.Scene {
  constructor() {
    super('IntroScene');
  }

  init(data) {
    this.replay = !!data?.replay;
  }

  create() {
    this.t = 0;
    this.exitT = 0;
    this.exiting = false;
    this.leaving = false;
    this.canEnter = false;
    this.flags = {};
    this.frame = 0;
    this.simple = !motionAllowed();
    this.ls = { alpha: 0, glitch: 0, bucket: -1 };
    this.cxs = [CA[0][0], CA[1][0]];
    this.cys = [CA[0][1], CA[1][1]];

    this.cameras.main.setBackgroundColor('#07040c');
    this.buildBuffer();
    this.buildBackdrops();
    this.buildLogo();
    this.buildClusters();
    this.buildParticles();
    this.buildAmbient();
    this.buildTunnel();
    this.buildDom();
    this.bindEvents();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    // Audio: queued by the AudioManager until the first click / key press.
    app.audio?.playMusic('intro_hum', { fade: 1.5 });

    if (this.simple) {
      // Reduced motion: no flicker, no flying pixels - the finished picture with the button.
      this.t = T.enter + 4;
      this.centers(this.t);
      this.render(this.t);
      this.stage.classList.add('titled', 'ready');
      this.canEnter = true;
      app.audio?.playMusic('intro_romance', { fade: 1.5 });
      requestAnimationFrame(() => this.enterBtn?.focus({ preventScroll: true }));
    }
    this.layout();
  }

  // ------------------------------------------------------------------------- set-up
  buildBuffer() {
    if (this.textures.exists(TEX_KEY)) this.textures.remove(TEX_KEY);
    this.tex = this.textures.createCanvas(TEX_KEY, W, H);
    this.ctx = this.tex.context;
    this.ctx.imageSmoothingEnabled = false;
    this.img = this.ctx.createImageData(W, H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.screen = this.add.image(0, 0, TEX_KEY).setOrigin(0).setDepth(0);

    const px = this.px;
    // solid write
    this.set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c; };
    // additive write (glow): colour is 0xRRGGBB, k is 0..1
    this.add_ = (x, y, rgb, k) => {
      if (x < 0 || y < 0 || x >= W || y >= H || k <= 0) return;
      const i = y * W + x, d = px[i];
      const r = (d & 255) + ((rgb >> 16) & 255) * k, g = ((d >> 8) & 255) + ((rgb >> 8) & 255) * k, b = ((d >> 16) & 255) + (rgb & 255) * k;
      px[i] = (0xff000000 | ((b > 255 ? 255 : b | 0) << 16) | ((g > 255 ? 255 : g | 0) << 8) | (r > 255 ? 255 : r | 0)) >>> 0;
    };
    this.fillRect = (x, y, w, h2, c) => {
      const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0), x1 = Math.min(W, (x + w) | 0), y1 = Math.min(H, (y + h2) | 0);
      for (let yy = y0; yy < y1; yy++) px.fill(c, yy * W + x0, yy * W + x1);
    };
    this.lineAdd = (x0, y0, x1, y1, rgb, k) => {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      for (let n = 0; n < 900; n++) {
        this.add_(x0, y0, rgb, k);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
      }
    };
    this.glowDisc = (cx, cy, r, rgb, k) => {
      for (let y = -r; y <= r; y++) {
        const w = Math.floor(Math.sqrt(r * r - y * y));
        for (let x = -w; x <= w; x++) this.add_(cx + x, cy + y, rgb, k);
      }
    };
  }

  /** Six dark -> violet gradients (banded, so it reads as pixel art); the haze fades in. */
  buildBackdrops() {
    const make = (k) => {
      const top = mix('#05030A', '#0B0617', k), bot = mix('#07040E', '#2A1347', k);
      const a = new Uint32Array(W * H);
      const bands = 18;
      for (let y = 0; y < H; y++) {
        const band = Math.floor((y / H) * bands) / (bands - 1);
        a.fill(abgr(hex(mix(top, bot, band))), y * W, (y + 1) * W);
      }
      return a;
    };
    this.bgs = [0, 0.2, 0.4, 0.6, 0.8, 1].map(make);
  }

  buildLogo() {
    const c = renderTitle(['BLAQ STUDIOS'], { scale: 4, bands: CHROME_DARK, edge: PAL.electric, glowColor: PAL.electric, glowStrength: 0.22, margin: 10 });
    this.logo = c;
    this.lw = c.width; this.lh = c.height;
    this.lx = Math.round((W - c.width) / 2);
    this.ly = Math.round(124 - c.height / 2);
    const tint = (col) => {
      const { canvas, ctx } = makeCanvas(c.width, c.height);
      ctx.drawImage(c, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, c.width, c.height);
      return canvas;
    };
    this.logoPink = tint(PAL.pink);
    this.logoBlue = tint(PAL.blue);
    // every solid, visible logo pixel becomes a particle when the logo fractures
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    this.samples = [];
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] < 250) continue;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r * 0.3 + g * 0.59 + b * 0.11 < 40) continue; // skip the near-black outline
        this.samples.push({ x: this.lx + x, y: this.ly + y, c: (r << 16) | (g << 8) | b });
      }
    }
  }

  buildClusters() {
    const toCluster = (parts) => buildCluster(parts.map((p) => ({ flower: { radius: p.r, colors: FLOWER_COLORS[p.col], seed: p.seed }, ox: p.ox, oy: p.oy })));
    this.clusters = [toCluster(LEFT_PARTS), toCluster(RIGHT_PARTS)];
    // stepped glow behind each cluster: [dx, dy, level 1..4] relative to the centre
    this.glows = [LEFT_PARTS, RIGHT_PARTS].map((parts, s) => {
      const out = { x: [], y: [], l: [], rgb: s ? 0xff72c6 : 0x9b5cff };
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const c of this.clusters[s].cells) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); }
      for (let y = y0 - 22; y <= y1 + 22; y++) {
        for (let x = x0 - 22; x <= x1 + 22; x++) {
          let g = 0;
          for (const p of parts) g = Math.max(g, 1 - Math.hypot(x - p.ox, y - p.oy) / (p.r * 1.65));
          const lv = Math.floor(g * 4.2);
          if (lv > 0) { out.x.push(x); out.y.push(y); out.l.push(Math.min(4, lv)); }
        }
      }
      return out;
    });
  }

  /** One typed-array slot per particle: where it starts, where it flies, where it settles. */
  buildParticles() {
    const R = rng(0x50e7);
    const left = this.clusters[0], right = this.clusters[1];
    const N = left.cells.length + right.cells.length;
    this.N = N;
    this.dClaimed = new Uint8Array(DN);
    this.buildDust(R);

    // sources: the logo's pixels, topped up with dust and sparks if the flowers need more
    let src = this.samples.map((s) => ({ x: s.x, y: s.y, c: s.c, dust: -1 }));
    if (src.length > N) {
      for (let i = src.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [src[i], src[j]] = [src[j], src[i]]; }
      src.length = N;
    } else {
      const p = [0, 0];
      for (let d = 0; d < CLAIMED && src.length < N; d++) {
        this.dustPos(d, T.fracture, p);
        src.push({ x: p[0], y: p[1], c: this.dcol[d], dust: d });
        this.dClaimed[d] = 1;
      }
      while (src.length < N) src.push({ x: this.lx + R() * this.lw, y: this.ly + 8 + R() * (this.lh - 16), c: R() < 0.5 ? 0xc8a7ff : 0x9b5cff, dust: -1 });
    }
    src.sort((a, b) => a.x - b.x); // left part of the logo feeds the left flowers, right part the right ones

    const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const targets = [
      ...shuffle(left.cells.slice()).map((c) => ({ c, s: 0, max: left.maxOrder })),
      ...shuffle(right.cells.slice()).map((c) => ({ c, s: 1, max: right.maxOrder })),
    ];

    const F = (n) => new Float32Array(n);
    this.x0 = F(N); this.y0 = F(N); this.bx = F(N); this.by = F(N); this.tx = F(N); this.ty = F(N);
    this.th0 = F(N); this.om = F(N); this.rx = F(N); this.ry = F(N); this.ta = F(N); this.rel = F(N);
    this.side = new Uint8Array(N);
    this.c0 = new Int32Array(N); this.cm = new Int32Array(N); this.c1 = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const s = src[i], t = targets[i];
      this.x0[i] = s.x; this.y0[i] = s.y;
      const ang = Math.atan2(s.y - 124, s.x - 240) + (R() - 0.5) * 1.3;
      const sp = s.dust >= 0 ? 6 + R() * 16 : 16 + R() * 64;
      this.bx[i] = s.x + Math.cos(ang) * sp;
      this.by[i] = s.y + Math.sin(ang) * sp * 0.8;
      this.tx[i] = t.c.x; this.ty[i] = t.c.y; this.side[i] = t.s;
      this.th0[i] = R() * Math.PI * 2;
      this.om[i] = (1.0 + R() * 1.5) * (t.s ? -1 : 1);
      const ro = 12 + R() * 40;
      this.rx[i] = ro; this.ry[i] = ro * (0.42 + R() * 0.25);
      this.ta[i] = T.asm + (t.c.order / t.max) * T.asmSpan + (R() - 0.5) * 0.08;
      this.c0[i] = s.c;
      this.cm[i] = (t.s ? MID_R : MID_L)[Math.floor(R() * 4)];
      this.c1[i] = hex(t.c.color);
      this.rel[i] = R() * 0.45 + Math.min(1, Math.hypot(t.c.x, t.c.y) / 70) * 0.18;
    }
    this.samples = null; // free the logo samples
  }

  buildDust(R) {
    const F = (n) => new Float32Array(n);
    this.dx = F(DN); this.dy = F(DN); this.dvx = F(DN); this.dvy = F(DN); this.dph = F(DN);
    this.dcol = new Int32Array(DN);
    const cols = [0x9b5cff, 0xc8a7ff, 0x5a2d96, 0x7a45d8];
    for (let i = 0; i < DN; i++) {
      this.dx[i] = R() * W; this.dy[i] = R() * H;
      this.dvx[i] = (R() - 0.5) * 6; this.dvy[i] = -(3 + R() * 7);
      this.dph[i] = R() * 6.28;
      this.dcol[i] = cols[Math.floor(R() * cols.length)];
    }
  }

  dustPos(i, t, out) {
    let x = (this.dx[i] + this.dvx[i] * t) % W; if (x < 0) x += W;
    let y = (this.dy[i] + this.dvy[i] * t) % H; if (y < 0) y += H;
    out[0] = x; out[1] = y;
  }

  buildAmbient() {
    const R = rng(0xf17e);
    const n = FFN * 2, F = (k) => new Float32Array(k);
    this.ffA = F(n); this.ffB = F(n); this.ffW1 = F(n); this.ffW2 = F(n); this.ffP1 = F(n); this.ffP2 = F(n);
    this.ffC = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      this.ffA[i] = 40 + R() * 40; this.ffB[i] = 30 + R() * 34;
      this.ffW1[i] = (0.5 + R() * 0.9) * (R() < 0.5 ? 1 : -1); this.ffW2[i] = 0.6 + R() * 0.9;
      this.ffP1[i] = R() * 6.28; this.ffP2[i] = R() * 6.28;
      this.ffC[i] = FIREFLY[Math.floor(R() * FIREFLY.length)];
    }
  }

  /** Tunnel streaks and the little neon skyline that the tunnel opens onto. */
  buildTunnel() {
    const R = rng(0x7e11);
    const S = 300;
    this.sdx = new Float32Array(S); this.sdy = new Float32Array(S); this.sP = new Float32Array(S); this.sS = new Float32Array(S);
    for (let i = 0; i < S; i++) {
      const a = R() * Math.PI * 2;
      this.sdx[i] = Math.cos(a); this.sdy[i] = Math.sin(a) * 0.7;
      this.sP[i] = R(); this.sS[i] = 0.7 + R() * 0.9;
    }
    this.city = [];
    let x = -6;
    while (x < W + 6) {
      const w = 22 + R.int(0, 26), hh = 56 + R.int(0, 120);
      const b = { x, w, h: hh, wins: [] };
      for (let wy = 9; wy < hh - 10; wy += 9) for (let wx = 5; wx < w - 6; wx += 7) if (R() < 0.45) b.wins.push([wx, wy, NEON[R.int(0, 3)], R()]);
      this.city.push(b);
      x += w + R.int(0, 4);
    }
  }

  buildDom() {
    const root = app.ui?.root ?? document.getElementById('ui-root');
    this.enterBtn = h('button', { class: 'btn primary', type: 'button', text: 'Enter the world', onClick: () => this.enterWorld() });
    this.skipBtn = h('button', { class: 'btn ghost intro-skip', type: 'button', 'aria-label': 'Skip intro (Escape)', text: 'Skip ›', onClick: () => this.skip() });
    this.soundHint = h('div', { class: 'intro-sound', 'aria-hidden': 'true', text: 'Click or press a key for sound' });
    this.stage = h('div', { class: 'intro-stage' },
      h('div', { class: 'intro-titleblock' },
        h('h1', { class: 'intro-title' }, 'Pixels ', h('span', { class: 'amp', text: '&' }), ' Peonies'),
        h('p', { class: 'intro-sub', text: 'A little world built for two.' })),
      h('div', { class: 'intro-enter' }, this.enterBtn));
    this.dom = h('div', { class: 'intro-ui', role: 'region', 'aria-label': 'Opening sequence' },
      h('div', { class: 'sr-only', role: 'status', text: 'BLAQ STUDIOS presents Pixels and Peonies, a little world built for two. The Enter the world button appears after a few seconds. Press Escape to skip.' }),
      this.stage, this.skipBtn, this.soundHint);
    root.append(this.dom);
    if (app.settings?.get().muted) this.soundHint.classList.add('off');
    this.hintTimer = setInterval(() => { if (app.audio?.unlocked || this.t > 7.5) this.soundHint.classList.add('off'); }, 300);
  }

  bindEvents() {
    this.layout = () => {
      if (!this.stage?.isConnected || !this.game?.canvas) return;
      const c = this.game.canvas.getBoundingClientRect();
      const host = this.dom.getBoundingClientRect();
      if (!c.width || !c.height) return;
      const s = this.stage.style;
      s.left = `${c.left - host.left}px`; s.top = `${c.top - host.top}px`;
      s.width = `${c.width}px`; s.height = `${c.height}px`;
      s.fontSize = `${c.height / H}px`;
    };
    this.onKey = (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); this.skip(); }
      else if (e.key === 'Enter' && this.canEnter && document.activeElement !== this.skipBtn) { e.preventDefault(); this.enterWorld(); }
    };
    window.addEventListener('resize', this.layout);
    window.addEventListener('orientationchange', this.layout);
    window.addEventListener('keydown', this.onKey);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout);
  }

  cleanup() {
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('orientationchange', this.layout);
    window.removeEventListener('keydown', this.onKey);
    this.scale?.off(Phaser.Scale.Events.RESIZE, this.layout);
    clearInterval(this.hintTimer);
    this.dom?.remove();
    this.screen?.destroy();
    if (this.textures.exists(TEX_KEY)) this.textures.remove(TEX_KEY);
    this.logo = this.logoPink = this.logoBlue = this.img = this.px = this.ctx = this.tex = null;
  }

  // ---------------------------------------------------------------- player actions
  enterWorld() {
    if (this.leaving || this.exiting || !this.canEnter) return;
    app.settings?.set({ introSeen: true });
    app.audio?.sfx('ui_ok');
    app.audio?.sfx('whoosh_long');
    this.stage.classList.add('out');
    this.skipBtn.hidden = true;
    if (this.simple) { this.leave(450); return; }
    this.exiting = true;
    this.exitT = 0;
  }

  skip() {
    if (this.leaving) return;
    app.settings?.set({ introSeen: true });
    app.audio?.sfx('ui_back');
    this.stage.classList.add('out');
    this.skipBtn.hidden = true;
    this.leave(260);
  }

  /** Fade to the menu colour, then hand over to the main menu. */
  leave(ms) {
    if (this.leaving) return;
    this.leaving = true;
    let done = false;
    const go = () => { if (done) return; done = true; app.goTo?.('MainMenuScene'); };
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
    this.cameras.main.fadeOut(ms, 16, 9, 29);
    setTimeout(go, ms + 600); // safety net if the tab was hidden during the fade
  }

  // ------------------------------------------------------------------------ the loop
  update(_time, delta) {
    if (this.simple || !this.px) return;
    const dt = Math.min(delta, 50) / 1000;
    this.t += dt;
    if (this.exiting) this.exitT += dt;
    this.frame++;
    if (this.frame % 40 === 1) this.layout();
    this.cues(this.t);
    if (this.exiting && this.exitT >= X.fade) this.leave(Math.round((X.end - X.fade) * 1000));
    if (!this.exiting) this.centers(this.t);
    this.render(this.t);
  }

  cues(t) {
    const f = this.flags, au = app.audio;
    const once = (k, cond, fn) => { if (!f[k] && cond) { f[k] = true; fn(); } };
    once('scan', t >= T.scan0, () => au?.sfx('scan'));
    once('burst', t >= T.fracture, () => { au?.sfx('burst'); au?.sfx('glitch'); });
    once('bloom', t >= T.asm + 0.15, () => au?.sfx('fragment'));
    once('romance', t >= T.drift, () => au?.playMusic('intro_romance', { fade: 2.2 }));
    once('title', t >= T.title, () => this.stage.classList.add('titled'));
    once('enter', t >= T.enter, () => { this.canEnter = true; this.stage.classList.add('ready'); this.enterBtn.focus({ preventScroll: true }); });
    // a glitch crackle each time the logo tears
    if (this.ls.glitch && this.ls.bucket !== this.lastGlitch && t < T.fracture) { this.lastGlitch = this.ls.bucket; au?.sfx('glitch'); }
  }

  /** Cluster centres: static while assembling, then drifting apart, then a gentle bob. */
  centers(t) {
    const u = clamp((t - T.drift) / T.driftLen), e = easeInOut(u);
    const bob = this.simple ? 0 : clamp((t - T.asm - 1.5) / 1.5);
    for (let s = 0; s < 2; s++) {
      this.cxs[s] = Math.round(CA[s][0] + (CF[s][0] - CA[s][0]) * e);
      this.cys[s] = Math.round(CA[s][1] + (CF[s][1] - CA[s][1]) * e + Math.sin(t * 1.25 + s * 3.1) * 1.6 * bob);
    }
  }

  // ---------------------------------------------------------------------- rendering
  render(t) {
    const px = this.px;
    const exiting = this.exiting;
    const te = this.exitT;
    // backdrop: dark -> moody -> full violet haze (dims again inside the tunnel)
    let haze = t < 2.5 ? 0.35 * clamp((t - 0.2) / 2.3) : 0.35 + 0.65 * clamp((t - 3.5) / 2.5);
    if (exiting) haze = Math.max(0.2, 1 - clamp(te / 0.9) * 0.8);
    px.set(this.bgs[Math.round(clamp(haze) * 5)]);

    if (exiting) this.drawExit(t, te);
    this.drawGlow(t, exiting ? 1 - clamp(te / 0.8) : 1);
    this.drawDust(t);
    this.drawScan(t);
    if (t >= T.fracture) (exiting ? this.drawExitParticles(t, te) : this.drawParticles(t));
    this.drawFireflies(t, exiting ? 1 - clamp(te / 0.6) : 1);

    const ctx = this.ctx;
    ctx.putImageData(this.img, 0, 0);
    if (!exiting) {
      this.logoState(t);
      this.drawLogo(ctx);
      const fl = t - T.fracture;
      if (fl >= 0 && fl < 0.2) {
        ctx.save(); ctx.globalAlpha = 0.4 * (1 - fl / 0.2); ctx.fillStyle = '#c8a7ff'; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
    }
    this.tex.refresh();
  }

  drawGlow(t, fade) {
    const k0 = clamp((t - (T.asm + 0.3)) / 2.4) * fade;
    if (k0 <= 0) return;
    const k = k0 * (0.85 + 0.15 * Math.sin(t * 1.8)) * 0.04;
    for (let s = 0; s < 2; s++) {
      const g = this.glows[s], cx = this.cxs[s], cy = this.cys[s];
      for (let i = 0; i < g.x.length; i++) this.add_(cx + g.x[i], cy + g.y[i], g.rgb, g.l[i] * k);
    }
  }

  drawDust(t) {
    const fade = clamp((t - 0.15) / 0.8);
    const scanning = t >= T.scan0 && t <= T.scan1 + 0.3;
    const scanY = scanning ? easeInOut(clamp((t - T.scan0) / (T.scan1 - T.scan0))) * (H + 10) - 5 : -999;
    const p = this._p || (this._p = [0, 0]);
    for (let i = 0; i < DN; i++) {
      if (t >= T.fracture && this.dClaimed[i]) continue;
      this.dustPos(i, t, p);
      const x = p[0] | 0, y = p[1] | 0;
      let k = fade * (0.28 + 0.3 * Math.sin(t * 2.1 + this.dph[i]));
      const d = Math.abs(y - scanY);
      if (d < 14) k += (1 - d / 14) * 0.9;
      k = clamp(k);
      this.add_(x, y, this.dcol[i], k);
      if (i % 5 === 0) { this.add_(x + 1, y, this.dcol[i], k * 0.6); this.add_(x, y + 1, this.dcol[i], k * 0.6); this.add_(x + 1, y + 1, this.dcol[i], k * 0.6); }
    }
  }

  drawScan(t) {
    if (t < T.scan0 || t > T.scan1 + 0.3) return;
    const u = clamp((t - T.scan0) / (T.scan1 - T.scan0));
    const y = Math.round(easeInOut(u) * (H + 10) - 5);
    const out = 1 - clamp((t - T.scan1) / 0.3);
    for (let dy = 0; dy < 16; dy++) {
      const yy = y - dy;
      if (yy < 0 || yy >= H) continue;
      const k = (dy === 0 ? 0.55 : 0.3 * (1 - dy / 16) ** 2) * out;
      for (let x = dy & 1; x < W; x += dy === 0 ? 1 : 2) this.add_(x, yy, 0xc8a7ff, k);
    }
  }

  /** The flowers' pixels: burst -> two spiralling streams -> petal-by-petal assembly -> settled. */
  drawParticles(t) {
    const { N, side, x0, y0, bx, by, tx, ty, th0, om, rx, ry, ta, c0, cm, c1, px, cxs, cys } = this;
    const bu = clamp((t - T.fracture) / (T.stream - T.fracture)), be = easeOut(bu);
    const su = clamp((t - T.stream) / 1.4), se = su * su * (3 - 2 * su);
    const settledAt = T.asm + T.asmSpan + T.flight + 0.1;
    const spark = t > settledAt && !this.simple;
    const bucket = (t * 5) | 0;
    for (let i = 0; i < N; i++) {
      let x, y, col;
      if (t < T.stream) {
        x = x0[i] + (bx[i] - x0[i]) * be; y = y0[i] + (by[i] - y0[i]) * be;
        col = lerpAbgr(c0[i], cm[i], bu);
      } else {
        const s = side[i], th = th0[i] + om[i] * (t - T.stream);
        const ox = cxs[s] + Math.cos(th) * rx[i], oy = cys[s] + Math.sin(th) * ry[i];
        const wx = bx[i] + (ox - bx[i]) * se, wy = by[i] + (oy - by[i]) * se;
        if (t < ta[i]) { x = wx; y = wy; col = abgr(cm[i]); }
        else {
          const u = (t - ta[i]) / T.flight;
          const gx = cxs[s] + tx[i], gy = cys[s] + ty[i];
          if (u >= 1) {
            x = gx; y = gy;
            col = spark && ((Math.imul(i, 2654435761) + bucket * 40503) >>> 0) % 257 < 2 ? lerpAbgr(c1[i], 0xffffff, 0.55) : abgr(c1[i]);
          } else {
            const e = easeOut(u);
            x = wx + (gx - wx) * e; y = wy + (gy - wy) * e;
            col = lerpAbgr(cm[i], c1[i], e);
          }
        }
      }
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && yi >= 0 && xi < W && yi < H) px[yi * W + xi] = col;
    }
  }

  drawFireflies(t, fade) {
    const k0 = clamp((t - T.fireflies) / 1.2) * fade;
    if (k0 <= 0.01) return;
    for (let i = 0; i < FFN * 2; i++) {
      const s = i & 1, col = this.ffC[i];
      const tw = this.simple ? 0.8 : 0.55 + 0.45 * Math.sin(t * 5 + this.ffP1[i] * 3);
      for (let j = 0; j < 3; j++) {
        const tt = this.simple ? 0 : t - j * 0.07;
        const x = Math.round(this.cxs[s] + this.ffA[i] * Math.cos(this.ffW1[i] * tt + this.ffP1[i]));
        const y = Math.round(this.cys[s] + this.ffB[i] * Math.sin(this.ffW2[i] * tt + this.ffP2[i]));
        const b = k0 * tw * (j === 0 ? 1 : j === 1 ? 0.35 : 0.15);
        if (this.simple && j) continue;
        this.add_(x, y, col, 0.95 * b);
        if (j === 0) {
          this.add_(x + 1, y, col, 0.38 * b); this.add_(x - 1, y, col, 0.38 * b); this.add_(x, y + 1, col, 0.38 * b); this.add_(x, y - 1, col, 0.38 * b);
          this.add_(x + 1, y + 1, col, 0.14 * b); this.add_(x - 1, y - 1, col, 0.14 * b); this.add_(x + 1, y - 1, col, 0.14 * b); this.add_(x - 1, y + 1, col, 0.14 * b);
        }
      }
    }
  }

  // ---------------------------------------------------------------- logo (scene 2)
  logoState(t) {
    const ls = this.ls;
    ls.alpha = 0; ls.glitch = 0; ls.bucket = -1;
    if (t < T.logoIn || t >= T.fracture) return;
    const u = t - T.logoIn, b = Math.floor(t * 22);
    if (u < 1.1) {                              // flicker in
      const on = hash(b * 3 + 1) < 0.22 + u * 0.7;
      ls.alpha = on ? 0.5 + 0.5 * hash(b + 9) : 0;
      ls.glitch = on && hash(b * 5 + 2) < 0.45 ? 1 : 0;
    } else if (t < T.fracture - 0.3) {          // stabilise, with a rare twitch
      ls.alpha = 1;
      ls.glitch = hash(Math.floor(t * 12) * 7 + 5) < 0.07 ? 1 : 0;
    } else {                                    // about to break
      ls.alpha = hash(b + 4) < 0.85 ? 1 : 0.5;
      ls.glitch = 1;
    }
    ls.bucket = b;
  }

  drawLogo(ctx) {
    const ls = this.ls;
    if (ls.alpha <= 0) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = ls.alpha;
    if (!ls.glitch) {
      ctx.drawImage(this.logo, this.lx, this.ly);
    } else {
      const seed = ls.bucket;
      let y = 0, k = 0;
      while (y < this.lh) {
        const sh = Math.min(3 + Math.floor(hash(seed * 31 + k) * 10), this.lh - y);
        const dx = hash(seed * 17 + k * 3 + 1) < 0.5 ? Math.round((hash(seed * 13 + k) - 0.5) * 22) : 0;
        ctx.drawImage(this.logo, 0, y, this.lw, sh, this.lx + dx, this.ly + y, this.lw, sh);
        y += sh; k++;
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = ls.alpha * 0.55;
      ctx.drawImage(this.logoPink, this.lx - 2, this.ly);
      ctx.drawImage(this.logoBlue, this.lx + 2, this.ly + 1);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ exit sequence
  /** Flower pixels peel off into curved pixel trails that are sucked toward the vanishing point. */
  drawExitParticles(t, te) {
    const { N, side, tx, ty, c1, rel, px, cxs, cys } = this;
    for (let i = 0; i < N; i++) {
      const s = side[i];
      const p0x = cxs[s] + tx[i], p0y = cys[s] + ty[i];
      const u = clamp((te - rel[i]) / 0.75);
      if (u <= 0) {
        const xi = Math.round(p0x), yi = Math.round(p0y);
        if (xi >= 0 && yi >= 0 && xi < W && yi < H) px[yi * W + xi] = abgr(c1[i]);
        continue;
      }
      if (u >= 1) continue; // absorbed by the vanishing point
      const neon = NEON[i % 5], swirl = (s ? 1 : -1) * 0.35;
      for (let j = 0; j < 4; j++) {
        const uu = u - j * 0.05;
        if (uu <= 0) break;
        const e = uu ** 1.9, inv = 1 - e, sw = Math.sin(uu * Math.PI) * swirl * inv;
        const x = Math.round(p0x + (VPX - p0x) * e - (p0y - VPY) * sw);
        const y = Math.round(p0y + (VPY - p0y) * e + (p0x - VPX) * sw);
        const col = mixRgb(c1[i], neon, clamp(uu * 1.2));
        if (j === 0) { if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = abgr(col); }
        else this.add_(x, y, col, 0.55 - j * 0.16);
      }
    }
  }

  /** Purple digital tunnel -> neon city. Drawn behind the pixel trails. */
  drawExit(t, te) {
    const add = this.add_;
    const tun = clamp((te - X.tunnel) / 0.7);
    const city = clamp((te - X.city) / X.cityLen);
    if (tun > 0) {
      const base = mixRgb(0x9b5cff, 0xff72c6, city * 0.6);
      // wall grid: rays from the vanishing point
      for (let j = 0; j < 16; j++) {
        const a = (j / 16) * Math.PI * 2 + 0.196, dx = Math.cos(a), dy = Math.sin(a) * 0.72;
        for (let r = 8; r < 420; r += 2) add(Math.round(VPX + dx * r), Math.round(VPY + dy * r), base, 0.17 * tun * (1 - city * 0.8) * Math.min(1, r / 60));
      }
      // frames that rush toward the camera
      for (let k = 0; k < 12; k++) {
        const u = (k / 12 + te * 0.7) % 1, e = u ** 2.4;
        const hw = 3 + e * 420, hh = hw * 0.5625;
        const a = tun * (0.15 + 0.85 * Math.min(1, u * 3)) * (1 - city * 0.8) * (u > 0.93 ? (1 - u) / 0.07 : 1);
        if (a <= 0.01) continue;
        const th = u > 0.55 ? 2 : 1;
        const xa = Math.max(0, Math.round(VPX - hw)), xb = Math.min(W - 1, Math.round(VPX + hw));
        const ya = Math.round(VPY - hh), yb = Math.round(VPY + hh);
        for (let q = 0; q < th; q++) {
          if (ya + q >= 0 && ya + q < H) for (let x = xa; x <= xb; x++) { add(x, ya + q, base, a); }
          if (yb - q >= 0 && yb - q < H) for (let x = xa; x <= xb; x++) { add(x, yb - q, base, a); }
        }
        const ylo = Math.max(0, ya), yhi = Math.min(H - 1, yb);
        for (let q = 0; q < th; q++) {
          const xl = Math.round(VPX - hw) + q, xr = Math.round(VPX + hw) - q;
          if (xl >= 0 && xl < W) for (let y = ylo; y <= yhi; y++) add(xl, y, base, a);
          if (xr >= 0 && xr < W) for (let y = ylo; y <= yhi; y++) add(xr, y, base, a);
        }
      }
      // light streaks: violet at first, city neon later
      for (let i = 0; i < this.sP.length; i++) {
        const u = (this.sP[i] + te * this.sS[i] * 0.8) % 1;
        const r1 = 420 * u ** 2.2, r0 = 420 * Math.max(0, u - 0.06) ** 2.2;
        if (r1 < 3) continue;
        const col = city > 0.15 ? NEON[i % 5] : (i & 1 ? 0xc8a7ff : 0x9b5cff);
        this.lineAdd(VPX + this.sdx[i] * r0, VPY + this.sdy[i] * r0, VPX + this.sdx[i] * r1, VPY + this.sdy[i] * r1, col, 0.8 * tun * Math.min(1, u * 4));
      }
    }
    if (city > 0) this.drawCity(t, city);
    // the bright point everything is flying into
    const gr = Math.round(5 + te * 7);
    const g = clamp(te / 0.4) * (1 - city * 0.6);
    this.glowDisc(VPX, VPY, gr, 0xc8a7ff, 0.1 * g);
    this.glowDisc(VPX, VPY, Math.round(gr * 0.6), 0xffffff, 0.12 * g);
  }

  /** A neon skyline approaching from the end of the tunnel (k: 0 far away -> 1 filling the view). */
  drawCity(t, k) {
    const sc = 0.18 + 0.82 * easeOut(k);
    const gy = H - 24;
    const X0 = (x) => VPX + (x - VPX) * sc, Y0 = (y) => VPY + (y - VPY) * sc;
    const dark = abgr(0x0b0618), edge = k > 0.5 ? 0xff72c6 : 0x9b5cff;
    const bucket = Math.floor(t * 6);
    for (const b of this.city) {
      const x0 = X0(b.x), x1 = X0(b.x + b.w), yTop = Y0(gy - b.h), yBot = Y0(gy);
      this.fillRect(x0, yTop, Math.max(1, x1 - x0), Math.max(1, yBot - yTop), dark);
      for (let x = Math.round(x0); x < Math.round(x1); x++) this.add_(x, Math.round(yTop), edge, 0.7 * k);
      for (const w of b.wins) {
        if (hash(Math.floor(w[3] * 9973) + bucket * 31) < 0.04) continue; // a few windows flicker
        const wx = Math.round(X0(b.x + w[0])), wy = Math.round(Y0(gy - b.h + w[1]));
        const ww = Math.max(1, Math.round(2 * sc)), wh = Math.max(1, Math.round(3 * sc));
        for (let yy = 0; yy < wh; yy++) for (let xx = 0; xx < ww; xx++) this.add_(wx + xx, wy + yy, w[2], 0.9 * Math.min(1, k * 1.6));
      }
    }
    const yBot = Math.round(Y0(gy));
    this.fillRect(0, yBot, W, H - yBot, abgr(0x07040e));
    for (let x = 0; x < W; x += 1) this.add_(x, yBot, 0xff72c6, 0.5 * k);
  }
}
