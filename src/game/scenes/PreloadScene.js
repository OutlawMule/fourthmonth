// Builds every procedural texture, atlas and animation before the first scene runs,
// reporting progress to the boot splash. Nothing here needs a network request, so a
// missing asset can never stop the game from starting.
import Phaser from 'phaser';
import { app } from '../../app.js';
import { buildCommon } from '../art/common.js';
import { buildEnemies } from '../art/enemies.js';
import { buildThemes } from '../art/themes.js';
import { buildBackgrounds } from '../art/backgrounds.js';
import { buildDragWorld } from '../art/world_drag.js';
import { buildParkWorld } from '../art/world_park.js';
import { buildNeighborhood } from '../art/world_res.js';
import { buildMemoryObjects } from '../art/memory_objects.js';
import { buildCharacterAtlas, characterAnimDefs } from '../art/characters.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  async create() {
    const fill = document.getElementById('boot-bar-fill');
    const note = document.getElementById('boot-note');
    const registerCharacter = (key) => {
      const atlas = buildCharacterAtlas(key);
      atlas.register(this.textures);
      for (const d of characterAnimDefs(key)) {
        if (this.anims.exists(d.key)) this.anims.remove(d.key);
        this.anims.create({ key: d.key, frames: d.frames, frameRate: d.frameRate, repeat: d.repeat });
      }
    };
    const steps = [
      ['Shared effects', () => buildCommon(this)],
      ['Lightwork', () => buildEnemies(this)],
      ['Big Boss Mule', () => registerCharacter('mule')],
      ['Princess', () => registerCharacter('princess')],
      ['Tile sets', () => buildThemes(this)],
      ['City skylines', () => buildBackgrounds(this)],
      ['Drag-racing district', () => buildDragWorld(this)],
      ['City park', () => buildParkWorld(this)],
      ['Neighborhood and rooftop', () => buildNeighborhood(this)],
      ['Memory objects', () => buildMemoryObjects(this)],
    ];
    try {
      for (let i = 0; i < steps.length; i++) {
        if (note) note.textContent = `${steps[i][0]}…`;
        await tick();
        steps[i][1]();
        if (fill) fill.style.width = `${Math.round(((i + 1) / steps.length) * 100)}%`;
      }
    } catch (err) {
      console.error('Art generation failed:', err?.message ?? err);
      if (note) note.textContent = 'Something went wrong while loading. Please reload the page.';
      return;
    }
    await tick();
    const splash = document.getElementById('boot-splash');
    splash?.classList.add('gone');
    setTimeout(() => splash?.remove(), 700);
    app.bus.emit('boot:ready');

    const params = new URLSearchParams(location.search);
    const forceIntro = params.get('intro') === '1';
    const skipIntro = params.get('skipintro') === '1';
    const seen = app.settings.get().introSeen;
    this.scene.start(forceIntro || (!seen && !skipIntro) ? 'IntroScene' : 'MainMenuScene');
  }
}
