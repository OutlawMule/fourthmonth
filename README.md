# MULE × PRINCESS

*A playable cyberpunk pixel-art story by **BLAQ STUDIO**. Opening sequence: "BLAQ STUDIOS: PIXELS & PEONIES".*

Four stages, three places, two characters, one story: the night two worlds collided, the quiet time after, the midnight car ride, and a rooftop where you learn each other's world, one optional question at a time.

Built with plain HTML/CSS/JavaScript, **Phaser 3**, **Vite**, **Supabase** (optional online features) and **Vercel** (hosting). All art and sound are generated in code; there are no image or audio files to download.

You can play it **right now without any account or database**. The online features (accounts, pairing with a partner, shared answers) are optional and switch on when you add two settings (see [Part 3](#part-3--turn-on-the-online-features-supabase)).

---

## Contents

1. [Quick start on Windows](#part-1--quick-start-on-windows) (play it in about 5 minutes)
2. [How to play](#part-2--how-to-play)
3. [Turn on the online features (Supabase)](#part-3--turn-on-the-online-features-supabase)
4. [Put it on the internet (Vercel)](#part-4--put-it-on-the-internet-vercel)
5. [Change the words: letter, questions, endings](#part-5--change-the-words-letter-questions-endings)
6. [Tests and checks](#part-6--tests-and-checks)
7. [How privacy and security work](#part-7--how-privacy-and-security-work)
8. [What has and has not been verified](#part-8--what-has-and-has-not-been-verified)
9. [Troubleshooting](#part-9--troubleshooting)
10. [Project map](#part-10--project-map)

---

## Part 1 — Quick start on Windows

You need two things installed: **Node.js** (version **22.12 or newer**) and a terminal (PowerShell is fine).

### 1. Check Node.js

Open **PowerShell** (Start menu, type `powershell`) and run:

```powershell
node --version
npm --version
```

* If `node --version` prints `v22.12.0` or higher (for example `v22.14.0` or `v24.x`), continue.
* If it says "not recognized", or the number is lower than 22.12, install the **LTS** version from <https://nodejs.org>, close PowerShell, open a new one, and check again.

### 2. Open the project folder

Unzip the project somewhere simple, for example `C:\Games\mule-princess`, then:

```powershell
cd C:\Games\mule-princess
```

### 3. Install the dependencies (once)

```powershell
npm install
```

This downloads Phaser, Supabase's JavaScript client and the tools used to build and test. It needs an internet connection and can take a minute or two.

### 4. Start the game

```powershell
npm run dev
```

PowerShell prints an address, normally **http://localhost:5173/**. Open it in Chrome, Edge or Firefox. The game reloads by itself when you change a file. Press `Ctrl + C` in PowerShell to stop it.

The very first time you will see the opening sequence (about 8 seconds, with a **Skip** button). Press **ENTER** at the end of it to reach the main menu. On later visits the intro is skipped automatically; you can watch it again from **Settings → Replay intro**.

> Sound only starts after your first click or key press (browsers require this), so the intro is silent until you interact.

### 5. Make a production build (optional check)

```powershell
npm run build      # creates the "dist" folder
npm run preview    # serves "dist" locally so you can test the real build
```

---

## Part 2 — How to play

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | **A / D** or **← →** | on-screen arrows |
| Jump | **Space**, **W** or **↑** (hold for a higher jump) | Jump button |
| Attack | **J** or **left mouse button** | Attack button |
| Dash / dodge | **K** or **Shift** | Dash button |
| Interact / read | **E** | Use button |
| Drop through a ledge | **S** or **↓** | |
| Pause | **Esc** | Pause button |
| Confirm | **Enter** | tap |

The controls guide is also in the pause menu (**Esc → Controls**). Game keys never scroll the page. Touch buttons appear automatically on phones and tablets (**Settings → On-screen touch controls**: auto / on / off).

### The two characters

* **Big Boss Mule**: hold a direction to build skateboard speed, land tricks in the air, a three-hit boxing combo (jab, cross, hook) and a dash.
* **Princess**: faster, a double jump, a quick dodge and a light-energy pulse you can fire from a distance.

Both can finish every stage. You can change character from the main menu (**Character Selection**).

### The four stages

| Stage | Where | What happens |
| --- | --- | --- |
| **01 The Night Our Worlds Collided** | Drag-racing district | Collect three memory fragments ("I froze." / "She rushed to me." / "The thumb."), defeat the five Lightwork, reach the meeting point. The first-meeting cinematic plays and the letter opens. |
| **02 The Log** | Park | Find the conversation fragments, sit on the log, open optional prompts, then a skippable time-skip montage. |
| **03 After Everyone Else Is Asleep** | Residential street | Walk to her door, watch the car arrive, optional late-night conversation. Collect the optional fragments to unlock rain and fog versions of the night. |
| **04 Learning Your World** | Neighborhood and rooftop | Open memory objects (each opens a question category), open the holo gate, climb to the rooftop, watch the dawn, reach the ending. |

Nothing can be skipped by a menu: every stage is completed by playing it. Cinematics you have already seen can be skipped (**Settings → Offer to skip cinematics I have already seen**).

### Endings

* **Standard ending**: open at least four memory objects, reach the rooftop and watch the dawn.
* **Extended ending**: collect every optional fragment in the whole game **and** answer every rooftop question.

After the ending you can **edit the closing message** (saved on this device, and shared with your partner if you are paired). **Restore the original** puts the default text back.

### Settings

Music and effects volume, mute, text size, high contrast, reduced motion, reduced screen shake, skip seen cinematics, touch controls, **Replay intro**, reset game progress, delete answers saved on this device, and the account screen. All menus work with the keyboard and show a visible focus outline.

### New Game, Continue and your answers

* **New Game** asks for confirmation and **never deletes your relationship answers**.
* **Settings → Reset game progress** also keeps your answers.
* Answers can only be removed on purpose: **Delete device answers** (this browser) or **Delete my online data** (your account), each with its own confirmation.
* **Continue** is disabled until there is a saved game.

### "Learn About Each Other"

Optional questions in eight categories. There are no right answers and nothing is required. For every answer you choose where it lives:

| Choice | Meaning | Badge |
| --- | --- | --- |
| **Only on this device** | stays in this browser | *Saved on this device* |
| **Private, in my account** | saved online; hidden from your partner in the game (whoever runs the database can still read it, see Part 7) | *Saved to your account* |
| **Share with my partner** | your partner can read it once you **submit** it | *Shared with your partner* |

A draft you saved but did not submit is never shown to your partner, even if you chose "share". An answer is only marked saved after it has really been saved (device: written to the browser; account: confirmed by the database).

Sample answers that appear in the game are marked **(fictional)**. No real events or answers are invented by the game.

---

## Part 3 — Turn on the online features (Supabase)

This part is optional. Skip it to play as a guest; everything is saved in your browser.

You will: create a free Supabase project, create the tables, allow your site's address for sign-in links, create two accounts, paste two values into a settings file, and test pairing.

> ### Already on Vercel, and you just want her answers to reach you?
>
> Without these steps the game says "Online sharing is not set up in this build" and the **Private** and **Share with my partner** buttons stay greyed out. Do these seven things, in this order:
>
> 1. Supabase: **New project** (step 1 below).
> 2. **SQL Editor → New query**, paste the whole of `supabase\SETUP_ALL_IN_ONE.sql`, press **Run**. (One file instead of six. If the editor warns about "destructive operations", that is expected; confirm.)
> 3. **Project Settings → API**: copy the **Project URL** and the **Publishable key**.
> 4. **Vercel → your project → Settings → Environment Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (tick Production, Preview and Development). Then **Deployments → the three dots on the latest one → Redeploy**. The values are copied in when the site is built, so nothing changes until you redeploy.
> 5. **Authentication → Providers → Email** (newer dashboards: *Sign In / Providers*): switch **Confirm email** off, so nobody needs a confirmation email. Then **Authentication → URL Configuration** and set **Site URL** to your project's main Vercel address (Vercel → Settings → Domains), not one of the addresses with random letters in it.
> 6. In the game, each of you: **Settings → Open account → Create account**, with your own email and your own password (she picks hers; nobody else needs to know it). When both accounts exist, switch **Allow new users to sign up** off. Then you: **Pairing → Create invitation code** and send the code to her. Her: **Pairing**, paste the code, **Join**.
> 7. When she answers a question in **Learn About Each Other** she chooses **Share with my partner** and presses **Submit answer**. You read it under **Learn About Each Other → Shared answers**. As a table: **SQL Editor** → paste `supabase\VIEW_SHARED_ANSWERS.sql` → **Run**.
>
> Not sharing yet? Check that both of you are signed in and show **Paired**: the sharing button stays disabled until then. A draft is never shown to your partner; she has to **Submit**.

### 1. Create the project

1. Go to <https://supabase.com>, sign in, **New project**. Pick any name, choose a region near you, and set a database password (store it in a password manager; the game never needs it). If the form offers an option to enable the **Data API**, leave it on: the game talks to your database through it.
2. Wait until the project finishes starting.

### 2. Create the tables (run the six migrations in order)

**Easiest:** open `supabase\SETUP_ALL_IN_ONE.sql` (the six files below, already joined in the right order), copy all of it, paste it into **SQL Editor → New query** and press **Run** once. It is safe to run again later: it never deletes answers. If the editor warns about "destructive operations", that is expected (the script replaces triggers it creates itself); confirm. After you change a migration, regenerate it with `npm run build:setup-sql`.

Or do it file by file. In the Supabase dashboard open **SQL Editor → New query**. For each file below, in this exact order: open the file from the `supabase\migrations` folder in Notepad, copy **all** of it, paste it into the editor and press **Run**. Wait for "Success" before the next one.

| # | File | What it does |
| --- | --- | --- |
| 1 | `20261029000001_initial_schema.sql` | tables, constraints, helper triggers |
| 2 | `20261029000002_rls_and_grants.sql` | Row Level Security and exact privileges |
| 3 | `20261029000003_secure_pairing.sql` | invitation and pairing functions |
| 4 | `20261029000004_realtime.sql` | Realtime notifications (content-free) |
| 5 | `20261029000005_delete_my_data.sql` | "Delete my online data" function |
| 6 | `20261029000006_seed_questions.sql` | the question list |

Check: **Table Editor** should now list `profiles`, `relationships`, `relationship_members`, `invitations`, `invitation_attempts`, `game_progress`, `story_memories`, `questions`, `answers` and `answer_signals`, each with RLS shown as enabled.

If you change questions later, see [Part 5](#part-5--change-the-words-letter-questions-endings); migration 6 can be re-run safely.

### 3. Tell Supabase which addresses are allowed

**Authentication → URL Configuration**:

* **Site URL**: `http://localhost:5173` while testing. After you deploy, change it to your Vercel address (for example `https://mule-princess.vercel.app`).
* **Redirect URLs**: add both
  `http://localhost:5173/**` and `https://YOUR-APP.vercel.app/**` (use your real Vercel address once you have it).

Without this, confirmation and password-reset emails send people to the wrong place. The dashboard's wording changes now and then; if you cannot find a field, use the dashboard's search box.

### 4. Create the two accounts

Pick one way:

* **Recommended for two people, no email needed:** in **Authentication → Providers → Email** (newer dashboards: *Sign In / Providers*) switch **Confirm email** off. Then each of you opens the game, **Settings → Open account → Create account**, and chooses your own password. Nobody else ever knows it. Afterwards switch **Allow new users to sign up** off (below).
* **You create the accounts:** **Authentication → Users → Add user → Create new user**. Enter an email and password and tick the option to auto-confirm. Do this once for each of you. Whoever types the password knows it, and the game has no "change password" button outside the reset-email flow, so this suits your own account better than hers.
* **Sign up inside the game with confirmation emails on:** **Settings → Open account → Create account**, then click the confirmation link in the email.
  Note: Supabase's built-in email sender is meant for testing and is rate-limited; as far as I know it may only deliver to people who belong to your Supabase organization. If emails never arrive, use the "Add user" method above or configure your own SMTP provider in **Project Settings → Authentication**. Password-reset emails go through the same sender.

If you keep **Confirm email** on (the default), sign-up needs confirmation emails to arrive, so read the note above first.

Recommended for a private two-person game: once both accounts exist, switch off **Allow new users to sign up** in the Authentication settings, so strangers cannot create accounts on your project.

### 5. Add the two values to the game

1. In Supabase: **Project Settings → API** (or **API Keys**). Copy the **Project URL** and the **Publishable key** (starts with `sb_publishable_`; older projects call it the *anon* key, which also works).
2. In PowerShell, inside the project folder:

   ```powershell
   Copy-Item .env.example .env.local
   notepad .env.local
   ```

3. Replace the two placeholder values and save:

   ```
   VITE_SUPABASE_URL=https://abcdefghijkl.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxx
   ```

4. Stop the dev server (`Ctrl + C`) and start it again with `npm run dev`. Vite only reads these values when it starts.

> **Never** paste the **service_role** key or any "secret" key into this file or into a `VITE_` variable. Anything starting with `VITE_` is shipped to every visitor's browser. If a `sb_secret_...` key or a service-role token is found in **any** `VITE_` variable, `npm run dev` and `npm run build` (and therefore a Vercel build) **stop with a message that names the variable** (never the value), so nothing secret is published; if one ever reached the game it would still refuse to use it. Those two `VITE_` names are the only environment variables the game reads, and it reads them by exact name, so no other variable is copied into the built files.

`.env.local` is listed in `.gitignore` so it is not committed by accident.

### 6. Test pairing (two browser profiles)

You need two people-sessions at once, for example one normal Chrome window and one Incognito window (or two Chrome profiles).

1. **Window A**: open the game → **Settings → Open account** → sign in as the first account → **Pairing**. Press **Create invitation code**. A code appears (20 characters, valid 48 hours, single-use). Copy it.
2. **Window B**: sign in as the second account → **Pairing** → "Or enter a code you were sent" → paste → **Join**. Both windows show **Paired** and the partner's name.
3. In **A**, open **Learn About Each Other**, answer a question, choose **Share with my partner**, **Submit**. In **B** open **Learn About Each Other → Shared answers**: it appears within a few seconds (Realtime), or after pressing **Refresh now**.
4. In **A**, answer another question as **Private, in my account**. Confirm it does **not** appear in **B**.
5. Try the code again from a third account: it must be rejected (single use, two-person limit).

The complete list of online checks is in [`docs/MANUAL_TEST_CHECKLIST.md`](docs/MANUAL_TEST_CHECKLIST.md).

### 7. Seeing what your partner shared

* **In the game:** **Learn About Each Other → Shared answers** shows every answer that was submitted and marked *Share with my partner*, for both of you.
* **As a table:** in Supabase **SQL Editor**, paste `supabase\VIEW_SHARED_ANSWERS.sql` and press **Run**. It is read-only and lists who wrote each answer next to the question.
* **Be straight with each other about "Private":** whoever runs the Supabase project (the owner) can open **Table Editor → answers** and read every row, including answers saved as *Private*. The game says this next to the Private option. The only choice the owner cannot read is **Only on this device**.

### What each online feature does

* **Sign up / in / out, password recovery, session restore:** standard Supabase Auth (PKCE flow). **Continue as guest** always works.
* **Progress sync:** guest progress in the browser and account progress are merged (nothing newer is overwritten by something older).
* **Pairing:** the invitation code is generated and checked inside the database. Only its hash is stored; it expires after 48 hours, works once, wrong guesses are rate-limited and the answer to a wrong guess is always the same message. A relationship has at most two people.
* **Realtime with a fallback:** shared-answer changes arrive over Realtime; if Realtime is unavailable the game polls and also refreshes when the tab regains focus or the network returns.
* **Leave / delete:** **Leave this relationship space** and **Delete my online data** (type DELETE to confirm). Deleting your online data does not remove your sign-in itself; remove the user in **Authentication → Users** if you want that.

---

## Part 4 — Put it on the internet (Vercel)

The project already contains a `vercel.json` (build command `npm run build`, output folder `dist`, basic security headers). Vercel needs a place to read the code from, and the two environment variables.

### Option A — GitHub + Vercel website (recommended for beginners)

1. Create a GitHub account and a **new private repository**. Upload/push the project. Do **not** include `node_modules`, `dist` or `.env.local` (the `.gitignore` already excludes them). With GitHub Desktop: *File → Add local repository*, commit, *Publish repository*.
2. Go to <https://vercel.com>, sign in with GitHub, **Add New → Project**, pick the repository.
3. Vercel detects **Vite**. Leave **Build Command** `npm run build` and **Output Directory** `dist`.
4. Open **Environment Variables** and add (for Production, Preview and Development):

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | your publishable (or anon) key |

5. Press **Deploy**. When it finishes, Vercel shows your address.
6. Go back to Supabase **Authentication → URL Configuration** and set the **Site URL** and **Redirect URLs** to that address (Part 3, step 3).

### Option B — Vercel command line

```powershell
npm install --global vercel
vercel login
vercel                    # first deploy; answer the prompts (framework: Vite)
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY
vercel --prod             # production deploy
```

### Changing the environment variables later = redeploy

Vite copies the two values into the built files **at build time**. If you change them in Vercel, the live site does not change until you **redeploy** (Vercel → Deployments → the three dots on the latest one → **Redeploy**, or push a new commit). The same is true locally: restart `npm run dev` after editing `.env.local`.

### Before you tell anyone it is live

Run through the checklist in [`docs/MANUAL_TEST_CHECKLIST.md`](docs/MANUAL_TEST_CHECKLIST.md) on the real address, on a phone as well as a computer.

---

## Part 5 — Change the words: letter, questions, endings

Everything story-related is plain text in `src\data`. Save the file and the dev server reloads.

| What | File | Notes |
| --- | --- | --- |
| **The first-meeting letter** | `src\data\letter.js` | Its own file. Preserved exactly as supplied: spelling, punctuation and grammar are **not** corrected. The letter is never read from or overridden by the database. If you change it on purpose, also update `tests\fixtures\letter.original.txt`, otherwise the test that guards against accidental "corrections" will (correctly) fail. |
| Dialogue, journal entries, cinematic captions, endings, achievements, credits | `src\data\memories.js` | Editable text. The two **endings** and the default closing message are in `ENDINGS`. The late-night lines in `MIDNIGHT_LINES` are placeholders, not things that were really said. |
| Questions and categories | `src\data\questions.js` | After editing run `node scripts\generate-question-seed.mjs` to rebuild `supabase\migrations\20261029000006_seed_questions.sql`, then run that file again in the Supabase SQL editor (it updates existing questions). `node scripts\generate-question-seed.mjs --check` verifies the file is up to date. |
| Characters' physics and stats | `src\data\characters.js` | |
| Stage rules and requirements | `src\data\stages.js` | |
| Level layouts (platforms, enemies, fragments, objects) | `src\data\levels\stage1.js` … `stage4.js` | After changing a layout run `npm test`; the level tests prove both characters can still reach everything. |

Editing the closing message in-game is also possible after finishing the game (see Part 2). If paired, it is stored in `story_memories` and both of you see it.

---

## Part 6 — Tests and checks

```powershell
npm test         # all automated tests, about 1 to 2 minutes
npm run build    # production build
```

What `npm test` covers (Vitest, 14 files):

* **Row Level Security with two (and more) signed-in users**, run against a real PostgreSQL engine embedded in the tests (PGlite) with Supabase's roles and `auth.uid()` emulated. It applies the actual migration files and checks, for example, that a user cannot read a partner's private answer or draft, cannot write into someone else's rows, cannot join a space without a valid single-use code, cannot add a third person, cannot read invitation codes or probe who belongs where, and that "leave" and "delete my data" behave. No Supabase account is needed to run these.
* Progress save/merge/sanitising, the answer service (device-first, serial saves, "not marked saved until confirmed"), the closing-message logic, validation and error messages, the public-key guard (refuses secret keys) and the module that applies it when the game starts, storage versioning, offline behaviour.
* Content: the letter equals the original text exactly, every question is well formed, the SQL seed matches the source file.
* Levels: every collectible and interactable in every stage can be reached by **both** characters with their real jump and speed limits, and the Stage 4 rooftop is **not** reachable until the memory gate is open.
* Hygiene scan of the source: no `innerHTML`, no `localStorage` outside the storage module, no console logging of answers, no answers or credentials in URLs, no secrets in the code, exactly two `VITE_` variables read by exact name.
* **The one-file database setup** (`supabase\SETUP_ALL_IN_ONE.sql`) must equal the six migrations, run as a single script on an empty database (ten tables, row-level security on all of them, questions seeded), and be safe to run again with data in place; the read-only `supabase\VIEW_SHARED_ANSWERS.sql` must list only answers that were submitted *and* shared.
* **The real production build** is run with test values: it must refuse to build when a secret key is in a `VITE_` variable (and never print the value), and a build given extra `VITE_` variables must contain the two public values and nothing else.

The tests do **not** talk to your hosted Supabase project, and they cannot see the game's graphics. Those are covered by the manual checklist.

### Optional extra checks

```powershell
node scripts\verify-rls.mjs      # live privacy check of YOUR Supabase project (needs two throwaway accounts)
npm run test:rls-script          # checks that live-check script itself, offline (about 1 minute)
node tests\e2e\playthrough.cjs   # plays the whole game in a real browser (see tests\e2e\README.md)
```

* **`scripts\verify-rls.mjs`** signs in as two brand-new throwaway accounts on your real project, pairs them, and tries what a curious second player could do through the public API: read the other's private answers and drafts, change or delete them, forge a row in their name, add itself to a space without a code, read invitation codes or profiles, and use the API with no sign-in at all. Each "must be refused" check is paired with a "this does work" check. It cleans up after itself and refuses to run on accounts that already have data. The top of the file explains how to set the two accounts and what it prints. **It has not been run against a real Supabase project** (there was none to test with), so treat the first run as part of your setup, and use the manual two-window check in the checklist (Part J) as the source of truth if the two ever disagree.
* **`npm run test:rls-script`** replays that script on your real migration files, on the embedded PostgreSQL engine, through a stand-in for the Supabase client. It must pass every check, and then it weakens one privacy rule at a time (15 of them: a policy that lets the partner read private answers, a missing sign-in requirement, an open invitations table, and so on) and the script must fail on the intended check each time. If you ever edit the migrations or the script, run it again.
* **`tests\e2e\`** are browser tests for people who change the game's code. They are not needed to play or deploy.

---

## Part 7 — How privacy and security work

* The browser only ever holds the **publishable (anon) key**. It is safe to expose **only because** Row Level Security is on for every table that holds personal data.
* The **service-role key is never used** by the game and must never be put in a `VITE_` variable or in the code. The build stops if one is found in any `VITE_` variable, and the game's own key guard refuses a `sb_secret_` key or a service-role token.
* **Private answers and drafts never reach the other player's browser:** the database policy only returns your own rows, plus rows that are both *shared* and *submitted* by a partner who is still in your space. Hiding a button in the page is not used as a security measure anywhere.
* **Whoever runs the Supabase project can read the whole database,** including answers saved as *Private*, in the dashboard. That is true of any hosted database, and the game's wording says so. *Private* means hidden from your partner **in the game**; an answer kept **Only on this device** is the one the project owner cannot read.
* Pairing codes are random, stored as hashes, expire, work once and are rate-limited. Memberships can only be created by the server-side function, never by the browser.
* All dynamic text is inserted into the page as plain text (never as HTML).
* Answers are never printed to the console, never put in URLs, and the saved progress file only records *which* questions were answered, never the answer text.
* No secrets are stored in `localStorage`; it holds progress, settings and the answers you chose to keep on this device.
* Details of the database design and the threat model: [`supabase/SECURITY.md`](supabase/SECURITY.md).

---

## Part 8 — What has and has not been verified

Being honest about this matters more than sounding finished.

**Verified (actually run in the build environment):**

* `npm run build` succeeds; `npm test` passes (208 tests in 14 files, including the PostgreSQL-engine RLS and pairing tests).
* The game boots in a real Chromium browser without console errors: intro, main menu, all four stages, pause menu and controls guide.
* A scripted player completed **Stage 1 → 4 end to end as Mule and again as Princess** (40 checks each) with real keyboard input and real combat, including the first-meeting cinematic, the locked meeting point refusing early, the letter on screen matching the original text character for character, the rooftop gate, the dawn, the standard ending, and editing and restoring the closing message.
* With real input: Princess's double jump, dash and light pulse; dying and respawning; Restart from checkpoint; the longer ending; New Game keeping the saved answers; the accessibility settings being applied and remembered.
* On an **emulated** phone screen (not a real phone): no sideways scrolling on the menus, tap-sized buttons, the six on-screen controls reacting to real touch events (two fingers at once too), and the picture refitting when the phone is rotated.
* The guest questionnaire flow in the browser (answers never appear in progress data, URLs or the console).
* The **production build** (not only the dev server) starts in a real browser: with no variables it is a guest-only game, and built with *test* Supabase values the account screen switches from "guest mode" to a sign-in form. The build refuses to run when a secret key is in any `VITE_` variable, and extra `VITE_` variables are not copied into the built files (both tested by running the real build). No real Supabase project was contacted.
* The **one-file setup and the "what was shared" query** run on the embedded PostgreSQL engine (see Part 6).
* `npm run test:rls-script`: the live-check script `scripts\verify-rls.mjs` passes all 41 of its checks on your real migrations (embedded PostgreSQL, stand-in client) and fails on the intended check for each of 15 deliberately weakened privacy rules.

**Not verified (cannot be checked from here; please check on your side):**

* **A real Supabase project:** sign-up emails, redirect URLs, password reset, Realtime delivery and PostgREST behaviour were not exercised against hosted Supabase. The SQL was tested on a real Postgres engine with Supabase's roles emulated, which is strong evidence but not the same thing. `supabase\config.toml` was written without the Supabase CLI and has not been run. The one-file setup was run on the embedded engine only: the hosted SQL Editor, the dashboard's current wording and your project's Auth settings were not exercised. **`scripts\verify-rls.mjs` has not been run against a hosted project**, and the offline test above cannot show how your project's API layer behaves.
* **Windows:** every command in this README is written for PowerShell, but everything was run in a Linux container, not on Windows.
* **Vercel:** the project has **not** been deployed by me. The configuration is standard but untested on your account.
* **Real graphics hardware, audio on real devices, and phone touch hardware.** The browser checks ran with software rendering; touch controls and mobile layout were reviewed in an emulated narrow viewport only.
* Dashboard wording in this README (Supabase and Vercel change their menus) is from memory and may differ slightly.

---

## Part 9 — Troubleshooting

| Problem | What to do |
| --- | --- |
| `node` is not recognized / version too low | Install the Node **LTS** from <https://nodejs.org>, then open a **new** PowerShell window. |
| PowerShell says "running scripts is disabled on this system" when you run `npm` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use **Command Prompt** (`cmd`) instead of PowerShell. |
| `npm install` fails on a network error | Check your connection or proxy, then run it again. |
| "Port 5173 is already in use" | Another copy is running. Close it, or run `npm run dev -- --port 5180`. |
| Blank page | Press `F12`, open **Console**, and read the red message. Do a hard refresh (`Ctrl + F5`). |
| The account screen says online features are not set up | `.env.local` is missing, a value is empty, or the dev server was not restarted. On Vercel: add both variables and **redeploy**. |
| It says the key is not allowed | You pasted a secret/service-role key. Use the **publishable** (or anon) key. Rotate the key you pasted if it was ever shared. |
| Confirmation or reset email never arrives / link goes to the wrong place | Check spam; check **URL Configuration** (Part 3, step 3); use **Add user** in the dashboard; or configure SMTP. |
| "That code did not work" when pairing | Codes are single-use, last 48 hours and are checked on the server; the message is the same for every kind of failure on purpose. Create a fresh code. |
| Partner's shared answer does not show | It must be **submitted** (not a draft) and set to **Share with my partner**, and you must both still be paired. Press **Refresh now**. |
| No sound | Click or press a key first; check **Settings → Mute** and the volume sliders. |
| Game feels slow | Close other tabs; make sure the browser has hardware acceleration on; try **Settings → Reduced motion**. |
| Touch buttons do not show on a touch laptop | **Settings → On-screen touch controls → on**. |

---

## Part 10 — Project map

```
index.html              page shell (the game canvas + HTML menus mount here)
art-preview.html        dev tool: contact sheets of the generated pixel art (open it while `npm run dev` runs)
vite.config.js          Vite + Vitest config
vercel.json             Vercel build settings and security headers
.env.example            the only two environment variables the game reads
src/
  main.js               boot: services, UI, Phaser game
  app.js                the shared "app" object (bus, progress, settings, services)
  data/                 all editable content (letter, questions, text, characters, stages, levels)
  game/
    scenes/             Intro, MainMenu, CharacterSelect, Preload, LevelScene (base),
                        DragRaceScene (stage 1), LogScene (2), MidnightScene (3), LearningScene (4)
    entities/           Player (Mule + Princess), Enemy (Lightwork walker + drone)
    systems/            InputManager, AudioManager, Cutscene, Fx, ProgressManager
    art/                procedural pixel art
  ui/                   HTML UI: menus, pause, settings, archive, questionnaire, account, ending
  services/             Supabase client (lazy), auth, relationships/pairing, answers, closing message, sync
  utils/                pure logic: progress model, storage, validation, closing text, level checker
  dev/                  the art contact-sheet tool (not part of the game)
supabase/
  migrations/           the six SQL files to run in order
  SETUP_ALL_IN_ONE.sql  the six migrations as one paste-able file (npm run build:setup-sql)
  VIEW_SHARED_ANSWERS.sql  read-only list of what was shared, for the SQL Editor
  SECURITY.md           database threat model
tests/                  Vitest tests (incl. RLS against embedded Postgres)
  offline-rls/          offline test of scripts/verify-rls.mjs (npm run test:rls-script)
  e2e/                  optional browser tests (Playwright; need the dev server)
scripts/                question seed generator; build-setup-sql.mjs; verify-rls.mjs (live privacy check of your project);
                        envGuard.mjs (the build stops if a secret key is in a VITE_ variable)
docs/                   manual test checklist
```

---

*MULE × PRINCESS is a work of fiction presented as a gift. No real events, messages or answers are invented by the game; anything sample is labelled "(fictional)". The first-meeting letter is the author's own text and is kept exactly as written.*
