# Security model

This document explains who can do what, where each rule is enforced, and what is **not** protected.
The rule of thumb: *the browser is never trusted*. Hiding a button is only a courtesy to the player;
every rule below is enforced by the database (`supabase/migrations/*.sql`), and
`tests/rls.test.js` attacks those rules as several different signed-in users.

## Keys

| Value | Where it lives | Notes |
|---|---|---|
| Project URL (`VITE_SUPABASE_URL`) | Browser bundle | Public by design. |
| Publishable / anon key (`VITE_SUPABASE_PUBLISHABLE_KEY`) | Browser bundle | Public by design. It only identifies the project; Row Level Security limits what it can do. |
| Service-role / secret key | **Nowhere in this repository** | Bypasses Row Level Security. Never put it in a `VITE_` variable. Two guards: the build and the dev server stop with a clear message if any `VITE_` variable holds one, so it is never copied into the public JavaScript (`scripts/envGuard.mjs`, tested in `tests/envGuard.test.js` by running the real build), and the client refuses to use one if it ever gets that far (`src/services/keyGuard.js`, `tests/keyGuard.test.js`). The game also reads its two variables by exact name, so no other `VITE_` variable can ride along into the bundle. |

Passwords are typed into the sign-in form and handed straight to Supabase Auth. The game never
stores them. `supabase-js` keeps the session (refresh token) in its own browser storage; the game's own
`localStorage` keys hold only progress, settings, device-only answers and the edited ending text
(`tests/storage.test.js`). No answer or credential ever goes into a URL, and no answer is logged
(`tests/hygiene.test.js`, `tests/answerService.test.js`).

## Who can read and write what

The browser connects as the Postgres role `anon` (signed out) or `authenticated` (signed in).
`anon` has **no** privileges on any table or function. For `authenticated`:

| Table | Read | Write |
|---|---|---|
| `profiles` | own row | own row; only `display_name` and `selected_character` can change |
| `relationships` | spaces you belong to | nothing (functions only) |
| `relationship_members` | members of your own space | nothing (functions only), so nobody can add themselves to a space |
| `invitations`, `invitation_attempts` | **nothing** | **nothing** (hashes cannot be read, guessed or edited) |
| `game_progress` | own row | own row |
| `story_memories` | members of the space | members of the space (the shared, editable closing message) |
| `questions` | everyone signed in | nobody (seeded by migration 6) |
| `answers` | **your own rows, plus your partner's rows that are `shared` AND `submitted`** | insert/update only as yourself, only into a space you belong to; delete only your own |
| `answer_signals` | members of the space | nobody (written by a trigger) |

### Answers

Each answer has `visibility` (`private` or `shared`) and `status` (`draft` or `submitted`).

* A **private** answer and any **draft** is returned only to its author, whatever filters the client sends:
  the policy `answers_select` simply does not match those rows for anybody else.
* Making an answer private again, or deleting it, takes it away from the partner immediately (the next
  query no longer returns it; a content-free signal tells their screen to refetch).
* **Sharing needs a partner**: a trigger refuses `visibility = 'shared'` unless the space has two members.
  When someone leaves, every `shared` answer in the old space reverts to `private`, so a future partner never
  inherits something that was shared with the previous one.
* Length, one-line and allowed-option rules are checked by a trigger as well as by the form.
* "Only on this device" answers never reach the database at all.

## Pairing (two people, one space)

All of it is done by `SECURITY DEFINER` functions that derive the caller from `auth.uid()`, set
`search_path = ''`, and are executable by `authenticated` only:

| Function | What it does |
|---|---|
| `ensure_relationship()` | Gives you your own (single-member) space the first time you save to your account. |
| `create_invitation()` | Returns a new code once. A newer code cancels the older one. At most 5 per hour. Refused when the space already has two people. |
| `redeem_invitation(code)` | Validates the code on the server and adds you to the space. |
| `get_my_relationship()` | Your space, member count and your partner's **display name and character only** (no email, no id). |
| `leave_relationship()` | Moves your answers into a new private space of your own and removes you from the pair. |
| `delete_my_data()` | Deletes your answers, progress, profile and invitations, and your place in the space. |

Invitation codes:

* 20 characters of Crockford base32 = **100 bits** from the database's CSPRNG (`gen_random_uuid()`).
* Only `sha256(code)` is stored. The code itself is shown once and cannot be recovered.
* **Single use**, **expires after 48 hours**, and is cancelled when a newer code is created or the space fills.
* Wrong, malformed, used, revoked and expired codes all return the same answer, so a guess reveals nothing.
* Redemption is rate limited: 5 failed attempts per person per 15 minutes (the attempt log is written before
  the function returns, so failures are really counted).
* A space holds **two people at most**. This is enforced by a trigger on the table too, not only in the function,
  and one person can belong to one space at a time.
* If you already have answers saved to your account when you join, they move into the shared space **as private**.
  Nothing is shared as a side effect of pairing.

## Realtime

Only two tables are published to Supabase Realtime, and neither contains answer text:
`answer_signals` ("something changed in your space", ids only) and `relationship_members` ("someone joined or left").
`answers` itself is deliberately **not** published. If Realtime is off or the socket drops, the game refetches on a timer,
when the tab regains focus and when the browser comes back online.

## What is not protected (be honest with the people who use this)

* **Whoever runs the Supabase project can read the database**, including private answers (dashboard, service role).
  "Private" means private from the other player and from every other account, not end-to-end encrypted.
* An invitation code works for anyone who has it and an account until it expires or is used. Treat it like a password and
  send it privately.
* A shared answer can be read by your partner the moment you submit it; making it private later does not un-see it.
* Your **display name and chosen character** are visible to your partner.
* Sign-in rate limiting, email confirmation and password rules are Supabase Auth settings, not part of these migrations
  (see the README checklist). Deleting a *sign-in* (the email address) needs the project owner in
  Authentication, Users; `delete_my_data()` removes everything else.
* Answers stored "only on this device" are in the browser's `localStorage`, readable by anyone who can use that browser profile.

## How it is tested, and what that does not prove

`tests/rls.test.js` applies the real migration files, in order, to a real PostgreSQL engine (PGlite) with a small emulation of
Supabase's roles, `auth.uid()` and default privileges (`tests/helpers/db.js`). It then acts as several different users, through
the same roles the browser uses: a private answer or draft is invisible to the partner; a partner cannot edit, delete or re-point
your answers; a third account sees nothing of a pair's space and cannot join a full one; expired, reused, revoked and wrong
codes are indistinguishable; guessing is rate limited; anonymous callers have no access; every table has Row Level Security and
every `SECURITY DEFINER` function pins its `search_path`; and the migrations can be re-run safely.

It does **not** prove that a hosted Supabase project behaves identically (Auth emails, PostgREST, Realtime delivery,
dashboard defaults). Run the manual checklist in `docs/MANUAL_TEST_CHECKLIST.md` against your real project once after setup.
