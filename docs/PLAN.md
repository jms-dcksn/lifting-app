# MVP Build Plan

> Follows `SPEC.md` (the behavior contract). This file is the phased build sequence.
> Reshaped 2026-05-30: the MVP now centers on a **thin program builder** — see SPEC for why.
> `docs/DECISIONS.md` holds architecture rationale.

Goal: run a real training block in the app. Build one week of a 3–5 day program, set it to
repeat 4–6 weeks, then have the app walk me through each session — log working sets with RIR,
get a recommended weight per slot, swap a movement if needed, see my e1RM trend and whether I
beat last time. Done = I use it for a real block.

> Next.js 16 has breaking changes from older versions. Before writing framework code in any
> phase, check `node_modules/next/dist/docs/` (see `AGENTS.md`).

## What exists

Committed:
- Next.js (App Router, TS, Tailwind) scaffold
- Strength engine: `e1rm.ts`, `coefficients.ts` (~38 Lifetime exercises), `recommend.ts` — typechecks, math sanity-checked
- Supabase clients (browser/server, `@supabase/ssr`) + base schema with RLS in `supabase/migrations/0001_init.sql`
- Architecture in `docs/DECISIONS.md`

On disk and applied to remote DB (not yet committed):
- `supabase/migrations/0002_program_builder.sql` — program/day/slot tables, `set_log.program_slot_id`, `profile.bodyweight`, RLS
- `supabase/migrations/0003_harden_signup_trigger.sql` — hardens the trigger that auto-creates a `profile` row on signup
- `src/lib/supabase/types.ts` — generated typed DB types (504 lines)

## Estimate

~32–38 hrs of focused work ≈ 3–4 weeks at 10 hrs/wk. First milestone to chase: log one real
session end-to-end against a hardcoded program (P0–P2). The program builder (P3) makes it
yours to run a full block; recommendation/swap (P5) is the differentiator.

## Testing approach

No test runner configured. The strength engine is pure — verify changes ad hoc with
`npx tsx --eval` importing from `src/lib/strength/` (see git history for the pattern). The new
`recompute` module (P2) is pure and should get the same treatment. UI is verified manually on
a phone (or Playwright MCP if useful). Don't add a runner unless a phase genuinely needs one.

---

## Phase 0 — Backend (blocking, ~2 hrs) — DONE except one item

- [x] Create Supabase project; put URL + anon key in `.env.local`
      (ref `jtcppebmosaffaajtgow`, ACTIVE_HEALTHY, us-east-2, created 2026-06-06)
- [x] Apply `0001_init.sql` (SQL editor or `supabase db push`)
- [x] Write + apply `supabase/migrations/0002_program_builder.sql`:
  - [x] `program`: add `weeks int`, `is_active boolean default false`
  - [x] `program_day` `(id, program_id, user_id, position, name)` + RLS (own rows)
  - [x] `program_slot` `(id, program_day_id, user_id, position, exercise_id text, pattern text, target_sets int, rep_min int, rep_max int, target_rir numeric)` + RLS
  - [x] `workout_session`: add `program_day_id uuid references program_day`
  - [x] `set_log`: add `program_slot_id uuid references program_slot` (nullable)
  - [x] `profile`: add `bodyweight numeric`
- [x] `supabase/migrations/0003_harden_signup_trigger.sql` — hardens the `profile` row
      auto-create trigger on signup (written and applied; not in original plan)
- [ ] Enable Auth provider: Email magic-link in Supabase Auth dashboard (manual step; not yet done)
- [x] Generate typed DB types → `src/lib/supabase/types.ts` (504 lines)

## Phase 1 — Auth + shell + PWA (~3 hrs) — DONE

- [x] `src/proxy.ts` — refresh Supabase session on every request via `updateSession()` (Next.js 16: `middleware.ts` renamed to `proxy.ts`)
- [x] `src/lib/supabase/middleware.ts` — `updateSession(request)` helper: cookie wiring + `getClaims()` token refresh
- [x] `src/app/login/page.tsx` — magic-link form
- [x] `src/app/auth/callback/route.ts` — exchange code for a session
- [x] Protected app group `src/app/(app)/layout.tsx` — redirect to `/login` if no user
- [x] PWA: `src/app/manifest.ts`, icons (`icon.svg`, `apple-icon.tsx`), `theme-color #000`. Add-to-home-screen works.

## Phase 2 — Keystone: active-session screen (~9 hrs) — DONE

Build against a **hardcoded seed program** (a TS constant shaped like the program/day/slot
data) so logging is fully proven before the builder exists. Everything downstream depends on
this screen being right.

- [x] `src/lib/strength/recompute.ts` — pure: rebuild `current_e1rm` from `set_log` rows.
      `recomputeStat(def, sets, bodyweight)` returns `currentE1rm` (max e1RM across working sets).
      `effectiveLoad(def, weight, bodyweight)` implements the bodyweight/assisted convention.
      Personal-coefficient recompute is deferred to P5 (machine calibration layer); `logSet`
      preserves any existing `personal_coefficient`/`coeff_confidence_n` untouched. Verified with tsx.
- [x] `src/lib/strength/progression.ts` — pure double-progression engine. `sessionTarget(def,
      slot, last, defs, stats)`: no prior → e1RM recommender at `rep_min` (source "recommendation",
      carries confidence); has prior → first-set reps >= `rep_max` bumps weight by `def.increment`
      and resets to `rep_min`, else holds weight and targets +1 rep (source "progression"). Bump
      test is reps-only. Keys on `(program_slot_id, exercise_id)`. Verified with tsx.
- [x] Bodyweight e1RM convention in the engine: `effectiveLoad` adds bodyweight for BW exercises,
      subtracts assist for assisted. `logSet` reads bodyweight from `profile`.
- [x] `src/app/(app)/session/seed.ts` — hardcoded `SEED_PROGRAM` (3-day Push/Pull/Legs, 5 weeks)
      shaped like program/day/slot data. P3 replaces with real active program.
- [x] `src/app/(app)/session/actions.ts`:
  - [x] `startNextSession()` — derives next week/day from count of finished sessions, inserts
        `workout_session`, redirects to `/session/[id]`
  - [x] `logSet({ sessionId, programSlotId, exerciseId, weight, reps, rir })` — computes e1RM,
        inserts `set_log`, upserts `user_exercise_stat` via recompute
  - [x] `editSet` / `deleteSet` — mutate `set_log`, recompute affected stat
  - [x] `finishSession(sessionId)` — sets `finished_at`, returns summary (total working sets +
        top e1RM per lift)
- [x] `src/app/(app)/session/[id]/page.tsx` — Server Component: derives seed day from finished
      session count, loads bodyweight/stats/sets/last-performance, computes each slot's target,
      renders client screen.
- [x] `src/app/(app)/session/[id]/active-session.tsx` — client keystone screen:
  - [x] Slot cards: prescription + double-progression/recommendation target line + working-set list
  - [x] Set logger: weight / reps / RIR via big-tap steppers + numeric keypad
  - [x] Optimistic insert (`useOptimistic`) — row appears instantly, revert on error
  - [x] Inline edit/delete a set
  - [x] `navigator.wakeLock` on mount; re-acquired on `visibilitychange`; released on finish/unmount
- [x] Finish → summary (total working sets, top e1RM per lift)
- [x] `supabase/migrations/0004_session_finished_at.sql` — adds nullable `finished_at timestamptz`
      to `workout_session`; applied to remote DB
- [x] `src/app/(app)/page.tsx` — home shows block status line + "Start next workout" button
      (P2 scaffold; P3 replaces with real active program)
- [x] `src/lib/supabase/client.ts` and `server.ts` — typed with `Database` generic
- [x] `src/lib/supabase/types.ts` — regenerated (includes `finished_at`)
- Verified: `npx tsc --noEmit` clean, `npm run build` clean, `npm run lint` clean

## Phase 3 — Program builder + home (~7 hrs) — DONE

- [x] `src/app/(app)/program/actions.ts`: `saveProgram`, `cloneProgram`, `setActiveProgram`
      (plus `createFromTemplate` — onboarding shortcut seeding the PPL template)
- [x] `src/app/(app)/program/page.tsx` — builder (`program-builder.tsx` client):
  - [x] Program: name, weeks (4–6), set active (save always makes the program active)
  - [x] Add/reorder named days (↑/↓ reorder; no drag)
  - [x] Per day: add/reorder slots (exercise picker + sets + rep range + RIR)
  - [x] Clone an existing program to start a new block (`program-list.tsx` saved-programs list)
- [x] Exercise picker component (`exercise-picker.tsx`, reused by builder + swap): search seeded
      `EXERCISES`, recent-first
- [x] Replace the hardcoded seed program in P2 with the real active program (`src/lib/program.ts`
      shared loader; `seed.ts` repurposed as the `createFromTemplate` source)
- [x] `src/app/(app)/page.tsx` Home:
  - [x] Block status line ("Week 2 of 5 · next: Pull") derived from completed sessions of the
        active program
  - [x] **Start next workout** CTA; resume affordance if a session is in progress
  - [x] Last finished session summary
- [x] `src/app/(app)/settings/page.tsx` — edit `bodyweight` (minimal)
- [x] Progression last-performance now keys on `program_slot_id` (real slot ids, preserved
      across builder edits); `logSet` writes the real `program_slot_id`
- Verified: `npx tsc --noEmit` clean, `npm run build` clean, `npm run lint` clean

## Phase 4 — Progression view (~3 hrs) — DONE

- [x] `src/app/(app)/history/[exerciseId]/page.tsx` — sets over time + e1RM line chart (Recharts)
- [x] Overload signal: top working-set e1RM this session vs the previous session of that exact
      exercise — shown in history and in the finish-session summary

## Phase 5 — Recommendation + swap + calibration (~5 hrs) — DONE

Double-progression targets already render from P2. P5 adds the e1RM recommender's role —
starting/swap weights — and its confidence UI.

- [x] Confidence badge on recommender-derived (starting/swap) weights: `high`/`medium` plain;
      `low` framed as a starting estimate; `calibrate` shows conservative number + first set
      labeled "feel it out". Recompute live as reps/RIR change (`startingWeight()` extracted
      from `sessionTarget()`; targets now compute client-side off hydrated stats).
- [x] Swap a slot → exercise picker filtered to same pattern first (show-all escape hatch) →
      `recommend()` re-derives the starting weight; log sets against the swapped `exercise_id`
      + original `program_slot_id`; double progression resumes from there next session
      (last-performance map is now `(slot, exercise)`-keyed; in-session swap survives reload
      via the slot's last logged exercise)
- [x] Machine calibration: after the first calibration set, recompute + persist the machine's
      personal coefficient (`e1RM / pattern strength from other variants`, anchored on the
      first session, re-anchored while only one session exists); `coeff_confidence_n` =
      distinct session count; graduates out of `calibrate` via `recommend()`'s direct-history
      branch
- Verified: `npx tsc --noEmit`, `npm run lint`, `npm run build` clean; tsx sanity checks for
  `startingWeight` parity/monotonicity, bodyweight conversion, and calibration anchor math

---

## Phase 6 — UX foundation: audit + design system + core components (~6 hrs)

The MVP is functionally complete but visually a scaffold: default zinc utilities, zero
motion, ad-hoc spacing, and a typography bug (`globals.css` sets `body { font-family:
Arial }`, overriding the Geist fonts loaded in `layout.tsx` — they never render). This
phase establishes the design system the polish pass (P7) builds on. Aim: world-class feel
with a near-monochrome black/white palette — restraint is the aesthetic.

**Design principles (the contract for P6 + P7):**
- Palette stays black/white/zinc. Color is *semantic only*: overload green/red,
  calibration amber. Nothing decorative gets color.
- Motion is 150–250 ms, ease-out, `transform`/`opacity` only (compositor-friendly);
  every animation honors `prefers-reduced-motion`. Prefer CSS transitions +
  `@starting-style` entry animations over a JS animation library.
- Tap targets ≥ 44 px on anything used mid-set. Numbers always `tabular-nums`.
- Hierarchy from type scale, weight, and spacing — not from boxes and borders.

- [x] **Device audit (on phone, doubles as the outstanding P4/P5 device verification).**
      Walk every screen as a PWA: login → home → builder → picker → active session
      (log/edit/delete/swap/calibrate) → finish summary → history chart → settings.
      Screenshot each; list every friction point (tap-target misses, layout shifts,
      dead-feeling navigations, abrupt state changes). Output: a checklist in
      `docs/UX-AUDIT.md` that P7 burns down screen by screen.
      *(Done as an emulated 390×844 Playwright walk with a fresh test user;
      `docs/UX-AUDIT.md` written. On-phone re-walk + real-data P4/P5 verification
      remain — tagged **[device]** in the audit and folded into P7's final pass.)*
- [x] **Typography + tokens.** Fix the Arial override so Geist actually renders. Define
      the design tokens in `globals.css` `@theme`: type scale (display/heading/body/
      caption), spacing rhythm, radii (one card radius, one control radius), borders,
      semantic colors (overload-up/down, calibrate), motion durations/easings. Replace
      raw hex/zinc one-offs as they're touched — no big-bang rename.
- [x] **Core controls, rebuilt once, reused everywhere** (`src/components/ui/`):
  - [x] `Button` — primary/secondary/destructive/ghost; pressed-state scale + opacity
        transition; built-in pending state (spinner or label swap) wired to
        `useFormStatus`/`useTransition` so taps never feel ignored
        (`buttonClasses` lives in `button-styles.ts`, a non-client module, so Server
        Components can style `<Link>`s)
  - [x] `Stepper` — the most-touched control in the gym: ≥ 44 px hit areas,
        press-and-hold auto-repeat, value-change tick animation, strip native
        `type=number` spinners, select-all on focus; proper `aria-label`s on −/+
  - [x] Text inputs (login email, program/day names, search) — one consistent style:
        clear focus ring (`focus-visible`), correct `inputMode`/`autocomplete`/
        `enterKeyHint` per field
  - [x] Card — single shared surface treatment (radius, border, padding) replacing the
        five hand-rolled variants
- [x] **Sheet/overlay primitive.** `ExercisePicker` currently hard-cuts to a full-screen
      div. Rebuild as a bottom sheet that slides up with a scrim, traps focus, closes on
      scrim tap/Escape/swipe-down. This is the only overlay in the app — one primitive,
      no dialog library. *(Native `<dialog>` + `@starting-style`; picking dismisses with
      the exit animation too.)*
- [x] **Focus + a11y baseline.** Visible `focus-visible` rings everywhere, `aria-label`s
      on icon-ish buttons, check zinc-400-on-white contrast for text that carries meaning
      (target lines, badges) and darken where it fails.
- Verify: `npx tsc --noEmit`, `npm run lint`, `npm run build` clean; controls exercised
  on a real phone, not just desktop devtools. *(tsc/lint/build clean; controls exercised
  in the emulated walk — real-phone pass folded into P7.)*

## Phase 7 — Screen-by-screen polish + motion + mobile ergonomics (~8 hrs)

Burn down the P6 audit list using the P6 system. Order follows time-in-screen: the active
session is where the app lives or dies.

- [x] **Active session (the keystone, most of the budget):**
  - [x] Slot cards show workout progress at a glance: sets-done vs target per slot
        (filled `ProgressDots`), completed slots recede and the current slot reads as
        *current* via `Card` `tone` (active/done) — hierarchy, not color
  - [x] Logged-set rows animate in (`animate-row-in`) and out on delete (`data-exiting`
        → `row-out`, commit after); failed optimistic writes now surface a per-card error
        instead of silently vanishing
  - [x] Promoted **swap** from a caption text link to a real `secondary` `Button` on the card
  - [x] Target line rebuilt: weight × reps in heading weight; calibrate/low read as their
        own instruction lines; stale "Start:" suppressed once sets are logged this session
  - [x] Sticky finish bar: `sticky bottom-0` + `env(safe-area-inset-bottom)` padding,
        replacing the `pb-28` magic number
  - [x] Finish → summary lands as a moment: staggered `animate-rise` entry on header,
        card, each top-e1RM row, and the Done button
- [x] **Home:** Start/Resume CTA keeps the most visual weight; block status now a
      `BlockProgress` bar + "x of y sessions"; last-session card already on shared Card
- [x] **Program builder:** day/slot reorder animates physically via the View Transitions
      API (`withViewTransition` + `viewTransitionName`); add-slot/add-day affordances
      promoted to foreground weight; NumField/controls bumped toward 44 px; save bar safe-area
- [x] **Exercise picker:** pattern filter is now visible `Chip`s (pattern vs all); recents
      grouped under their own sticky section header, with "All exercises" below
- [x] **History:** chart restyled to the monochrome system (faint grid, muted axes, smaller
      dots, token-colored tooltip); overload badge matches the summary's signed-delta
      treatment; one-session empty state added
- [x] **Login:** sent state rebuilt as an affirmative card (check mark, "Check your email",
      "use a different email" reset) so it no longer scans as an error
- [x] **Navigation feel:** `loading.tsx` skeletons for the (app) group, session, and history;
      header nav links get active states (`NavLinks`, `usePathname`); reorder uses View
      Transitions where free
- [ ] **Final pass:** re-walk the P6 audit checklist on device — folded into the post-P7
      on-phone walk with James's real account + first Vercel deploy (audit `[device]` items)
- [x] Verify: build/lint/typecheck clean. *(Full on-phone workout + dual-scheme review are
      the deferred `[device]` pass above.)*

### Explicitly NOT in P6/P7 (resist)
- No component library (shadcn/Radix) — the app has one overlay and five controls;
  hand-rolled stays smaller and teaches more
- No JS animation library unless CSS provably can't do a specific interaction
- No color system expansion, theming/toggle, or brand/logo work
- No new features hiding inside "polish" (rest timers, plate calculator — still out)
- No desktop layout work beyond not-broken — this is a phone app

---

## Phase 8 — Analytics hub: cross-workout performance screen (~6 hrs)

The MVP is UX-complete but progress is only legible one exercise at a time, reachable
by tapping a lift in the last session. This phase adds a dedicated **Analytics** screen
(new top-level nav destination) that reads performance *broadly* across the whole training
history, then funnels into the existing per-exercise drill-down. Everything is derivable
from `set_log` + `workout_session` — **no schema change**.

**Reuse, don't reinvent:**
- Tonnage must use `effectiveLoad(def, weight, bodyweight)` from `recompute.ts` for the
  bodyweight/assisted convention — and **exclude** sets where it returns `null` (BW with
  unknown bodyweight), never coerce to 0.
- e1RM values are already cached per set (`set_log.e1rm`); PRs are computed chronologically,
  no recompute needed. Working sets only (`is_warmup = false`), as everywhere else.
- The per-exercise drill-down is the **existing** `history/[exerciseId]` route — this phase
  links into it from the new exercise list rather than building a second chart.

- [x] `src/lib/analytics.ts` — pure server-side aggregation helpers over fetched rows
      (keep them framework-free + ad-hoc testable with tsx, like the strength engine):
  - [x] `sessionTonnage(rows, defs, bodyweight)` → per-session total volume
        (`Σ effectiveLoad × reps`), in `performed_at` order
  - [x] `e1rmPrFeed(rows)` → chronological list of e1RM records broken (a set whose e1RM
        exceeds all prior e1RM for that `exercise_id`): `{ date, exerciseId, e1rm, delta }`
  - [x] `weightPrs(rows)` → per-exercise heaviest working weight ever lifted (raw load PR,
        distinct from e1RM PR) + the date it was set
  - [x] `exerciseSummaries(rows)` → per-exercise roll-up for the selectable list: current
        e1RM, all-time best e1RM, last-performed date, session count, trend arrow
        (latest vs previous session e1RM — same signed-delta convention as the overload badge)
- [x] `src/app/(app)/analytics/page.tsx` — Server Component. One query: this user's working
      sets joined to `workout_session(performed_at, finished_at)`, plus `profile.bodyweight`.
      Sections, top to bottom (most-glanceable first):
  - [x] **Total volume by session** — bar/line of session tonnage over time (Recharts, reuse
        the monochrome chart styling from `e1rm-chart.tsx`); headline = this block's total +
        delta vs last session
  - [x] **e1RM progression highlights** — the top N lifts by recent e1RM gain (sparkline or
        signed-delta chips), each tappable → its history page
  - [x] **Records feed** — recent e1RM PRs and new max-weight PRs as a reverse-chronological
        list ("Bench press · new e1RM 218 lb · +4"); the motivating "what did I just beat" view
  - [x] **All exercises** — searchable list (reuse `ExercisePicker`'s search idiom) of every
        logged lift with its summary chip; tap → `history/[exerciseId]` drill-down
- [x] `src/app/(app)/analytics/loading.tsx` — Skeleton fallback (match the other route loaders)
- [x] Nav: add **Analytics** (or "Progress") to `NavLinks` (`(app)/nav-links.tsx`) with an
      active state; it becomes the hub the lone exercise-tap used to be the only door to
- [x] Empty / thin-data states: first session, single-session lifts (no trend yet), and BW
      lifts excluded from tonnage all read deliberately, not as bugs
- Verify: `npx tsc --noEmit`, `npm run lint`, `npm run build` clean; aggregation helpers
  sanity-checked with tsx (tonnage with a BW lift present, a PR chain, a single-session lift);
  real-phone walk with the production account remains part of the open post-P7/P8 device pass

> **Perf note (not a blocker):** single-user, full-history scans in JS are trivial now. If a
> long block ever makes the analytics query heavy, push the aggregation into a Postgres view
> or RPC — out of scope until measured.

## Phase 9 — Analytics depth: pattern balance + stalls + adherence (~4 hrs, stretch)

Optional follow-on. These are the analytics *this app* can show that a generic logger can't,
because it already models movement **patterns**, **RIR**, and a latent **pattern strength**.
Cherry-pick by value; none are load-bearing for "run a real block."

- [ ] **Volume by movement pattern** — working sets (and tonnage) per `pattern` per week.
      Surfaces push/pull/legs balance and neglected patterns; the app already thinks in
      patterns, so this is near-free and genuinely differentiated.
- [ ] **Hard sets per week** — count of working sets at low RIR (≤ 1–2) per pattern. The real
      hypertrophy-stimulus metric, and only possible because we log RIR. Arguably the single
      most useful chart here.
- [ ] **Pattern strength trend** — plot the recommender's latent pattern-strength e1RM
      (`recommend.ts`) over time per pattern: progress *pooled across every variant*, the
      thing no per-exercise chart shows. Strongest first-principles story for a writeup.
- [ ] **Stalled-lift detector** — exercises whose e1RM hasn't risen in N sessions; actionable
      nudge (deload / swap / check recovery). Directly serves the progressive-overload thesis.
- [ ] **Adherence / consistency** — sessions completed vs the block's planned cadence
      (`finished_at` count vs program weeks × days), plus a simple streak. Behavior, not strength.
- [ ] **Rep-quality drift** — average RIR at a fixed load over time (are sets getting easier =
      hidden progress the weight number doesn't show). Nice-to-have.

> Pick 2–3 of these, not all six. "Volume by pattern" + "hard sets" + "pattern strength trend"
> is the highest-signal trio and the best material for the public first-principles writeup
> (per `goals.md`).

---

## Explicitly NOT in MVP (resist)
- Macro-periodization / auto-deload / wave loading (week-over-week overload is double
  progression only; prescription structure stays fixed across the block)
- Calendar-bound scheduling (days run in sequence)
- Multiple concurrent active programs (one `is_active`; others saved)
- Per-gym machine instances UI (`equipment_instance` exists but unused)
- Social, sharing, export, Apple Health, rest timers, plate calculator
- Offline (we assume connectivity), kg, warmup tracking, onboarding polish

## Sequencing notes
- Phases are strictly ordered; **P2 is the keystone** — building it against a hardcoded program
  de-risks logging before the builder exists. If time runs out, the app is already worth using
  after P4 (run a block, log, see e1RM trend). P5 is what makes it *mine*.
- Validation: no history to import (starting cold). After a few weeks of real logging,
  sanity-check observed cross-variant e1RM ratios against the coefficient priors; adjust then.

## Settled decisions
See the decision table in `SPEC.md`. Defaults: lb only, 5 lb steps, RIR 0–5, Recharts,
double progression (reps then weight; bump on first set hitting `rep_max`, jump by per-exercise
increment), working sets only, bodyweight included, just-me-first.
