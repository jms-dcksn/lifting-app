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

## Coach loop — prescription correctness (#4)

- [x] Add Strong Foundations, a shared 12-week women's glute/leg template with three
      time-budgeted sessions, phase-based effort/recovery, and equipment/progression guidance.

- [x] Add reusable program phases, generated DB types, a pure prescription resolver, and
      boundary/rounding/validation tests.
- [x] Resolve the active workout from its stored week and use effective sets/RIR throughout.
- [x] Seed, display, edit, save, and clone weekly phases; close issue #4.

## Coach loop — minimal session feedback (#5)

- [x] Capture optional readiness (1–5) before the first working set.
- [x] Capture optional joint pain and a 280-character note when finishing; allow later edits.
- [x] Persist feedback on the RLS-protected workout session with database constraints and
      generated types.
- [x] Include feedback in the weekly Coach check-in and elevate significant pain without
      diagnosing it.
- [x] Add pure validation/export coverage and a pgTAP ownership test.

## Coach loop — bodyweight history (#6)

- [x] Add date-keyed bodyweight observations with deterministic same-date replacement.
- [x] Show the latest reading, sparse-data seven-day average, prior-week change, and recent history.
- [x] Support editing and removing individual observations; encourage three morning readings weekly.
- [x] Preserve `profile.bodyweight` as the no-history baseline while all live strength calculations
      prefer the latest dated observation.
- [x] Include current average and prior-seven-day change in the Coach check-in export.
- [x] Add generated types, pure trend coverage, database constraints, and a pgTAP ownership test.

## Coach loop — canonical coach report (#7)

- [x] Define a versioned, privacy-safe `CoachCheckInReport` built by pure aggregation.
- [x] Derive the Progress snapshot and clipboard text from the same report.
- [x] Report explicit current/prior windows, adherence, duration, prescriptions, set/RIR
      execution, fixed-load progress, stable exercise trends, and specialization volume.
- [x] Surface thin or imperfect data rather than silently inventing values.
- [x] Cover window boundaries, substitutions, deloads, missing RIR, thin data, trend stability,
      and prior-window comparisons with unit tests.

## Coach loop — reviewable recommendations (#8)

- [x] Generate deterministic next-step proposals from finished, slot-linked exposures.
- [x] Delegate ordinary load/rep targets to `sessionTarget()` and plateau calls to the existing
      hysteresis detector rather than introducing competing progression rules.
- [x] Suppress overload during deloads and after significant pain; require repeated RIR misses
      before proposing a load reduction and keep a movement after one isolated regression.
- [x] Include action, rationale, evidence window, and explicit confidence/data sufficiency.
- [x] Render recommendations in the Coach check-in, include them in the clipboard export, and
      persist accept/dismiss/seven-day-defer decisions without mutating the program.
- [x] Protect decision state with ownership RLS, database constraints, and pgTAP coverage.
- [x] Cover progress, flat performance, regression, RIR misses, plateau, deload, pain, and thin
      data with pure tests.
- [x] Share progression across repeated weekly uses of the exact exercise: advance each slot from
      the best first set logged since that slot's previous exposure, show last-here and best-recent
      context, and let first-set—not back-off-set—RIR drive effort reductions.

## Coach loop — quality-of-life follow-up

- [x] Add one-tap acceptance for all actionable, currently visible Coach proposals.
- [x] Hide accepted and insufficient-data next steps; collapse the pending section and per-item explanations.
- [x] Preview the next workout's exercises and effective weekly prescriptions on Home.

## Current code baseline (2026-09-18)

Program building, classic phases, Fluid adaptations, scoped swaps, pre-workout planning,
workout records, Coach reports/API/proposals, weight calendar/trends, monthly review, the
Lift/Track/Program/You tab shell, cinematic recap, and Track compounds/pins are implemented.
See [Features](FEATURES.md). Migrations and generated types are committed; remote
migration/Auth state needs a live check. The numbered phase sections below retain the
original build sequence and historical checks.

## Original estimate

~32–38 hrs of focused work ≈ 3–4 weeks at 10 hrs/wk. First milestone to chase: log one real
session end-to-end against a hardcoded program (P0–P2). The program builder (P3) makes it
yours to run a full block; recommendation/swap (P5) is the differentiator.

## Testing approach

Vitest covers framework-free modules under `src/lib/`; Supabase ownership behavior lives in
SQL regression scripts under `supabase/tests/`. Every shipped slice runs lint, TypeScript, unit tests, and a
production build. UI is also verified manually on a phone or browser when authenticated state
is available.

---

## Shared Kino Goddess template

- [x] Publish the DB-authored Phase 1 block as an eight-week, three-day built-in template.
- [x] Replace private custom exercise references with shared catalog entries and generic machines.
- [x] Preserve exercise order, working sets, rep ranges, RIR, and rest periods for new copies.

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
- [ ] Enable Auth provider: Email magic-link in Supabase Auth dashboard (historical unchecked item; verify the target environment before deployment)
- [x] Generate typed DB types → `src/lib/supabase/types.ts`

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
      subtracts assist for assisted. `logSet` now reads bodyweight via `getCurrentBodyweight()` (history, then profile fallback).
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
  - [x] Clone an existing program to start a new block (originally `program-list.tsx`'s
        saved-programs list; superseded by the program gallery, see Phase A in DECISIONS.md)
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

- [x] **Volume by movement pattern** — working sets (and tonnage) per `pattern` per week.
      Surfaces push/pull/legs balance and neglected patterns; the app already thinks in
      patterns, so this is near-free and genuinely differentiated.
- [x] **Hard sets per week** — count of working sets at low RIR (≤ 1–2) per pattern. The real
      hypertrophy-stimulus metric, and only possible because we log RIR. Arguably the single
      most useful chart here.
- [x] **Pattern strength trend** — plot the recommender's latent pattern-strength e1RM
      (`recommend.ts`) over time per pattern: progress *pooled across every variant*, the
      thing no per-exercise chart shows. Strongest first-principles story for a writeup.
- [ ] **Stalled-lift detector** — exercises whose e1RM hasn't risen in N sessions; actionable
      nudge (deload / swap / check recovery). Directly serves the progressive-overload thesis.
- [ ] **Adherence / consistency** — weekly completed-vs-planned sessions now ships in the
      Coach check-in export; block-wide cadence and a streak remain unbuilt.
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
- Social, sharing, export, Apple Health, plate calculator
- Offline (we assume connectivity), kg, warmup tracking, onboarding polish

> Rest timers were on this list and are no longer out of scope — built as Phase B
> (`docs/superpowers/specs/2026-06-20-program-gallery-tags-rest-timer-design.md`), see
> `docs/DECISIONS.md` "Phase B decisions". This list otherwise still holds.

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

## In-workout lift history

- [x] Add an on-demand History sheet to each active exercise, including unresolved machine templates.
- [x] Show the latest 10 logged sets across the exercise's linked machine variants, excluding the active workout.
- [x] Display machine, date, weight, reps, and RIR with scroll, loading, empty, and retry states.
- [x] Cover exercise-family isolation, user scoping, current-session exclusion, deterministic ordering, and limit.

## Scoped exercise substitutions

- [x] Offer workout-only or remainder-of-program scope after selecting a replacement.
- [x] Persist choices before logging; update only the matching program-day slot for program scope.
- [x] Preserve logged sets, show their original exercise after a mid-workout swap, and support fluid programs.
- [x] Verify database ownership, finished-session rejection, scope isolation, and adaptive prescription handling.

## Pre-workout planning

- [x] Make the Home preview a link to a full-page workout planner.
- [x] Show effective prescriptions, rest times, and phase details before starting.
- [x] Reuse machine selection/exercise swaps and retain workout-only choices across reloads.
- [x] Carry choices into either Start entry point without starting the timer during planning.
- [x] Verify stale/user/workout isolation, reset, failed saves/starts, and existing-session resume.

## Workout achievements (#24–#26)

- [x] Detect fixed-load rep PRs and canonical e1RM records with exact exercise/equipment scope.
- [x] Show persistent, compact pills after successful saves and on resume.
- [x] Consolidate both types in a completion recap with pre-workout deltas and quiet first entries.
- [x] Preserve historical comparisons after later workouts and recalculate edits/deletions.
- [x] Verify eligibility, bodyweight/assistance, precision, pagination, save failures, and summary reuse.

## Cinematic workout recap (#94)

- [x] Finish recap uses a record-count hero (`N PRs`, or the two-part count when mixing
      rep and e1RM) and compact per-exercise lines in `--record` gold.
- [x] A workout with no records still completes with `{dayName} done` plus working-set
      count, without gold or invented records.
- [x] Drop the top-e1RM table from the recap hero; keep history links on record rows.
- [x] Put joint pain / session notes behind a details control, not in the hero.
- [x] Reopened sessions show editable cards with Home and View recap; the recap is a
      dedicated `/session/{id}/recap` route. No schema or record-rule changes.
- [x] Existing workout-records / recap action tests stay green; recap copy helpers
      and a focused recap render case cover mixed vs single-kind headlines.

## Progress epic #27 — increment 1: weight calendar (#28)

- [x] Shared month calendar and weight Sheet on Home, Progress, and Settings.
- [x] Range-scoped history, month jumping, accessible day markers and keyboard navigation.
- [x] Strict Chicago/date-only validation, explicit conflicts, atomic corrections/replacements.
- [x] Refresh Home, Settings, Progress, workout preview, and active sessions after mutations.
- [x] Focused action/date tests and rollback-only database ownership/replacement tests.
- [ ] User reviews the branch's Vercel preview before merging or starting #29.

## Progress epic #27 — increment 2: weight trends (#29)

- [x] Prior weight-calendar slice merged in PR #34; next-slice work authorized.
- [x] Raw readings, canonical rolling means, goal distance/reference, four ranges.
- [x] Complete owner-scoped paginated history, lookback, sparse/gap/stale states.
- [x] Calendar editing from dots/table, accessible values and optional weekly bars.
- [x] Pure math/pagination tests, typecheck, lint, production build.
- [ ] Authenticated mobile review on Vercel (local browser access blocked).
- [ ] Review/merge this slice before proceeding to monthly metrics (#30).

## Progress epic #27 — increment 3a: monthly records foundation (#30)

- [x] Weight trends merged in PR #35; next slice authorized.
- [x] Typed, pure monthly windows, recap-reconciled records and stored e1RM comparisons.
- [x] Owner-scoped keyset pagination with complete historical baselines.
- [x] Authenticated month-review preview, exact windows, supporting workout links.
- [x] Boundary, identity, edit, historical-bodyweight and pagination regression tests.
- [x] Reconcile Coach/Fluid context-aware stall contract to finish #30.
- [ ] Authenticated mobile preview review; full dashboard remains #31.

## Progress epic #27 — increment 3b: shared stall evidence (#30)

- [x] Shared completed-session, exact-equipment, phase/adaptation-aware stall contract.
- [x] Fixed-load rep gains, default/explicit patience, deload and swap resets.
- [x] Monthly, Coach and Fluid integration with owner-scoped paginated context reads.
- [x] Monthly supported-signal card with evidence links; edit/delete/finish invalidation.
- [x] Regression tests, lint, typecheck and production build.
- [ ] User's authenticated preview review; next implementation issue is #31.


## Progress epic #27 — increment 4: monthly dashboard (#31)

- [x] Ranked improvements, compact totals, exact-exercise grouped achievements and all-lifts disclosure.
- [x] Canonical fixed-load monthly rep gains remain visible when e1RM is flat.
- [x] Session sparklines with non-color period cues and accessible supporting values.
- [x] Monthly/exact-equipment history route context and selected-month return navigation.
- [x] Integrated selected-month weight chart, goal context and edit invalidation.
- [x] Current stall links to existing Coach next steps filtered by exercise.
- [x] Pure and server-rendered regression checks, lint, typecheck and production build.
- [ ] User reviews #31 on Vercel before merge. #32 design and #33 implementation remain deferred.
