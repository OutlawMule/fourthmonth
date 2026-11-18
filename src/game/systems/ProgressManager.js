// Owns the player's saved game. Wraps the pure model in src/utils/progress.js with
// persistence (localStorage, validated + versioned) and change events.
// Cloud sync (Supabase) listens to 'progress:changed' - see services/progressSync.js.
import {
  createDefaultProgress, selectCharacter, completeStage, collectFragment, markSeen, markAnswered, unmarkAnswered,
  openMemoryObject, grantAchievement, setRun, bumpStat, setBestCombo, recordEnding, resumeStageId, mergeProgress,
  hasFragment, sanitizeProgress, extendedEndingStatus,
} from '../../utils/progress.js';
import { loadProgress, saveProgress, clearProgress, hasSavedProgress } from '../../utils/storage.js';
import { ACHIEVEMENTS } from '../../data/memories.js';

export class ProgressManager {
  constructor(bus) {
    this.bus = bus;
    const { progress, existed, repaired } = loadProgress();
    this.state = progress;
    this.loadedFromDisk = existed;
    this.repaired = repaired;
    this.saveFailed = false;
    if (repaired) this.persist(); // write the repaired copy back
  }

  get hasSave() { return hasSavedProgress(); }
  get resumeStage() { return resumeStageId(this.state); }
  get character() { return this.state.selectedCharacter; }

  persist() {
    this.saveFailed = !saveProgress(this.state);
    this.bus.emit('progress:changed', this.state);
    if (this.saveFailed) this.bus.emit('toast', { kind: 'warn', text: 'Could not save on this device (storage blocked or full).' });
  }

  apply(next) {
    if (next === this.state) return false;
    this.state = next;
    this.persist();
    return true;
  }

  // ---- game flow ---------------------------------------------------------
  /** Starts a fresh game. Deliberately leaves relationship answers untouched. */
  newGame(character = this.state.selectedCharacter) {
    clearProgress();
    const fresh = createDefaultProgress();
    fresh.selectedCharacter = character;
    fresh.startedAt = new Date().toISOString();
    this.state = fresh;
    this.persist();
    this.bus.emit('progress:reset', this.state);
  }

  /** Clears saved game progress (no save afterwards) but keeps the character choice. */
  reset() {
    const keep = this.state.selectedCharacter;
    clearProgress();
    this.state = createDefaultProgress();
    this.state.selectedCharacter = keep;
    this.persist();
    this.bus.emit('progress:reset', this.state);
  }

  chooseCharacter(key) { this.apply(selectCharacter(this.state, key)); }

  /** Called when the cloud copy is loaded after sign-in. */
  mergeCloud(cloud) {
    const merged = mergeProgress(this.state, cloud);
    this.state = merged;
    this.persist();
    return merged;
  }

  replaceAll(raw) { this.state = sanitizeProgress(raw).progress; this.persist(); }

  // ---- collectibles ----------------------------------------------------------
  collect(stageId, key) {
    const { progress, added } = collectFragment(this.state, stageId, key);
    if (added) {
      this.apply(progress);
      this.bus.emit('fragment:collected', { stageId, key });
      this.checkCollector();
    }
    return added;
  }
  has(stageId, key) { return hasFragment(this.state, stageId, key); }

  checkCollector() {
    // grants "Every fragment" once every optional fragment in the game is owned
    if (extendedEndingStatus(this.state).missingFragments.length === 0) this.grant('collector');
  }

  // ---- stages ------------------------------------------------------------------
  finishStage(stageId) {
    if (this.apply(completeStage(this.state, stageId))) this.bus.emit('stage:completed', { stageId });
  }

  saveRun(run) { this.apply(setRun(this.state, run)); }
  clearRun() { if (this.state.run) this.apply(setRun(this.state, null)); }
  setVariation(key) { this.apply({ ...this.state, prefs: { ...this.state.prefs, stage3Variation: key } }); }

  // ---- seen scenes / answers / objects / achievements --------------------------
  hasSeen(key) { return this.state.seenScenes.includes(key); }
  see(key) { this.apply(markSeen(this.state, key)); }
  setAnswered(questionKey, answered = true) {
    this.apply(answered ? markAnswered(this.state, questionKey) : unmarkAnswered(this.state, questionKey));
  }
  openObject(key) {
    const { progress, added } = openMemoryObject(this.state, key);
    if (added) this.apply(progress);
    return added;
  }
  grant(key) {
    if (this.state.achievements.includes(key)) return;
    this.apply(grantAchievement(this.state, key));
    const a = ACHIEVEMENTS.find((x) => x.key === key);
    if (a) this.bus.emit('toast', { kind: 'achievement', text: `Achievement: ${a.title}` });
  }
  addDefeat() { this.state = bumpStat(this.state, 'defeats'); }          // saved at the next checkpoint
  addDeath() { this.apply(bumpStat(this.state, 'deaths')); }
  reportCombo(n) { if (n > this.state.stats.bestCombo) this.apply(setBestCombo(this.state, n)); }
  finishGame(kind) { this.apply(recordEnding(this.state, kind)); }
}
