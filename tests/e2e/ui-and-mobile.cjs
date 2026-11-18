// OPTIONAL browser test (not part of `npm test`). Covers: menu and settings, New Game keeping saved
// answers, Princess's moves, death and respawn, the extended ending, and a phone-sized screen with real
// touch input and rotation.
//
//   1. one-time:  npm install --no-save playwright   then   npx playwright install chromium
//   2. terminal 1: npm run dev
//   3. terminal 2: node tests/e2e/ui-and-mobile.cjs          (ONLY=A desktop part, ONLY=B phone part)
//
// Needs the DEV server (it uses the window.__app hook). Prints PASS / FAIL and exits 2 on any failure.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const OUT = process.env.SHOT_DIR || path.join(os.tmpdir(), 'mule-princess-e2e');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:5173';
// Only machines without a graphics card (CI, containers) need software rendering: SOFTWARE_GL=1
const GL_ARGS = process.env.SOFTWARE_GL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [];

const T0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - T0) / 1000)).padStart(4)}s]`, ...a);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); log(ok ? 'PASS' : 'FAIL', name, detail ? `-- ${detail}` : ''); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ARGS = GL_ARGS;

function attach(page, problems) {
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
}
const mkHelpers = (page, problems) => {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shot = async (name) => { try { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 30000 }); } catch (e) { log('screenshot skipped', name); } };
  const flush = (where) => { check(`no console errors/warnings: ${where}`, problems.length === 0, problems.join(' // ')); problems.length = 0; };
  const modalTitle = () => ev(() => { const hs = document.querySelectorAll('.panel-head h2'); return hs.length ? hs[hs.length - 1].textContent : null; });
  const waitModal = (re, ms = 30000) => page.waitForFunction((src) => { const hs = document.querySelectorAll('.panel-head h2'); const t = hs.length ? hs[hs.length - 1].textContent : ''; return new RegExp(src, 'i').test(t); }, re.source, { timeout: ms });
  const clickFoot = (re) => page.locator('.panel-foot').last().locator('.btn').filter({ hasText: re }).first().click({ timeout: 8000 });
  const key = async (k, ms = 80) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); };
  const boot = async (url = `${BASE}/?skipintro=1`) => {
    await page.goto(url);
    await page.waitForFunction(() => window.__app?.game?.scene?.isActive('MainMenuScene') || window.__app?.game?.scene?.isActive('IntroScene'), null, { timeout: 90000 });
    await sleep(500);
  };
  const waitLevel = async (id, ms = 45000) => { await page.waitForFunction((id) => { const l = window.__app.currentLevel; return l && l.stageId === id && l.player && l.sys.isActive(); }, id, { timeout: ms }); await sleep(600); };
  const tp = (x, y) => ev(([x, y]) => { const p = window.__app.currentLevel.player; p.body.reset(x, y); p.body.setVelocity(0, 0); p.iframes = Math.max(p.iframes, 2500); }, [x, y]);
  const installAutopilot = () => ev(() => {
    const app = window.__app;
    const bot = (window.__bot = { dlg: [], pickMode: 'last' });
    bot.timer = setInterval(() => {
      const d = app.ui.dialogue;
      if (!d.active) return;
      if (d.state === 'typing') { d.advance(); return; }
      if (d.state === 'wait') { bot.dlg.push(d.txt.textContent); d.advance(); return; }
      if (d.state === 'choosing') { const btns = [...d.choicesEl.querySelectorAll('button:not([disabled])')]; (bot.pickMode === 'last' ? btns[btns.length - 1] : btns[0])?.click(); }
    }, 90);
  });
  return { ev, shot, flush, modalTitle, waitModal, clickFoot, key, boot, waitLevel, tp, installAutopilot };
};

(async () => {
  const browser = await chromium.launch({ args: ARGS });

  // =================================================================== PART A: desktop (640x360)
  if (!process.env.ONLY || process.env.ONLY === 'A') {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.setDefaultTimeout(20000);
    const problems = []; attach(page, problems);
    const H = mkHelpers(page, problems); const { ev, shot, flush, modalTitle, waitModal, clickFoot, key, boot, waitLevel, tp } = H;
    await boot();
    await H.installAutopilot();

    // ---- main menu, fresh profile
    log('=== A1: main menu on a fresh profile ===');
    const menu0 = await ev(() => [...document.querySelectorAll('.menu-col .btn')].map((b) => ({ t: b.textContent.replace(/^\d/, '').trim(), d: b.disabled })));
    check('menu: seven items, Continue disabled with no save', menu0.length === 7 && menu0[1].d === true && menu0.map((m) => m.t).join('|') === 'New Game|Continue|Character Selection|Memory Archive|Learn About Each Other|Settings|Credits', JSON.stringify(menu0));
    const footers = await ev(() => document.body.innerText.match(/BLAQ STUDIOS?/gi)?.length ?? 0);
    log('visible "BLAQ STUDIO(S)" occurrences on the menu:', footers);

    // ---- credits / archive / account (guest, unconfigured) / settings
    await page.locator('.menu-col .btn', { hasText: 'Credits' }).click();
    await waitModal(/BLAQ|credits/i, 8000).catch(() => {});
    check('menu: Credits opens', /BLAQ/i.test((await modalTitle()) ?? ''), await modalTitle());
    await clickFoot(/Close/);
    await page.locator('.menu-col .btn', { hasText: 'Memory Archive' }).click();
    await waitModal(/archive/i, 8000).catch(() => {});
    check('menu: Memory Archive opens', /archive/i.test((await modalTitle()) ?? ''), await modalTitle());
    await clickFoot(/Close/);
    await page.locator('.menu-status .btn', { hasText: 'Account' }).click();
    await page.waitForSelector('.panel', { timeout: 8000 });
    const acct = await ev(() => document.querySelector('.panel-body')?.innerText ?? '');
    check('account (guest, online not configured): honest guest-mode screen, no fake sign-in form', /Guest mode/i.test(acct) && /not set up/i.test(acct), acct.replace(/\s+/g, ' ').slice(0, 160));
    const hasForm = await ev(() => !!document.querySelector('.panel input[type=password]'));
    check('account: no password field is shown when Supabase is not configured', hasForm === false);
    await clickFoot(/Close/);

    // ---- save an answer on this device, then create progress
    await ev(async () => {
      window.__app.progress.newGame('princess');
      await window.__app.answers.save('log.remember', { text: 'fictional device answer that must survive New Game' }, { privacy: 'device', status: 'submitted' });
    });
    const keptBefore = await ev(() => Object.keys(JSON.parse(localStorage.getItem('mule-princess:v1:local-answers') ?? '{}')).length);
    await ev(() => { window.__app.ui.hideMainMenu(); window.__app.ui.showMainMenu(); });
    await sleep(400);
    const menu1 = await ev(() => [...document.querySelectorAll('.menu-col .btn')].map((b) => ({ t: b.textContent.replace(/^\d/, '').trim(), d: b.disabled })));
    check('menu: Continue becomes enabled once a game exists', menu1[1].d === false && /Continue/.test(menu1[1].t), JSON.stringify(menu1[1]));

    log('=== A2: New Game confirmation keeps answers ===');
    await page.locator('.menu-col .btn', { hasText: 'New Game' }).click();
    await waitModal(/new game/i, 8000);
    const body = await ev(() => document.querySelector('.panel-body')?.innerText ?? '');
    check('New Game: asks for confirmation and says answers are NOT deleted', /NOT deleted/i.test(body), body.replace(/\s+/g, ' ').slice(0, 200));
    await page.locator('.panel-foot .btn', { hasText: /cancel|keep|back/i }).first().click().catch(async () => { await page.keyboard.press('Escape'); });
    await sleep(300);
    const stillSaved = await ev(() => window.__app.progress.hasSave);
    check('New Game: cancelling keeps the save', stillSaved === true);
    await page.locator('.menu-col .btn', { hasText: 'New Game' }).click();
    await waitModal(/new game/i, 8000);
    await clickFoot(/Reset progress and start/);
    await page.waitForFunction(() => window.__app.game.scene.isActive('CharacterSelectScene'), null, { timeout: 20000 });
    const ans = await ev(() => window.__app.answers.peekMine('log.remember')?.text ?? null);
    const keptAfter = await ev(() => Object.keys(JSON.parse(localStorage.getItem('mule-princess:v1:local-answers') ?? '{}')).length);
    check('New Game: relationship answer on this device survives', ans && /survive New Game/.test(ans) && keptAfter >= keptBefore, `before=${keptBefore} after=${keptAfter}`);
    flush('menu flows');

    // ---- Settings
    log('=== A3: settings ===');
    await ev(() => { window.__app.game.scene.start('MainMenuScene'); });
    await page.waitForFunction(() => document.querySelector('.menu-col'), null, { timeout: 20000 });
    await page.locator('.menu-col .btn', { hasText: 'Settings' }).click();
    await waitModal(/settings/i, 8000);
    const before = await ev(() => JSON.stringify(window.__app.settings.get()));
    await page.locator('input[aria-label="Text size"]').fill('1.4');
    await page.locator('input[aria-label="Reduced motion"]').check();
    await page.locator('input[aria-label="Reduced screen shake"]').check();
    await page.locator('input[aria-label="High contrast interface"]').check();
    const after = await ev(() => window.__app.settings.get());
    check('settings: text size, reduced motion, reduced shake and high contrast are applied', after.textScale === 1.4 && after.reducedMotion && after.reducedShake && after.highContrast, JSON.stringify(after));
    const rootCss = await ev(() => ({ size: getComputedStyle(document.documentElement).fontSize, attrs: [...document.documentElement.attributes].map((a) => `${a.name}=${a.value}`).join(' ') }));
    log('root css after settings:', JSON.stringify(rootCss));
    check('settings: persisted in localStorage (no secrets)', await ev(() => { const raw = localStorage.getItem('mule-princess:v1:settings') ?? ''; return raw.includes('"textScale"') && !/key|token|secret|password/i.test(raw); }));
    await ev(() => window.__app.settings.set({ textScale: 1, reducedMotion: false, reducedShake: false, highContrast: false }));
    await page.locator('.setting button', { hasText: 'Reset game progress' }).click();
    await waitModal(/reset game progress/i, 8000);
    check('settings: Reset game progress says answers are NOT deleted', /NOT deleted/i.test(await ev(() => (() => { const b = document.querySelectorAll('.panel-body'); return b.length ? b[b.length - 1].innerText : ''; })())));
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(300);
    flush('settings');

    // ---- Princess in a level: double jump, dash, pulse, death + respawn
    log('=== A4: Princess controls, death and respawn ===');
    await ev(() => { window.__app.progress.newGame('princess'); window.__app.startStage('stage1'); });
    await waitLevel('stage1');
    await sleep(3000);
    const ch = await ev(() => window.__app.currentLevel.player.character ?? window.__app.currentLevel.player.key ?? window.__app.progress.state.character);
    log('player character:', ch);
    const ground = await ev(() => window.__app.currentLevel.player.y);
    const apexOf = async (doubleJump) => {
      let min = ground;
      await page.keyboard.down('Space');
      if (!doubleJump) {
        for (let i = 0; i < 26; i++) { await sleep(25); min = Math.min(min, await ev(() => window.__app.currentLevel.player.y)); }
        await page.keyboard.up('Space');
      } else {
        for (let i = 0; i < 8; i++) { await sleep(25); min = Math.min(min, await ev(() => window.__app.currentLevel.player.y)); }
        await page.keyboard.up('Space');
        await sleep(60);
        await page.keyboard.down('Space');
        for (let i = 0; i < 40; i++) { await sleep(25); min = Math.min(min, await ev(() => window.__app.currentLevel.player.y)); }
        await page.keyboard.up('Space');
      }
      await page.waitForFunction((g) => Math.abs(window.__app.currentLevel.player.y - g) < 2 && window.__app.currentLevel.player.body.blocked.down, ground, { timeout: 8000, polling: 40 }).catch(() => {});
      await sleep(400);
      return ground - min;
    };
    const single = await apexOf(false);
    const dbl = await apexOf(true);
    check('Princess: a second jump in mid-air rises clearly higher than a single jump', dbl > single + 15, `single apex=${Math.round(single)}px double apex=${Math.round(dbl)}px`);
    await sleep(800);

    const vx0 = await ev(() => { const p = window.__app.currentLevel.player; p.facing = 1; return Math.abs(p.body.velocity.x); });
    await page.keyboard.down('k');
    let vxMax = 0;
    for (let i = 0; i < 12; i++) { await sleep(25); vxMax = Math.max(vxMax, await ev(() => Math.abs(window.__app.currentLevel.player.body.velocity.x))); }
    await page.keyboard.up('k');
    check('Princess: K makes her dash (speed spike far above her walking speed of 150)', vxMax > 250, `vx ${Math.round(vx0)} -> max ${Math.round(vxMax)}`);
    await sleep(900);

    // attack fires a pulse
    const pulses0 = await ev(() => window.__app.currentLevel.pulses?.getLength?.() ?? -1);
    await page.keyboard.down('j');
    let pulseSeen = false;
    for (let i = 0; i < 20 && !pulseSeen; i++) { await sleep(30); pulseSeen = await ev(() => (window.__app.currentLevel.pulses?.getChildren?.().filter((p) => p.active).length ?? 0) > 0); }
    await page.keyboard.up('j');
    check('Princess: J fires a light-energy pulse', pulseSeen, `pulse group size before=${pulses0}`);

    // die: lethal damage -> respawn at the checkpoint with full HP, progress counts the death
    const deaths0 = await ev(() => window.__app.progress.state.stats.deaths);
    await ev(() => { const p = window.__app.currentLevel.player; p.iframes = 0; p.hurt(99, p.x - 10); });
    await page.waitForFunction(() => window.__app.currentLevel.player.dead === true, null, { timeout: 5000 }).catch(() => {});
    const died = await ev(() => window.__app.currentLevel.player.dead);
    await page.waitForFunction(() => window.__app.currentLevel.player.dead === false, null, { timeout: 8000 }).catch(() => {});
    const resp = await ev(() => { const l = window.__app.currentLevel; const p = l.player; return { dead: p.dead, hp: p.hp, max: p.maxHp, x: Math.round(p.x), frozen: l.frozen, deaths: window.__app.progress.state.stats.deaths }; });
    check('death: dying shows a fade, then respawns at full HP, game not frozen', died === true && resp.dead === false && resp.hp === resp.max && resp.frozen === false, JSON.stringify({ died, resp, deaths0 }));

    // restart from checkpoint via the pause menu
    await key('Escape');
    await waitModal(/paused/i, 8000);
    await page.getByRole('button', { name: 'Restart from checkpoint' }).click();
    await waitLevel('stage1');
    check('pause: "Restart from checkpoint" reloads the stage and play continues', await ev(() => window.__app.currentLevel.player && !window.__app.currentLevel.frozen));
    flush('Princess controls + death');

    // ================================================================ extended ending
    log('=== A5: extended ending (Princess) ===');
    await ev(async () => {
      const app = window.__app;
      const q = await import('/src/data/questions.js');
      const st = await import('/src/data/stages.js');
      app.progress.newGame('princess');
      for (const f of st.allOptionalFragments()) app.progress.collect(f.stageId, f.key);
      const failed = [];
      for (const k of q.extendedEndingQuestionKeys()) {
        const qq = q.getQuestion(k);
        const input = qq.type === 'choice' ? { text: '', choice: qq.options[0] } : { text: `fictional answer for ${k}`, choice: null };
        const r = await app.answers.save(k, input, { privacy: 'device', status: 'submitted' });
        if (!r?.ok) failed.push(`${k}: ${r?.error}`);
      }
      window.__saveFailures = failed;
      window.__s4 = { keys: q.extendedEndingQuestionKeys().length, status: (await import('/src/utils/progress.js')).extendedEndingStatus(app.progress.state) };
      app.startStage('stage4');
    });
    log('extended pre-state:', JSON.stringify(await ev(() => ({ failures: window.__saveFailures, keys: window.__s4.keys, ready: window.__s4.status.ready, missingFragments: window.__s4.status.missingFragments.length, missingAnswers: window.__s4.status.missingAnswers.length }))));
    await waitLevel('stage4');
    await sleep(2500);
    const info = await ev(() => { const l = window.__app.currentLevel; return { objects: l.spec.objects.map((o) => ({ key: o.key, x: o.x, y: o.y, area: o.area })), dawn: l.spec.anchors.dawn, ch: window.__app.progress.state.character }; });
    log('stage 4 as', info.ch);
    for (const o of info.objects.filter((o) => o.area === 'street')) {
      await tp(o.x, o.y); await sleep(500);
      await key('e');
      await page.waitForSelector('.q-item', { timeout: 15000 }).catch(() => {});
      await sleep(300);
      if (await ev(() => document.querySelectorAll('.q-item').length)) await clickFoot(/Done|Close/);
      await page.waitForFunction(() => !window.__app.currentLevel.busy, null, { timeout: 8000 }).catch(() => {});
    }
    await tp(info.dawn.x - 20, info.dawn.y - 2); await sleep(1500);
    await tp(info.dawn.x, info.dawn.y); await sleep(700);
    await key('e');
    await page.waitForSelector('.panel', { timeout: 120000 });
    await clickFoot(/./); // journal
    await waitModal(/Final archive/i, 30000);
    const archiveTxt = await ev(() => document.querySelector('.panel-body')?.innerText ?? '');
    check('final archive (extended run): all 17 rooftop questions and the 8 optional fragments counted', /17\/17/.test(archiveTxt) && /\b8\/14\b/.test(archiveTxt), archiveTxt.replace(/\s+/g, ' ').slice(0, 140));
    await clickFoot(/Continue/);
    await waitModal(/end of this chapter/i, 20000);
    const endTxt = await ev(() => document.querySelector('.ending')?.innerText ?? '');
    const endings = await ev(() => window.__app.progress.state.endings);
    check('extended ending: shows "Every memory, and the dawn after" and no "longer ending" hint', /Every memory, and the dawn after/i.test(endTxt) && !/There is a longer ending/i.test(endTxt), endTxt.replace(/\s+/g, ' ').slice(0, 130));
    check('extended ending: recorded (extended + standard)', endings.extended === true && endings.standard === true, JSON.stringify(endings));
    await shot('c1_extended_ending');
    await clickFoot(/Return to menu/);
    await page.waitForFunction(() => window.__app.game.scene.isActive('MainMenuScene'), null, { timeout: 30000 });
    flush('extended ending');
    await page.close();
  }

  // =================================================================== PART B: phone (390x844, touch)
  if (!process.env.ONLY || process.env.ONLY === 'B') {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const problems = []; attach(page, problems);
    const H = mkHelpers(page, problems); const { ev, shot, flush, modalTitle, waitModal, clickFoot, boot, waitLevel } = H;
    log('=== B: phone layout ===');
    await boot();
    const overflow = async (label) => {
      const o = await ev(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bsw: document.body.scrollWidth, panels: [...document.querySelectorAll('.panel')].map((p) => { const r = p.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; }) }));
      const ok = o.sw <= o.cw + 1 && o.panels.every((p) => p.l >= -1 && p.r <= o.cw + 1 && p.t >= -1 && p.b <= 844 + 1);
      check(`mobile: ${label} fits the screen (no horizontal overflow)`, ok, JSON.stringify(o));
    };
    await overflow('main menu');
    await shot('m1_menu');
    const menuBtns = await ev(() => [...document.querySelectorAll('.menu-col .btn')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.height); }));
    check('mobile: main-menu buttons are tap-sized (>= 40px tall)', menuBtns.every((h) => h >= 40), menuBtns.join(','));

    await page.locator('.menu-col .btn', { hasText: 'Learn About Each Other' }).tap();
    await waitModal(/learn|each other/i, 8000);
    await overflow('Learn About Each Other index');
    await shot('m2_questionnaire');
    const cat = page.locator('.panel .btn, .panel button').filter({ hasText: /Feeling loved|Together time|Things to try|How we talk/i }).first();
    if (await cat.count()) { await cat.tap(); await sleep(500); await overflow('a question category'); await shot('m3_category'); }
    await page.keyboard.press('Escape'); await sleep(300); await page.keyboard.press('Escape'); await sleep(300);

    await page.locator('.menu-col .btn', { hasText: 'Settings' }).tap();
    await waitModal(/settings/i, 8000);
    await overflow('Settings');
    await shot('m4_settings');
    await page.keyboard.press('Escape'); await sleep(300);

    // touch controls inside a level
    await ev(() => { window.__app.progress.newGame('mule'); window.__app.startStage('stage1'); });
    await waitLevel('stage1');
    await sleep(3000);
    const touchVisible = await ev(() => { const t = document.querySelector('.touch'); return t && !t.hidden && getComputedStyle(t).display !== 'none'; });
    check('mobile: on-screen touch controls appear automatically in a stage', touchVisible === true);
    const rects = await ev(() => [...document.querySelectorAll('.touch .tbtn')].map((b) => { const r = b.getBoundingClientRect(); return { a: b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; }));
    check('mobile: all six touch buttons are on screen and at least 44px', rects.length === 6 && rects.every((r) => r.l >= 0 && r.r <= 391 && r.b <= 845 && r.w >= 44 && r.h >= 44), JSON.stringify(rects));
    await shot('m5_stage_touch');
    const cdp = await ctx.newCDPSession(page);
    const centre = async (action) => { const b = await page.locator(`.touch .tbtn[aria-label="${action}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const touchDown = async (action, id) => { const c = await centre(action); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id }] }); };
    const touchUp = async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
    const x0 = await ev(() => window.__app.currentLevel.player.x);
    await touchDown('right', 1);
    await page.waitForFunction((x0) => window.__app.currentLevel.player.x > x0 + 20, x0, { timeout: 15000, polling: 30 }).catch(() => {});
    const heldWhileTouching = await ev(() => [...window.__app.input.held.keys()]);
    await touchUp();
    const x1 = await ev(() => window.__app.currentLevel.player.x);
    check('mobile: a real finger held on the on-screen right button moves the character', x1 > x0 + 20 && heldWhileTouching.includes('right'), `${Math.round(x0)} -> ${Math.round(x1)}; held=${heldWhileTouching}`);
    await sleep(300);
    const releasedOk = await ev(() => [...window.__app.input.held.keys()].length === 0);
    check('mobile: lifting the finger releases the action (no stuck input)', releasedOk === true);
    await sleep(900);
    const y0 = await ev(() => window.__app.currentLevel.player.y);
    await touchDown('jump', 2);
    await page.waitForFunction((y0) => window.__app.currentLevel.player.y < y0 - 6, y0, { timeout: 8000, polling: 25 }).catch(() => {});
    await touchUp();
    check('mobile: the on-screen JUMP button jumps', (await ev(() => window.__app.currentLevel.player.y)) < y0 - 6);
    await sleep(1200);
    // two fingers at once: run right while pressing attack
    const cR = await centre('right'); const cA = await centre('attack');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cR.x, y: cR.y, id: 1 }, { x: cA.x, y: cA.y, id: 2 }] });
    await sleep(250);
    const multi = await ev(() => [...window.__app.input.held.keys()].sort());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('mobile: two fingers work together (move + attack held at once)', multi.includes('right') && multi.includes('attack'), `held=${multi}`);
    await sleep(500);

    // pause button on phone? (HUD has a pause control)
    const pauseBtn = await ev(() => !!document.querySelector('.hud [aria-label*="ause" i], .hud .pause, button[aria-label*="ause" i]'));
    check('mobile: a visible pause control exists (Esc is not available on phones)', pauseBtn === true);

    // resize during play: rotate to landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(800);
    const canvas = await ev(() => { const c = document.querySelector('#game canvas'); const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight }; });
    check('resize: rotating to landscape refits the canvas (fills the limiting side, 16:9, nothing cut off)', canvas.w <= canvas.vw + 1 && canvas.h <= canvas.vh + 1 && (Math.abs(canvas.h - canvas.vh) <= 2 || Math.abs(canvas.w - canvas.vw) <= 2) && Math.abs(canvas.w / canvas.h - 16 / 9) < 0.05, JSON.stringify(canvas));
    await shot('m6_landscape');
    const touchLand = await ev(() => { const rs = [...document.querySelectorAll('.touch .tbtn')].map((b) => b.getBoundingClientRect()); return rs.every((r) => r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1); });
    check('resize: touch buttons stay on screen in landscape', touchLand === true);
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(900);
    const back = await ev(() => { const c = document.querySelector('#game canvas').getBoundingClientRect(); return { w: Math.round(c.width), vw: innerWidth }; });
    check('resize: rotating back to portrait refits again', Math.abs(back.w - back.vw) <= 2, JSON.stringify(back));
    flush('phone layout');
    await ctx.close();
  }

  const failed = results.filter((r) => !r.ok);
  log(`SUMMARY: ${results.length - failed.length}/${results.length} checks passed`);
  for (const f of failed) log('  FAILED:', f.name);
  await browser.close();
  process.exit(failed.length ? 2 : 0);
})().catch((e) => { console.error('BOT CRASHED', e); process.exit(1); });
