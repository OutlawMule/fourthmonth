// UI facade. One object that scenes and services talk to; it owns every HTML layer.
//   ui.modal      accessible dialogs          ui.dialogue   typewriter dialogue + choices
//   ui.bubble     in-world speech bubbles     ui.hud        in-game HUD
//   ui.readLetter / showJournal / openArchive            (archive.js)
//   ui.showMainMenu / openSettings / showPause ...       (menus.js)
//   ui.openQuestionnaire / openCategory / openQuestion   (questionnaire.js)
//   ui.openAccount                                       (account.js)
//   ui.showEnding                                        (ending.js)
import { app } from '../app.js';
import { ModalManager } from './modal.js';
import { Dialogue, Bubbles } from './dialogue.js';
import { Hud } from './hud.js';
import { Toasts, CineControls, TouchControls } from './overlays.js';
import { createArchive } from './archive.js';
import { createMenus } from './menus.js';
import { createQuestionnaire } from './questionnaire.js';
import { createAccountUI } from './account.js';
import { createEnding } from './ending.js';

export class UI {
  constructor(root) {
    this.root = root;
    app.ui = this; // modules below read app.ui.modal while they are being created
    this.modal = new ModalManager(root, app);
    this.dialogue = new Dialogue(root, app);
    this.bubble = new Bubbles(root, app);
    this.hud = new Hud(root, app);
    this.toasts = new Toasts(root, app);
    this.cine = new CineControls(root, app);
    this.touch = new TouchControls(root, app);
    Object.assign(this, createArchive(app));
    Object.assign(this, createMenus(app));
    Object.assign(this, createQuestionnaire(app));
    Object.assign(this, createAccountUI(app));
    Object.assign(this, createEnding(app));
  }
}
