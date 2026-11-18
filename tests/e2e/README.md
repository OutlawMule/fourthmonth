# Optional browser tests

These two scripts drive the real game in a real browser. They are **not** part of `npm test` (which is fast and needs nothing installed). Use them when you change gameplay code and want to be sure the whole game still plays through.

| Script | What it checks | Time |
| --- | --- | --- |
| `playthrough.cjs` | Plays Stage 1 → 4 with real keys and real fights: fragments, the locked meeting point, the cinematics, the letter (compared with `tests/fixtures/letter.original.txt`), the rooftop gate, the dawn, the standard ending, editing and restoring the closing message. `CHAR=princess` plays it as Princess. | 2–3 min |
| `ui-and-mobile.cjs` | Menu and settings, New Game keeping saved answers, Princess's double jump / dash / pulse, dying and respawning, the extended ending, and a phone-sized screen with real touch input and rotation. `ONLY=A` or `ONLY=B` runs half. | 4 min |

## Run them (Windows PowerShell)

```powershell
# one-time
npm install --no-save playwright
npx playwright install chromium

# terminal 1
npm run dev

# terminal 2
node tests\e2e\playthrough.cjs
node tests\e2e\ui-and-mobile.cjs
```

They print `PASS` / `FAIL` lines and exit with code 2 if anything failed. Screenshots go to your temp folder (`SHOT_DIR=some\folder` to choose another).

* They need the **dev** server (`npm run dev`), because they use a `window.__app` hook that is only present in dev builds. They never touch Supabase.
* `BASE_URL=http://localhost:5180` if your dev server uses another port.
* On a computer with no graphics card (some servers and containers) set `SOFTWARE_GL=1`.
* Not tested here: they were written and run in a Linux container, not on Windows.
