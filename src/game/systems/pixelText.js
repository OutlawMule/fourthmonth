// Crisp bitmap-font text as a Phaser texture: used for the stage title cards, the clock
// in the time-skip montage and floating labels. Only the characters the bitmap font
// supports (A-Z, 0-9 and a little punctuation) are drawn; anything else shows as "?".
import { makeCanvas, drawText, textWidth } from '../art/pixel.js';

export function pixelTextKey(scene, text, { color = '#ffffff', scale = 1, shadow = '#09090F', glow = null } = {}) {
  const key = `pt_${scale}_${color}_${shadow ?? ''}_${glow ?? ''}_${text}`;
  if (!scene.textures.exists(key)) {
    const pad = 3 * scale;
    const w = textWidth(text, scale) + pad * 2 + scale;
    const h = 7 * scale + pad * 2 + scale;
    const { canvas, ctx } = makeCanvas(w, h);
    if (glow) {
      ctx.globalAlpha = 0.35;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawText(ctx, text, pad + dx * scale, pad + dy * scale, glow, scale);
      ctx.globalAlpha = 1;
    }
    if (shadow) drawText(ctx, text, pad + scale, pad + scale, shadow, scale);
    drawText(ctx, text, pad, pad, color, scale);
    scene.textures.addCanvas(key, canvas);
  }
  return key;
}

export function pixelText(scene, x, y, text, opts) {
  return scene.add.image(x, y, pixelTextKey(scene, text, opts));
}
