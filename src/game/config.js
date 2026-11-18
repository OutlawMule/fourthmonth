// Phaser game configuration. Arcade Physics only; our own InputManager handles the
// keyboard/touch (so page scrolling, form typing and browser shortcuts stay under
// control) and our own AudioManager handles sound (Phaser's audio is switched off).
import Phaser from 'phaser';
import { VIEW_W, VIEW_H, GRAVITY } from './constants.js';
import { PreloadScene } from './scenes/PreloadScene.js';
import { IntroScene } from './scenes/IntroScene.js';
import { MainMenuScene } from './scenes/MainMenuScene.js';
import { CharacterSelectScene } from './scenes/CharacterSelectScene.js';
import { DragRaceScene } from './scenes/DragRaceScene.js';
import { LogScene } from './scenes/LogScene.js';
import { MidnightScene } from './scenes/MidnightScene.js';
import { LearningScene } from './scenes/LearningScene.js';

export function createGame(parent) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#10091D',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    banner: false,
    disableContextMenu: true,
    audio: { noAudio: true },
    input: { keyboard: false, gamepad: false, mouse: true, touch: true },
    fps: { target: 60, smoothStep: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: VIEW_W, height: VIEW_H },
    physics: { default: 'arcade', arcade: { gravity: { y: GRAVITY }, debug: false } },
    scene: [PreloadScene, IntroScene, MainMenuScene, CharacterSelectScene, DragRaceScene, LogScene, MidnightScene, LearningScene],
  });
}
