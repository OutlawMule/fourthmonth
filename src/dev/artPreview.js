// Dev tool: renders every generated sprite frame onto contact sheets so the art can be
// inspected without launching the game. Visit /art-preview.html while `npm run dev` runs.
import { buildCharacterAtlas } from '../game/art/characters.js';
import { FRAME } from '../game/art/rig.js';
import { PAL } from '../game/art/palette.js';

const out = document.getElementById('out');
const params = new URLSearchParams(location.search);
const scale = Number(params.get('scale') || 3);

function sheet(atlas, bg) {
  const cols = 12;
  const rows = Math.ceil(atlas.names.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * FRAME; c.height = rows * FRAME;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  atlas.names.forEach((n, i) => {
    const x = (i % cols) * FRAME, y = Math.floor(i / cols) * FRAME;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.0)';
    ctx.fillRect(x, y, FRAME, FRAME);
    ctx.drawImage(atlas.getFrame(n), x, y);
  });
  c.style.width = c.width * scale + 'px';
  c.style.height = c.height * scale + 'px';
  c.title = atlas.names.join(', ');
  return c;
}

// ?frames=idle_0,run_2  -> render just those frames per character (handy for zoomed checks)
const only = params.get('frames')?.split(',').filter(Boolean);

for (const key of ['mule', 'princess']) {
  const atlas = buildCharacterAtlas(key);
  if (only) {
    const names = only.filter((n) => atlas.getFrame(n));
    const c = document.createElement('canvas');
    c.width = names.length * FRAME; c.height = FRAME;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2a1550'; ctx.fillRect(0, 0, c.width, c.height);
    names.forEach((n, i) => ctx.drawImage(atlas.getFrame(n), i * FRAME, 0));
    c.style.width = c.width * scale + 'px'; c.style.height = c.height * scale + 'px';
    out.append(c);
    continue;
  }
  const h = document.createElement('h2');
  h.textContent = `${key} - ${atlas.names.length} frames: ${atlas.names.join(' ')}`;
  out.append(h, sheet(atlas, '#2a1550'));
}
window.__artReady = true;
void PAL;
