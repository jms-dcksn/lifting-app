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

## Phase 1 — Auth + shell + PWA (~3 hrs)

- [ ] `middleware.ts` — refresh Supabase session on every request
- [ ] `src/app/login/page.tsx` — magic-link form
- [ ] `src/app/auth/callback/route.ts` — exchange code for a session
- [ ] Protected app group `src/app/(app)/layout.tsx` — redirect to `/login` if no user
- [ ] PWA: `src/app/manifest.ts`, icons, `theme-color`. Add-to-home-screen works.

## Phase 2 — Keystone: active-session screen (~9 hrs)

Build against a **hardcoded seed program** (a TS constant shaped like the program/day/slot
data) so logging is fully proven before the builder exists. Everything downstream depends on
this screen being right.

- [ ] `src/lib/strength/recompute.ts` — pure: rebuild `current_e1rm` (+ personal coefficient
      for calibrated machines) for one user/exercise from its `set_log` rows. Verify with tsx.
- [ ] `src/lib/strength/progression.ts` — pure double-progression engine. Given a slot + its
      last logged performance, return the session target (weight + reps): first working set hit
      `rep_max` → add `exercise.increment`, reset reps to `rep_min`; else hold weight, target
      +1 rep toward `rep_max`. No prior performance → e1RM handoff via `recommend()` at `rep_min`.
      Keys on `(program_slot_id, exercise_id)`. Verify with tsx.
- [ ] Bodyweight e1RM convention in the engine: bodyweight/assisted log added load
      (negative = assisted); e1RM input is `bodyweight + added`. Pull bodyweight from `profile`.
- [ ] `src/app/(app)/session/actions.ts`:
  - [ ] `startNextSession()` — derive next (week, day) from completed sessions of the active
        program, insert `workout_session`, return it with the day's slots
  - [ ] `logSet({ sessionId, programSlotId, exerciseId, weight, reps, rir })` — compute e1RM,
        insert `set_log`, upsert `user_exercise_stat` via recompute
  - [ ] `editSet` / `deleteSet` — mutate `set_log`, recompute affected stat
  - [ ] `finishSession(sessionId)` — mark finished, return summary
- [ ] `src/app/(app)/session/[id]/page.tsx` + components:
  - [ ] Slot cards: prescription (sets × rep-range @ RIR) + double-progression target from
        `progression.ts` (e.g. "Target: 50 × 5 · last: 45 × 8") + empty working-set list
  - [ ] Set logger: weight / reps / RIR via big-tap steppers + numeric keypad
  - [ ] Optimistic insert (`useOptimistic`) — row appears instantly, write in background, revert on error
  - [ ] Inline edit/delete a set
  - [ ] `navigator.wakeLock` on mount; release on finish/unmount
- [ ] Finish → summary (total working sets, top e1RM per lift)

## Phase 3 — Program builder + home (~7 hrs)

- [ ] `src/app/(app)/program/actions.ts`: `saveProgram`, `cloneProgram`, `setActiveProgram`
- [ ] `src/app/(app)/program/page.tsx` — builder:
  - [ ] Program: name, weeks (4–6), set active
  - [ ] Add/reorder named days
  - [ ] Per day: add/reorder slots (exercise picker + sets + rep range + RIR)
  - [ ] Clone an existing program to start a new block
- [ ] Exercise picker component (reused by builder + swap): search seeded `EXERCISES`, recent-first
- [ ] Replace the hardcoded seed program in P2 with the real active program
- [ ] `src/app/(app)/page.tsx` Home:
  - [ ] Block status line ("Week 2 of 5 · next: Pull") derived from completed sessions
  - [ ] **Start next workout** CTA; resume affordance if a session is in progress
  - [ ] Last finished session summary
- [ ] `src/app/(app)/settings/page.tsx` — edit `bodyweight` (minimal)

## Phase 4 — Progression view (~3 hrs)

- [ ] `src/app/(app)/history/[exerciseId]/page.tsx` — sets over time + e1RM line chart (Recharts)
- [ ] Overload signal: top working-set e1RM this session vs the previous session of that exact
      exercise — shown in history and in the finish-session summary

## Phase 5 — Recommendation + swap + calibration (~5 hrs)

Double-progression targets already render from P2. P5 adds the e1RM recommender's role —
starting/swap weights — and its confidence UI.

- [ ] Confidence badge on recommender-derived (starting/swap) weights: `high`/`medium` plain;
      `low` framed as a starting estimate; `calibrate` shows conservative number + first set
      labeled "feel it out". Recompute live as reps/RIR change.
- [ ] Swap a slot → exercise picker filtered to same pattern first → `recommend()` re-derives
      the starting weight; log sets against the swapped `exercise_id` + original
      `program_slot_id`; double progression resumes from there next session
- [ ] Machine calibration: after the first calibration set, recompute + persist the machine's
      personal coefficient; graduate it out of `calibrate`

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
