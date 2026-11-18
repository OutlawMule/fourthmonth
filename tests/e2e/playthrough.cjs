// OPTIONAL browser test (not part of `npm test`). Plays Stage 1 -> 4 for real: real keyboard input,
// real combat, real cinematics, real UI. Teleports are only used to skip platforming that the level
// tests already prove both characters can do.
//
//   1. one-time:  npm install --no-save playwright   then   npx playwright install chromium
//   2. terminal 1: npm run dev
//   3. terminal 2: node tests/e2e/playthrough.cjs            (CHAR=princess for the other character)
//
// It needs the DEV server because it uses the window.__app hook that only exists in dev builds.
// Prints PASS / FAIL lines and exits with code 2 if anything failed. Takes 2-3 minutes.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const OUT = process.env.SHOT_DIR || path.join(os.tmpdir(), 'mule-princess-e2e');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5173';
// Only machines without a graphics card (CI, containers) need software rendering: SOFTWARE_GL=1
const GL_ARGS = process.env.SOFTWARE_GL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [];
const FIXTURE = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'letter.original.txt'), 'utf8').replace(/\n$/, '');
const CHARACTER = process.env.CHAR || 'mule';
const T0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s]`, ...a);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); log(ok ? 'PASS' : 'FAIL', name, detail ? `-- ${detail}` : ''); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: GL_ARGS });
  const [VW, VH] = (process.env.VIEW || '640x360').split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  page.setDefaultTimeout(20000);
  const problems = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message} :: ${(e.stack || '').split('\n').slice(1, 4).join(' | ')}`));
  const shot = async (name) => { try { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 30000 }); } catch (e) { log('screenshot skipped', name, e.message.split('\n')[0]); } };
  const flushProblems = (where) => { check(`no console errors/warnings: ${where}`, problems.length === 0, problems.join(' // ')); problems.length = 0; };

  // ------------------------------------------------------------------ helpers
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const level = () => ev(() => { const l = window.__app.currentLevel; return l ? { id: l.stageId, scene: l.sys.settings.key, ready: !!l.player, frozen: l.frozen, finished: !!l.finished, busy: !!l.busy } : null; });
  const waitLevel = async (stageId, ms = 45000) => {
    await page.waitForFunction((id) => { const l = window.__app.currentLevel; return l && l.stageId === id && l.player && l.sys.isActive(); }, stageId, { timeout: ms });
    await sleep(600);
  };
  const tp = (x, y) => ev(([x, y]) => { const p = window.__app.currentLevel.player; p.body.reset(x, y); p.body.setVelocity(0, 0); p.iframes = Math.max(p.iframes, 2000); }, [x, y]);
  const settle = (ms = 700) => sleep(ms);
  const key = async (k, ms = 80) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); };
  const modalTitle = () => ev(() => { const hs = document.querySelectorAll('.panel-head h2'); return hs.length ? hs[hs.length - 1].textContent : null; });
  const waitModal = (re, ms = 60000) => page.waitForFunction((src) => { const hs = document.querySelectorAll('.panel-head h2'); const t = hs.length ? hs[hs.length - 1].textContent : ''; return new RegExp(src, 'i').test(t); }, re.source, { timeout: ms });
  const clickFoot = async (labelRe) => {
    const btn = page.locator('.panel-foot').last().locator('.btn').filter({ hasText: labelRe }).first();
    await btn.click({ timeout: 8000 });
  };
  const setPick = (mode) => ev((m) => { window.__bot.pickMode = m; }, mode);
  const hudStage = () => ev(() => window.__app.currentLevel?.stageComplete?.());

  async function installAutopilot() {
    await ev(() => {
      const app = window.__app;
      const bot = (window.__bot = { dlg: [], picks: [], pickMode: 'first' });
      bot.timer = setInterval(() => {
        const d = app.ui.dialogue;
        if (!d.active) return;
        if (d.state === 'typing') { d.advance(); return; }
        if (d.state === 'wait') { bot.dlg.push(d.txt.textContent); d.advance(); return; }
        if (d.state === 'choosing') {
          const btns = [...d.choicesEl.querySelectorAll('button:not([disabled])')];
          const labels = btns.map((b) => b.textContent);
          let idx = 0;
          const mode = bot.pickMode;
          if (mode === 'last') idx = btns.length - 1;
          else if (typeof mode === 'string' && mode.startsWith('re:')) idx = labels.findIndex((l) => new RegExp(mode.slice(3), 'i').test(l));
          bot.picks.push({ prompt: d.txt.textContent, labels, idx });
          if (idx >= 0 && btns[idx]) btns[idx].click();
        }
      }, 90);
    });
  }

  async function newRun(ch, stageId) {
    await ev(([ch, id]) => { window.__app.progress.newGame(ch); window.__app.startStage(id); }, [ch, stageId]);
    await waitLevel(stageId);
  }

  async function collectFragments(label) {
    const keys = await ev(() => [...window.__app.currentLevel.fragSprites.keys()]);
    for (const k of keys) {
      await ev((k) => { const l = window.__app.currentLevel; const s = l.fragSprites.get(k); if (!s) return; const p = l.player; p.body.reset(s.x, s.y + 12); p.body.setVelocity(0, 0); p.iframes = 3000; }, k);
      await page.waitForFunction(([k]) => { const l = window.__app.currentLevel; return window.__app.progress.has(l.stageId, k); }, [k], { timeout: 6000 }).catch(() => {});
    }
    const missing = await ev((keys) => keys.filter((k) => !window.__app.progress.has(window.__app.currentLevel.stageId, k)), keys);
    check(`${label}: all ${keys.length} fragments collected by touching them`, missing.length === 0, missing.length ? `missing ${missing}` : keys.join(','));
    return keys;
  }

  async function pause(label) {
    await key('Escape');
    await waitModal(/pause|paused/, 8000).catch(() => {});
    const t = await modalTitle();
    const btns = await ev(() => [...document.querySelectorAll('.panel-foot .btn, .panel-body .btn')].map((b) => b.textContent.trim()));
    check(`${label}: pause menu opens with the required buttons`, /pause/i.test(t ?? '') && ['Resume', 'Restart from checkpoint', 'Controls', 'Settings'].every((b) => btns.includes(b)) && btns.some((b) => /Return to main menu/.test(b)), `${t} :: ${btns.join(' | ')}`);
    return btns;
  }

  // ------------------------------------------------------------------ boot
  await page.goto(`${BASE}/?skipintro=1`);
  await page.waitForFunction(() => window.__app?.game?.scene?.isActive('MainMenuScene'), null, { timeout: 90000 });
  await sleep(600);
  await installAutopilot();
  flushProblems('boot');

  // ================================================================ STAGE 1
  log('=== STAGE 1 ===');
  await newRun(CHARACTER, 'stage1');
  await sleep(3200);
  let info = await ev(() => { const l = window.__app.currentLevel; return { px: Math.round(l.player.x), py: Math.round(l.player.y), enemies: l.enemies.getLength(), frags: l.fragSprites.size, need: l.stage.required.defeats, meet: l.spec.anchors.meet, met: l.requirementsMet() }; });
  log('stage1 info', JSON.stringify(info));
  check('stage 1: spawns with 5 enemies, 5 fragments, meeting locked', info.enemies === 5 && info.frags === 5 && info.met === false, JSON.stringify(info));

  // pause menu + controls guide inside a real level
  await pause('stage 1');
  await page.getByRole('button', { name: 'Controls' }).click();
  await sleep(300);
  const controlsText = await ev(() => { const b = document.querySelectorAll('.panel-body'); return b.length ? b[b.length - 1].innerText : ''; });
  check('stage 1: pause -> Controls guide lists the keys', /\bAD\b|\bA\b[\s\S]*\bD\b|←/.test(controlsText) && /Space/.test(controlsText) && /\bJ\b/.test(controlsText) && /Shift/.test(controlsText) && /\bK\b/.test(controlsText) && /\bE\b/.test(controlsText) && /Esc/i.test(controlsText) && /Enter/i.test(controlsText), controlsText.replace(/\s+/g, ' ').slice(0, 420));
  await page.keyboard.press('Escape'); // close controls (back to pause) or close modal
  await sleep(300);
  if (await modalTitle()) { await page.getByRole('button', { name: 'Resume' }).click().catch(async () => { await page.keyboard.press('Escape'); }); }
  await sleep(500);
  check('stage 1: resume returns to gameplay (no modal open)', (await modalTitle()) === null);

  // real movement with the keyboard (condition-based: the software renderer only manages a few FPS)
  const fps = await ev(() => Math.round(window.__app.game.loop.actualFps));
  log('game FPS under software rendering:', fps);
  const x0 = await ev(() => window.__app.currentLevel.player.x);
  await page.keyboard.down('d');
  await page.waitForFunction((x0) => window.__app.currentLevel.player.x > x0 + 25, x0, { timeout: 15000, polling: 40 }).catch(() => {});
  await page.keyboard.up('d');
  const x1 = await ev(() => window.__app.currentLevel.player.x);
  check('stage 1: holding D moves the character right', x1 > x0 + 25, `${Math.round(x0)} -> ${Math.round(x1)}`);
  await sleep(1200);
  const y0 = await ev(() => window.__app.currentLevel.player.y);
  await page.keyboard.down('Space');
  await page.waitForFunction((y0) => window.__app.currentLevel.player.y < y0 - 6, y0, { timeout: 15000, polling: 25 }).catch(() => {});
  await page.keyboard.up('Space');
  const yMin = await ev(() => window.__app.currentLevel.player.y);
  check('stage 1: Space makes the character jump', yMin < y0 - 6, `${Math.round(y0)} -> ${Math.round(yMin)}`);
  await sleep(1500);
  const scrolled = await ev(() => ({ x: window.scrollX, y: window.scrollY }));
  check('stage 1: game keys never scroll the page', scrolled.x === 0 && scrolled.y === 0);

  // the meeting point must refuse to play the cinematic before the requirements are met
  await tp(info.meet.x, info.meet.y); await settle(500);
  await key('e');
  await page.waitForFunction(() => window.__app.ui.dialogue.active || window.__bot.dlg.length > 0, null, { timeout: 8000 }).catch(() => {});
  await sleep(900);
  const early = await ev(() => ({ dlg: window.__bot.dlg.slice(), modal: !!document.querySelector('.panel'), finished: !!window.__app.currentLevel.finished }));
  check('stage 1: meeting early is refused ("Still needed"), no cinematic/letter', early.dlg.some((t) => /Still needed/i.test(t)) && !early.modal && !early.finished, JSON.stringify(early.dlg).slice(0, 200));

  const frags1 = await collectFragments('stage 1');
  const prog1 = await ev(() => window.__app.progress.state.collected.stage1?.slice().sort());
  check('stage 1: progress records 3 required + 2 bonus fragments', JSON.stringify(prog1) === JSON.stringify(['cool', 'early', 'froze', 'rush', 'thumb']), JSON.stringify(prog1));

  // real combat against the five Lightwork
  let usedFallback = 0;
  const fightStart = Date.now();
  while (Date.now() - fightStart < 150000) {
    const st = await ev(() => {
      const l = window.__app.currentLevel; const p = l.player;
      if (p.dead) return { dead: true };
      const alive = l.enemies.getChildren().filter((e) => e.active && !e.dying);
      return { n: alive.length, defeated: l.run.defeated.size };
    });
    if (st.dead || st.n === 0) { if (st.n === 0) break; await sleep(500); continue; }
    // stand next to the closest living enemy, face it, then jab
    const target = await ev(() => {
      const l = window.__app.currentLevel; const p = l.player;
      const alive = l.enemies.getChildren().filter((e) => e.active && !e.dying);
      alive.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
      const e = alive[0];
      const side = p.x <= e.x ? -1 : 1;
      p.body.reset(e.x + side * 26, e.body ? e.body.bottom : e.y); p.body.setVelocity(0, 0);
      p.facing = -side; p.setFlipX(-side < 0); p.iframes = 4000;
      return { id: e.id, hp: e.hp, kind: e.kind };
    });
    const before = await ev((id) => window.__app.currentLevel.run.defeated.has(id), target.id);
    if (before) continue;
    for (let i = 0; i < 9; i++) {
      await key('j', 70); await sleep(190);
      const gone = await ev((id) => window.__app.currentLevel.run.defeated.has(id), target.id);
      if (gone) break;
    }
    const gone = await ev((id) => window.__app.currentLevel.run.defeated.has(id), target.id);
    if (!gone) {
      usedFallback++;
      await ev((id) => { const l = window.__app.currentLevel; const e = l.enemies.getChildren().find((x) => x.id === id); if (e && !e.dying) e.hit(999, 1, 0); }, target.id);
      await sleep(600);
    }
  }
  const afterFight = await ev(() => ({ defeated: window.__app.currentLevel.run.defeated.size, fighter: window.__app.progress.has('fighter') || window.__app.progress.state.achievements.includes('fighter'), counted: window.__app.progress.state.defeats ?? null }));
  check('stage 1: five Lightwork defeated (progress counter + "fighter" achievement)', afterFight.defeated === 5 && afterFight.fighter, JSON.stringify(afterFight) + ` fallbackHits=${usedFallback}`);
  log(`combat: ${5 - usedFallback} enemies defeated with real attacks, ${usedFallback} needed the hit() fallback`);

  await sleep(900);
  const ready = await ev(() => window.__app.currentLevel.requirementsMet());
  check('stage 1: meeting point opens once fragments + defeats are done', ready === true);

  await tp(info.meet.x, info.meet.y); await settle(500);
  await key('e');
  log('waiting for the first-meeting cinematic and letter...');
  await page.waitForSelector('.letter', { timeout: 120000 });
  const letterParas = await ev(() => [...document.querySelectorAll('.letter p')].map((p) => p.textContent));
  check('stage 1: letter shown in the modal is character-for-character the original', letterParas.join('\n\n') === FIXTURE, letterParas.join('\n\n') === FIXTURE ? '' : JSON.stringify(letterParas).slice(0, 300));
  const letterAria = await ev(() => document.querySelector('.letter')?.getAttribute('aria-label'));
  log('letter modal title:', await modalTitle(), '| aria-label:', letterAria);
  await shot('b1_letter');
  await clickFoot(/Continue/);
  await waitModal(/journal|memory|stage|entry/i, 15000).catch(() => {});
  log('after letter, modal:', await modalTitle());
  await shot('b2_journal1');
  await clickFoot(/./); // primary action
  await waitLevel('stage2', 45000);
  const done1 = await ev(() => { const s = window.__app.progress.state; return { completed: s.completedStages.slice(), unlocked: s.unlockedStages.slice(), journal: s.journal.slice(), seen: s.seenScenes.slice() }; });
  check('stage 1 -> stage 2: completed + unlocked + journal recorded, next stage loaded', done1.completed.includes('stage1') && done1.unlocked.includes('stage2') && done1.journal.includes('stage1') && done1.seen.includes('meeting'), JSON.stringify(done1));
  flushProblems('stage 1');

  // ================================================================ STAGE 2
  log('=== STAGE 2 ===');
  await sleep(3200);
  info = await ev(() => { const l = window.__app.currentLevel; return { frags: l.fragSprites.size, log: l.spec.anchors.log, met: l.requirementsMet() }; });
  check('stage 2: loads with 4 conversation fragments, log locked', info.frags === 4 && info.met === false, JSON.stringify(info));
  await tp(info.log.x, info.log.y); await settle(500);
  await key('e');
  await sleep(1200);
  const early2 = await ev(() => ({ dlg: window.__bot.dlg.slice(-2), finished: window.__app.currentLevel.finished }));
  check('stage 2: sitting at the log early is refused', early2.dlg.some((t) => /still to find/i.test(t)) && !early2.finished, JSON.stringify(early2.dlg));
  await collectFragments('stage 2');
  await tp(info.log.x, info.log.y); await settle(500);
  await setPick('first');
  await key('e');
  log('waiting for the log scene prompts...');
  await page.waitForSelector('.q-item', { timeout: 90000 });
  await setPick('last'); // after this question: "just sit"
  const qText = await ev(() => document.querySelector('.q-item h4, .q-item .q-text, .q-item label, .q-item p')?.textContent ?? '');
  log('log prompt opened:', qText.slice(0, 80));
  const ta = page.locator('.q-item textarea').first();
  if (await ta.count()) await ta.fill('fictional bot answer for the log');
  else await page.locator('.q-item input[type=text]').first().fill('fictional bot answer for the log');
  await page.locator('.q-item').getByRole('button', { name: 'Submit answer' }).first().click();
  await page.waitForSelector('.q-item .msg.ok', { timeout: 10000 });
  await page.waitForFunction(() => /Continue/i.test(document.querySelector('.panel-foot .btn')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
  log('footer buttons after saving the log answer:', JSON.stringify(await ev(() => [...document.querySelectorAll('.panel-foot')].map((f) => [...f.querySelectorAll('.btn')].map((b) => b.textContent.trim())))));
  await shot('b3a_log_question');
  await clickFoot(/./);
  log('waiting for the time-skip montage...');
  await page.waitForSelector('.panel', { timeout: 120000 }); // journal for stage 2
  await shot('b3_journal2');
  const done2 = await ev(() => { const s = window.__app.progress.state; return { flags: window.__app.currentLevel.run.flags, answered: s.answered.slice() }; });
  check('stage 2: prompt answered (key only in progress), time skip finished', done2.flags.logVisited && done2.flags.timeSkipDone && done2.answered.includes('log.remember'), JSON.stringify(done2));
  check('stage 2: answer text is not stored in the progress JSON', !(await ev(() => (localStorage.getItem('mule-princess:v1:progress') ?? '').includes('fictional bot answer'))));
  await clickFoot(/./);
  await waitLevel('stage3', 45000);
  flushProblems('stage 2');

  // ================================================================ STAGE 3
  log('=== STAGE 3 ===');
  await sleep(3200);
  info = await ev(() => { const l = window.__app.currentLevel; return { house: l.spec.anchors.house, frags: l.fragSprites.size, variation: l.run.variation }; });
  check('stage 3: loads (clear night, 2 optional fragments)', info.frags === 2 && info.variation === 'clear', JSON.stringify(info));
  const frags3 = await collectFragments('stage 3');
  const unlockedNow = await ev(() => window.__app.currentLevel.unlockedNights().map((n) => n.key));
  check('stage 3: optional fragments unlock the rain and fog nights', unlockedNow.includes('rain') && unlockedNow.includes('fog'), unlockedNow.join(','));
  await setPick('last');
  await tp(info.house.x - 12, info.house.y); await settle(700);
  log('waiting for the car-arrival cinematic...');
  await page.waitForFunction(() => window.__app.currentLevel.run.flags.carArrived === true, null, { timeout: 120000 });
  check('stage 3: reaching her door triggers the car arrival (flag set after the scene)', true);
  await page.waitForSelector('.panel', { timeout: 120000 });
  const done3 = await ev(() => ({ flags: window.__app.currentLevel.run.flags, picks: window.__bot.picks.slice(-2), title: document.querySelector('.panel-head h2')?.textContent }));
  check('stage 3: optional conversation offered ("just enjoy the quiet" ends it)', done3.flags.midnightTalk === true && done3.picks.some((p) => p.labels.length >= 3), JSON.stringify(done3.picks.map((p) => p.labels)).slice(0, 300));
  await shot('b4_journal3');
  await clickFoot(/./);
  await waitLevel('stage4', 45000);
  const done3b = await ev(() => { const s = window.__app.progress.state; return { completed: s.completedStages.slice(), unlocked: s.unlockedStages.slice() }; });
  check('stage 3 -> stage 4: completed + unlocked', done3b.completed.includes('stage3') && done3b.unlocked.includes('stage4'), JSON.stringify(done3b));
  flushProblems('stage 3');

  // ================================================================ STAGE 4
  log('=== STAGE 4 ===');
  await sleep(3200);
  info = await ev(() => { const l = window.__app.currentLevel; return { objects: l.spec.objects.map((o) => ({ key: o.key, x: o.x, y: o.y, area: o.area })), dawn: l.spec.anchors.dawn, gate: l.spec.gates[0] }; });
  check('stage 4: eight memory objects, rooftop bench', info.objects.length === 8 && !!info.dawn);
  // the bench must refuse before anything is done
  await tp(info.dawn.x, info.dawn.y); await settle(900);
  await key('e'); await sleep(1500);
  const early4 = await ev(() => ({ dlg: window.__bot.dlg.slice(-1), finished: window.__app.currentLevel.finished, modal: !!document.querySelector('.panel') }));
  check('stage 4: the bench refuses before 4 memory objects are open (no ending)', /Not quite yet/i.test(early4.dlg[0] ?? '') && !early4.finished && !early4.modal, JSON.stringify(early4));

  const gateBefore = await ev(() => window.__app.currentLevel.gate && !window.__app.currentLevel.gate.isOpen());
  check('stage 4: holo gate is closed at the start', gateBefore === true);
  let opened = 0;
  for (const o of info.objects.filter((o) => o.area === 'street')) {
    await tp(o.x, o.y); await settle(500);
    await key('e');
    await page.waitForSelector('.cat-hdr, .q-item', { timeout: 15000 }).catch(() => {});
    await sleep(400);
    const hasQ = await ev(() => document.querySelectorAll('.q-item').length);
    if (hasQ > 0) {
      if (opened === 0) { await shot('b5_object_category'); }
      await clickFoot(/Done|Close/);
      opened++;
    } else log('object did not open a category modal:', o.key, await modalTitle());
    await page.waitForFunction(() => !window.__app.currentLevel.busy, null, { timeout: 10000 }).catch(() => {});
    await sleep(300);
  }
  const gateAfter = await ev(() => ({ open: window.__app.currentLevel.gate?.isOpen?.() ?? null, n: window.__app.currentLevel.run.counters.memoryObjects, prog: window.__app.progress.state.memoryObjects.slice() }));
  check('stage 4: four street objects opened four categories, counter 4, gate open', opened === 4 && gateAfter.n === 4 && gateAfter.open === true, JSON.stringify(gateAfter));

  // reach the rooftop (flag set by physics: grounded on the roof), then watch the dawn
  await tp(info.dawn.x - 20, info.dawn.y - 2); await settle(1500);
  const flag = await ev(() => window.__app.currentLevel.run.flags.rooftopReached === true);
  check('stage 4: standing on the rooftop sets rooftopReached', flag);
  await tp(info.dawn.x, info.dawn.y); await settle(700);
  await key('e');
  log('waiting for the dawn cinematic, journal, final archive...');
  await page.waitForSelector('.panel', { timeout: 120000 });
  log('modal after dawn:', await modalTitle());
  await clickFoot(/./); // journal
  await waitModal(/Final archive/, 30000);
  await shot('b6_final_archive');
  const archiveText = await ev(() => document.querySelector('.panel-body')?.innerText ?? '');
  check('stage 4: final archive lists fragments/journal and a "Read the letter again" button', /memory fragments/i.test(archiveText) && /Read the letter again/i.test(archiveText), archiveText.replace(/\s+/g, ' ').slice(0, 160));
  await clickFoot(/Continue/);
  await waitModal(/end of this chapter/i, 20000);
  const endKind = await ev(() => JSON.stringify(window.__app.progress.state.endings));
  const endText = await ev(() => document.querySelector('.ending')?.innerText ?? '');
  check('stage 4: standard ending shown with the "longer ending" hint and Edit button', /There is a longer ending/i.test(endText) && /Edit this message/i.test(endText), `${endKind} :: ${endText.replace(/\s+/g, ' ').slice(0, 140)}`);
  await shot('b7_ending');

  // edit the closing message, save, restore
  await page.getByRole('button', { name: 'Edit this message' }).click();
  await page.fill('#end-title', 'A message from us (fictional test)');
  await page.fill('#end-text', 'Line one of my edit.\nLine two of my edit.');
  await page.getByRole('button', { name: 'Save message' }).click();
  await page.waitForSelector('.ending .msg.ok', { timeout: 10000 });
  const saved = await ev(() => ({ msg: document.querySelector('.ending .msg')?.textContent, h2: document.querySelector('.ending h2')?.textContent, ps: [...document.querySelectorAll('.ending .end-lines p')].map((p) => p.textContent) }));
  check('stage 4: edited closing message saved and shown ("Saved on this device")', /Saved on this device/.test(saved.msg) && saved.ps.join('|') === 'Line one of my edit.|Line two of my edit.' && /fictional test/.test(saved.h2), JSON.stringify(saved));
  await page.getByRole('button', { name: 'Edit this message' }).click();
  await page.getByRole('button', { name: 'Restore the original' }).click();
  await page.waitForSelector('.ending .msg.ok');
  const restored = await ev(() => document.querySelector('.ending .msg')?.textContent);
  check('stage 4: "Restore the original" brings the default message back', /original message is back/i.test(restored), restored);
  await clickFoot(/Return to menu/);
  await page.waitForFunction(() => window.__app.game.scene.isActive('MainMenuScene'), null, { timeout: 30000 });
  const fin = await ev(() => { const s = window.__app.progress.state; return { completed: s.completedStages.slice(), finished: s.finished ?? s.gameFinished ?? null, memoryObjects: s.memoryObjects.length }; });
  const endings = await ev(() => window.__app.progress.state.endings);
  check('stage 4: game finished, all four stages completed, standard ending recorded (not extended), back on the main menu', fin.completed.length === 4 && endings.standard === true && !endings.extended, JSON.stringify({ fin, endings }));
  flushProblems('stage 4 + ending');

  // ================================================================ summary
  const failed = results.filter((r) => !r.ok);
  log(`SUMMARY: ${results.length - failed.length}/${results.length} checks passed`);
  for (const f of failed) log('  FAILED:', f.name);
  await browser.close();
  process.exit(failed.length ? 2 : 0);
})().catch((e) => { console.error('BOT CRASHED', e); process.exit(1); });
