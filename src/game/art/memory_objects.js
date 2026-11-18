// The eight rooftop "memory objects" (Stage 04). Each is a small holo-projector with a
// floating icon that stands for one questionnaire category (src/data/questions.js ->
// CATEGORIES[].object). Per object:  mo_<key>_0..3  (animated idle)  and  mo_<key>_done
// (dimmed once opened).  Animation key: mo_<key>.
import { PAL, rgba, mix } from './palette.js';
import { px, disc, ring, line, glow, fillPoly } from './pixel.js';
import { texFrames, tex, makeAnim } from './common.js';

const W = 28;
const H = 42;

const ICONS = {
  // heart: small acts of affection
  affection(c, y) {
    disc(c, 10, y - 1, 4, PAL.pink); disc(c, 18, y - 1, 4, PAL.pink);
    fillPoly(c, [[6, y], [22, y], [14, y + 11]], PAL.pink);
    px(c, 8, y - 4, 3, 2, '#ffd0e8');
    px(c, 12, y + 2, 4, 2, '#ff9ad6');
  },
  // game controller: favorite activities
  activities(c, y) {
    px(c, 4, y - 2, 20, 10, '#3c3c58'); px(c, 2, y, 4, 9, '#3c3c58'); px(c, 22, y, 4, 9, '#3c3c58');
    px(c, 4, y - 2, 20, 1, PAL.chrome);
    px(c, 7, y + 2, 6, 2, PAL.blue); px(c, 9, y, 2, 6, PAL.blue);
    disc(c, 19, y + 1, 2, PAL.pink); disc(c, 22, y + 4, 2, PAL.warm);
    px(c, 13, y + 6, 2, 1, PAL.lavender);
  },
  // compass: things to experience
  experiences(c, y) {
    ring(c, 14, y + 4, 9, PAL.warm, 2);
    disc(c, 14, y + 4, 7, '#1d1038');
    fillPoly(c, [[14, y - 2], [17, y + 4], [11, y + 4]], PAL.pink);
    fillPoly(c, [[14, y + 10], [17, y + 4], [11, y + 4]], PAL.white);
    disc(c, 14, y + 4, 1, PAL.warm);
    px(c, 13, y - 5, 2, 1, PAL.warm);
  },
  // speech bubble with dots: communication styles
  communication(c, y) {
    px(c, 3, y - 2, 22, 13, PAL.lavender); px(c, 2, y - 1, 24, 11, PAL.lavender);
    fillPoly(c, [[7, y + 10], [13, y + 10], [6, y + 15]], PAL.lavender);
    px(c, 3, y - 2, 22, 1, '#ffffff');
    for (const x of [8, 13, 18]) disc(c, x + 1, y + 4, 1, '#3a1a63');
  },
  // hoodie: what each needs when upset (comfort)
  comfort(c, y) {
    fillPoly(c, [[8, y + 2], [20, y + 2], [22, y + 14], [6, y + 14]], PAL.electric);
    px(c, 3, y + 3, 5, 11, PAL.electric); px(c, 20, y + 3, 5, 11, PAL.electric);
    disc(c, 14, y + 1, 5, '#7d3ce0'); disc(c, 14, y + 2, 3, '#1d1038');
    px(c, 10, y + 9, 8, 4, '#7d3ce0');
    px(c, 12, y + 4, 1, 4, PAL.lavender); px(c, 15, y + 4, 1, 4, PAL.lavender);
  },
  // picture frame: important memories
  memories(c, y) {
    px(c, 3, y - 2, 22, 18, PAL.warm); px(c, 5, y, 18, 14, '#1d1038');
    px(c, 5, y + 8, 18, 6, '#3a1a63');
    fillPoly(c, [[5, y + 14], [11, y + 8], [17, y + 14]], '#5a2d96');
    disc(c, 18, y + 4, 2, PAL.pink);
    px(c, 3, y - 2, 22, 1, '#fff6d8');
  },
  // eye: things still being learned
  learning(c, y) {
    fillPoly(c, [[2, y + 5], [14, y - 2], [26, y + 5], [14, y + 12]], PAL.white);
    disc(c, 14, y + 5, 5, PAL.electric); disc(c, 14, y + 5, 3, '#1d1038'); px(c, 15, y + 3, 2, 2, '#ffffff');
    line(c, 2, y + 5, 26, y + 5, 'rgba(0,0,0,0)', 1);
    for (const [x0, y0, x1, y1] of [[5, y, 3, y - 3], [14, y - 3, 14, y - 6], [23, y, 25, y - 3]]) line(c, x0, y0, x1, y1, PAL.lavender, 1);
  },
  // sunrise: hopes for the next chapter
  hopes(c, y) {
    px(c, 2, y + 10, 24, 2, PAL.pink);
    disc(c, 14, y + 10, 8, PAL.warm);
    px(c, 0, y + 11, 28, 6, 'rgba(16,9,29,0)');
    px(c, 4, y + 11, 20, 1, '#ffb0d8');
    for (const [x0, y0, x1, y1] of [[14, y - 2, 14, y - 5], [5, y + 1, 3, y - 2], [23, y + 1, 25, y - 2], [2, y + 7, -1, y + 6], [26, y + 7, 29, y + 6]]) line(c, x0, y0, x1, y1, PAL.warm, 1);
  },
};

const COLORS = { affection: PAL.pink, activities: PAL.blue, experiences: PAL.warm, communication: PAL.lavender, comfort: PAL.electric, memories: PAL.warm, learning: PAL.blue, hopes: PAL.pink };

function pedestal(c, color, i) {
  px(c, 6, 36, 16, 5, '#16161f'); px(c, 8, 34, 12, 3, '#2a2a3c'); px(c, 8, 34, 12, 1, color);
  px(c, 10, 33, 8, 1, mix(color, '#ffffff', 0.4));
  c.fillStyle = rgba(color, 0.12 + (i % 2) * 0.05);
  c.beginPath(); c.moveTo(10, 33); c.lineTo(18, 33); c.lineTo(23, 17); c.lineTo(5, 17); c.closePath(); c.fill();
}

export const MEMORY_OBJECT_KEYS = Object.keys(ICONS);

export function buildMemoryObjects(scene) {
  const T = scene.textures;
  for (const [key, icon] of Object.entries(ICONS)) {
    const color = COLORS[key];
    const frames = texFrames(T, `mo_${key}`, 4, W, H, (c, i) => {
      const bob = [0, -1, -1, 0][i];
      glow(c, 14, 14 + bob, 13, color, 0.35 + (i % 2) * 0.15, 4);
      pedestal(c, color, i);
      icon(c, 9 + bob);
    });
    makeAnim(scene, `mo_${key}`, frames, 4);
    // opened state: dimmed, with a small star above
    tex(T, `mo_${key}_done`, W, H, (c) => {
      c.globalAlpha = 0.5;
      pedestal(c, '#6c6c85', 0);
      icon(c, 10);
      c.globalAlpha = 1;
      c.fillStyle = 'rgba(16,9,29,0.55)'; c.fillRect(0, 0, W, 30);
      px(c, 13, 1, 2, 5, PAL.warm); px(c, 11, 3, 6, 1, PAL.warm); px(c, 12, 2, 4, 3, '#fff6d8');
    });
  }
}
