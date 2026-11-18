// Ground / platform tile sets per location. Every theme provides:
//   g_<t>_top   16x16 surface tile (repeated along a platform's top)
//   g_<t>_fill  16x16 filler tile (repeated below the surface)
//   ledge_<t>   16x8  thin one-way platform
import { PAL, mix } from './palette.js';
import { px, rng } from './pixel.js';
import { tex } from './common.js';

const THEMES = {
  drag: { surf: '#3d2c66', surf2: '#2a1d4a', base: '#1a1228', base2: '#150e22', neon: PAL.electric, spec: PAL.pink, mark: '#c9b6ff' },
  park: { surf: '#1f5a5c', surf2: '#17414a', base: '#140e24', base2: '#100a1d', neon: '#5CFFB0', spec: PAL.lavender, mark: '#8ff7cf' },
  res: { surf: '#3b2f5c', surf2: '#2a2145', base: '#1a1230', base2: '#140d26', neon: PAL.lavender, spec: PAL.pink, mark: '#8b7bb5' },
  roof: { surf: '#4a4166', surf2: '#342c4f', base: '#1c162f', base2: '#150f25', neon: PAL.pink, spec: PAL.blue, mark: '#9a8fc0' },
};

export function buildThemes(scene) {
  const T = scene.textures;
  for (const [name, t] of Object.entries(THEMES)) {
    tex(T, `g_${name}_top`, 16, 16, (c) => {
      const r = rng(name.length * 31);
      px(c, 0, 0, 16, 16, t.base);
      px(c, 0, 0, 16, 5, t.surf);
      px(c, 0, 0, 16, 1, mix(t.surf, '#ffffff', 0.35));
      px(c, 0, 5, 16, 1, t.surf2);
      px(c, 0, 6, 16, 1, t.neon);                     // neon kerb line
      c.globalAlpha = 0.5; px(c, 0, 7, 16, 1, t.neon); c.globalAlpha = 1;
      if (name === 'park') for (let i = 0; i < 6; i++) px(c, r.int(0, 15), r.int(-1, 0) + 0, 1, r.int(2, 4), t.mark);
      if (name === 'drag') { px(c, 2, 2, 5, 1, t.mark); px(c, 10, 2, 4, 1, t.mark); } // lane dashes
      for (let i = 0; i < 5; i++) px(c, r.int(0, 15), r.int(2, 4), 1, 1, i % 2 ? t.spec : '#ffffff'); // wet reflections
      for (let y = 8; y < 16; y++) for (let i = 0; i < 2; i++) if (r() < 0.25) px(c, r.int(0, 15), y, 1, 1, t.base2);
    });
    tex(T, `g_${name}_fill`, 16, 16, (c) => {
      const r = rng(name.length * 17 + 3);
      px(c, 0, 0, 16, 16, t.base);
      px(c, 0, 0, 16, 1, t.base2); px(c, 0, 8, 16, 1, t.base2);
      px(c, 0, 0, 1, 16, t.base2); px(c, 8, 8, 1, 8, t.base2);
      for (let i = 0; i < 5; i++) px(c, r.int(1, 14), r.int(1, 14), 1, 1, mix(t.base, t.neon, 0.25));
    });
    tex(T, `ledge_${name}`, 16, 8, (c) => {
      px(c, 0, 0, 16, 8, 'rgba(0,0,0,0)');
      px(c, 0, 0, 16, 2, PAL.chrome);
      px(c, 0, 0, 16, 1, '#ffffff');
      px(c, 0, 2, 16, 3, '#4b4866');
      px(c, 0, 5, 16, 1, t.neon);
      c.globalAlpha = 0.45; px(c, 0, 6, 16, 1, t.neon); c.globalAlpha = 1;
      px(c, 1, 2, 1, 2, '#2a2a3c'); px(c, 9, 2, 1, 2, '#2a2a3c');
    });
  }
  // pit "kill glow": the neon abyss under gaps
  tex(T, 'abyss', 16, 16, (c) => {
    for (let y = 0; y < 16; y++) { c.fillStyle = `rgba(155,92,255,${0.05 + (y / 16) * 0.35})`; c.fillRect(0, y, 16, 1); }
  });
}
