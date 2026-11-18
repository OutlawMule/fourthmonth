# MULE × PRINCESS — manual test checklist

Work through this before you share the game. Tick each box (`[x]`) as you go. Anything that fails: write down what you did, what you expected and what happened.

**How to use it**

* Part A–F need no online setup (guest mode). Do them first, on a computer, then again on a phone.
* Part G–J need Supabase set up (README Part 3) and **two accounts** (use two browser profiles, or a normal window plus a private window).
* Run Parts A–J once on `npm run dev` (or `npm run preview`) and again on your real Vercel address.

Automated checks (`npm test`, `npm run build`) are separate; see the README, Part 6.

---

## A. Start-up and intro

- [ ] `npm run dev` starts without errors and the page loads.
- [ ] First visit: the opening sequence ("BLAQ STUDIOS: PIXELS & PEONIES") plays: six short scenes, a **Skip** button, then an **ENTER** prompt after about 6–10 seconds.
- [ ] Nothing makes sound before you click or press a key.
- [ ] Pressing **ENTER** (or tapping) reaches the main menu.
- [ ] Reloading the page skips the intro and goes straight to the main menu.
- [ ] **Settings → Replay intro** plays it again.
- [ ] With **Settings → Reduced motion** on, the intro is a calmer, simpler version.

## B. Main menu and screens

- [ ] The menu shows: New Game, Continue, Character Selection, Memory Archive, Learn About Each Other, Settings, Credits.
- [ ] **Continue** is greyed out when there is no saved game, and shows the stage number once there is one.
- [ ] Every item can be reached with the keyboard (Tab, arrows, Enter) and has a clearly visible focus outline.
- [ ] **New Game** (with a save) asks for confirmation and says your answers are **not** deleted. Cancelling keeps the save.
- [ ] After a New Game, answers you saved earlier are still in **Learn About Each Other**.
- [ ] **Character Selection** shows both characters with animated previews and their abilities; choosing one works.
- [ ] **Memory Archive** opens and shows fragments, journal entries and (after Stage 1) a way to read the letter again.
- [ ] **Credits** opens and closes.
- [ ] The bottom of the menu reads "BLAQ STUDIO" once (pixel logo) with "PIXELS & PEONIES" beside it, not the same words twice.

## C. Controls (computer)

- [ ] **A / D** and **← →** move. **Space**, **W** and **↑** jump; holding gives a higher jump.
- [ ] **J** and the **left mouse button** attack. **K** and **Shift** dash. **E** interacts. **Esc** pauses. **Enter** confirms.
- [ ] **S / ↓** drops through a ledge you are standing on.
- [ ] None of those keys scroll or move the page.
- [ ] **Esc** opens the pause menu with: Resume, Restart from checkpoint, Controls, Settings, Return to main menu.
- [ ] **Controls** in the pause menu lists every key above.
- [ ] **Restart from checkpoint** puts you back at the last checkpoint with the stage still running.
- [ ] **Return to main menu** asks for confirmation.
- [ ] Switching to another browser tab pauses the game.

### Big Boss Mule

- [ ] Holding a direction builds skateboard speed; the board sound rises.
- [ ] Jump then Attack in the air performs a trick; landing it scores.
- [ ] Three presses of Attack give a jab–cross–hook combo; the third hit knocks the enemy back.
- [ ] Dash is a quick burst and you can dash through a gap.
- [ ] Rails: landing on a rail while riding starts a grind.

### Princess

- [ ] She is clearly faster than Mule.
- [ ] A second press of Jump in mid-air gives a double jump.
- [ ] Dash is a quick slip that passes through harm.
- [ ] Attack fires a pink light pulse that **damages and defeats Lightwork** (walkers and drones).
- [ ] Every few shots a stronger burst fires.

## D. The four stages

Play each stage once as **Mule** and once as **Princess**.

### Stage 01 — The Night Our Worlds Collided

- [ ] Title card appears; objective text shows the three fragments, five Lightwork and the meeting point.
- [ ] The three story fragments ("I froze." / "She rushed to me." / "The thumb.") can be collected; each shows its text.
- [ ] Two optional bonus fragments exist and are reachable.
- [ ] Walkers wind up before they strike (you can see it coming); drones dive at you when you pass under them. Both can be defeated.
- [ ] Bounce pads, rails, ledges, hazards and checkpoints behave sensibly; falling in a pit costs one heart and returns you to the checkpoint.
- [ ] Dying shows a fade and returns you to the last checkpoint with full hearts.
- [ ] Standing at the meeting point **before** you are done only says what is still needed.
- [ ] With everything done, the meeting point opens and the first-meeting cinematic plays.
- [ ] The letter opens afterwards. **Read it against your original text: every word, capital letter and punctuation mark must be exactly as you wrote it** (including the odd spellings).
- [ ] After the letter, a journal entry appears, then Stage 02 loads.

### Stage 02 — The Log

- [ ] Conversation fragments can be collected in the park.
- [ ] Sitting at the log early only says how many fragments are missing.
- [ ] Sitting at the log offers optional prompts (answered ones show a tick); "Keep sitting" moves on.
- [ ] The time-skip montage plays and can be skipped with the **Skip** button once you have seen it.
- [ ] A journal entry appears, then Stage 03 loads.

### Stage 03 — After Everyone Else Is Asleep

- [ ] Quiet street; the two optional fragments can be collected and unlock the rain and fog nights (a message says so).
- [ ] Walking to her door starts the car-arrival cinematic.
- [ ] The late-night conversation is optional ("Just enjoy the quiet" ends it).
- [ ] Replaying the stage after unlocking offers clear / rain / fog; each looks different.
- [ ] Journal entry, then Stage 04 loads.

### Stage 04 — Learning Your World

- [ ] Eight memory objects exist (four on the street, four on the way up / on the rooftop).
- [ ] Interacting with an object opens its question category (everything optional).
- [ ] The rooftop is **not reachable** until four memory objects are open (the holo gate is closed before that).
- [ ] The bench refuses ("Not quite yet…") until the requirements are met.
- [ ] The dawn cinematic plays, then a journal entry, then the **Final archive**, then the ending.
- [ ] **Standard ending** (4 objects, nothing else): shows the standard text and the hint about the longer ending.
- [ ] **Extended ending** (every optional fragment in the game **and** all rooftop questions answered): shows "Every memory, and the dawn after" and no hint.
- [ ] After the ending, **Edit this message** lets you change the title and text; **Save message** shows where it was saved; **Restore the original** brings the default back.
- [ ] **Return to menu** goes back to the main menu; the stages stay completed.

## E. Settings and accessibility

- [ ] Music volume, effects volume and **Mute all audio** work.
- [ ] **Text size** changes the size of menus and dialogue immediately.
- [ ] **High contrast interface** changes the look of the menus.
- [ ] **Reduced motion**: fewer particles and flashes, simpler transitions, text appears instantly.
- [ ] **Reduced screen shake**: hits and landings no longer shake the screen.
- [ ] **Offer to skip cinematics I have already seen** shows a Skip button on a second viewing.
- [ ] **On-screen touch controls** auto / on / off works.
- [ ] **Reset game progress** asks for confirmation, says answers are not deleted, and keeps your answers.
- [ ] **Delete device answers** asks for confirmation and removes only answers saved on this device.
- [ ] Settings are still there after reloading the page.
- [ ] Everything can be done with the keyboard alone; the focus outline is always visible.
- [ ] Resizing the browser window refits the game; nothing is cut off.

## F. Phone and tablet

Open the game on a real phone (and a tablet if you have one).

- [ ] The main menu fits the screen with no sideways scrolling; buttons are comfortable to tap.
- [ ] In a stage, six on-screen buttons appear: left, right, hit, dash, use, jump. They are large enough and do not hide the character.
- [ ] Holding **right** keeps moving; letting go stops. Two fingers at once work (run + jump, run + hit).
- [ ] A **pause** button (II) is visible, since there is no Esc key.
- [ ] Held upright, a tip suggests turning the phone sideways; sideways, the game fills the screen.
- [ ] Rotating the phone mid-game refits the game.
- [ ] Question screens and the letter are readable and scroll inside their box, not the whole page.
- [ ] Pulling down on the screen does not refresh or scroll the game.

## G. Sound

- [ ] Music and effects start only after the first tap or key press.
- [ ] Mute and the volume sliders work, and stay set after reloading.
- [ ] Each action has a sound: jump, land, punch, hit, dash, pickup, hurt, UI move/confirm.
- [ ] The game still works with the sound muted or blocked.

## H. Guest mode and saving (no account)

- [ ] Progress is kept after closing and re-opening the browser (**Continue**).
- [ ] An answer saved as **Only on this device** stays after reloading and is marked "Saved on this device".
- [ ] A **draft** is labelled as a draft and does not count as answered.
- [ ] The Account screen honestly says online features are not set up (if you have not added Supabase), with **no** sign-in form.
- [ ] Answers never appear in the address bar, and never in the browser console (press F12).
- [ ] With the browser's site data blocked, the game still runs and says it cannot save.

## I. Accounts (needs Supabase)

- [ ] **Create account** (or an account made in the dashboard) works; a confirmation email arrives if confirmation is on, and its link brings you back to the game.
- [ ] **Sign in**, **Sign out**, and **Continue as guest** all work.
- [ ] Reloading the page keeps you signed in.
- [ ] **Forgot password → Send reset link**: the email arrives, the link opens the game, and **Save new password** lets you sign in with the new one.
- [ ] Wrong password and unknown email show a clear, non-technical message (and the same message for both).
- [ ] After signing in, progress from this device and the account are merged (nothing is lost).
- [ ] Answers saved as **Private, in my account** show "Saved to your account" **only after** the save really succeeded. With the network switched off, the answer says it could not be saved to the account instead of claiming success.
- [ ] **Delete my online data** asks you to type DELETE; afterwards the online answers and progress are gone, answers on this device remain.

## J. Pairing and sharing (two accounts, two browser windows)

Call them **A** and **B**.

- [ ] A: **Create invitation code**: a code appears with an expiry and a Copy button.
- [ ] B: enter the code → **Paired**. A's screen also shows **Paired** (within a few seconds, or after **Refresh now**).
- [ ] A third account entering the same code is rejected (single use), and a made-up code is rejected with the same message as an expired one.
- [ ] After about 5 wrong codes in a row the account is told to wait.
- [ ] A creates a **new** code while another is still open: the older code stops working.
- [ ] A answers a question as **Share with my partner** and presses **Submit**: B sees it under **Learn About Each Other → Shared answers** within a few seconds.
- [ ] A saves a **draft** with "Share with my partner" selected: B does **not** see it, and A's screen says it is saved to the account but **not shared until submitted**.
- [ ] A answers as **Private, in my account** or **Only on this device**: B does **not** see it.
- [ ] The **Private, in my account** option is honest about who can read it: it says your partner cannot see it in the game **and** that whoever runs the database can. (As the project owner, open **Table Editor → answers** once and confirm you can read a Private answer there; then tell your partner.)
- [ ] A changes a shared answer back to private: it disappears from B's view.
- [ ] B edits the shared closing message at the end of the game: A sees the same text.
- [ ] A **Leave this relationship space**: B no longer sees A's previously shared answers; nothing of B's is deleted.
- [ ] Turn Wi-Fi off on B for a minute, then back on: shared answers refresh again without reloading (fallback polling / refetch).

### Direct check that private answers never reach the other player

Signing in the game proves what the screen shows. This proves what the **server returns**. Do it once on your real project.

1. In window **B**, sign in, press `F12`, open the **Network** tab and filter for `answers`.
2. Have **A** save one answer as **Private, in my account**, one as **Shared** (submitted) and one **draft** with sharing selected.
3. In **B**, open **Learn About Each Other → Shared answers** and press **Refresh now**.
4. In the Network tab click the `answers` request and look at the **Response**: it must contain **only** B's own rows and A's **submitted, shared** answer. A's private answer and A's draft must not appear anywhere in the response.

(Do not paste anyone's real answers into chat or tickets. Use throwaway text such as "test private 1".)

### Optional: the same check as a script

`node scripts\verify-rls.mjs` repeats this, and more, automatically with two **new throwaway** accounts (set up in the first lines of that file). Treat it as a second opinion, not a replacement for the Network-tab check above: it has been tested against the real database rules on an embedded PostgreSQL engine, but **not** against a live Supabase project.

- [ ] The script ends with "All checks passed". (If it reports FAIL for a privacy check, **do not share the link**; if the message looks like a script problem, rely on the Network-tab check above.)

## K. Final checks before sharing the link

- [ ] The live address loads over **https** and the game starts.
- [ ] Open the browser console (F12): no red errors on the menu, in Stage 1 or in the ending.
- [ ] The built game contains no secret key. In the project folder, after `npm run build`, run this in PowerShell; it must print **nothing**:
  `(Select-String -Path dist\build\*.js -Pattern 'sb_secret_[A-Za-z0-9_-]{10,}' -AllMatches).Matches.Value`
  (Do not search for the plain words `service_role` or `sb_secret`: they appear in the built code on purpose, because the game's key guard uses them to **refuse** such keys. Only a long key after `sb_secret_` is a problem. If you use the older JWT-style keys, the only long `eyJ...` token that may appear is the one labelled **anon** that you put in `VITE_SUPABASE_PUBLISHABLE_KEY`; `npm run build` already refuses to run if a service-role token is in any `VITE_` variable.)
- [ ] The same check on the live site: open the live address, press `F12` → **Sources** (or **Network**), open the large `index-....js` file under `build/` and search it for `sb_secret_`: only the guard's own short text may appear, never a key.
- [ ] The Supabase **Site URL** and **Redirect URLs** include the live address.
- [ ] Sign-ups are switched off in Supabase once both accounts exist (optional but recommended).
- [ ] Both of you can sign in on your own phones and both can reach the ending.
- [ ] The letter is word-for-word correct on the live site.

---

### Result log

| Date | Build / URL | Tester | Parts passed | Problems found |
| --- | --- | --- | --- | --- |
| | | | | |
