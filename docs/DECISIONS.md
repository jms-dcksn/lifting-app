# Architecture Decisions

A personal progressive-overload lifting app. Priorities: progressive overload, proper
technique, foundational movements. Core feature: swap exercises and get a recommended
weight for any exercise based on logged history of similar movements.

## Stack

- **Next.js (App Router, Server Actions)** — mobile web app, accessed via browser.
- **Supabase** — Postgres + Auth + RLS. Zero-ops.
- **Auth**: Supabase Auth, email magic-link only (Google OAuth deferred post-MVP). RLS keys off `auth.uid()`.
- **PWA manifest** — home-screen install, wake-lock, optimistic logging. (Not offline.)
- **Recommender runs client-side** (pure TS, bundled coefficient table). No Python service.
- **Deploy**: Vercel.

Assumes internet during workouts, so no offline/local-first layer (deleted ~40% of the
original complexity). No Fly.io, Docker, or sync engine.

## Core algorithm (three layers)

1. **Normalize every set to e1RM** via an RPE/RIR load table (RPE = 10 - RIR), not a bare
   1RM formula. Progressive overload = e1RM trending up. See `src/lib/strength/e1rm.ts`.
2. **Cross-exercise via latent pattern strength + coefficients.** One strength number per
   movement pattern (in reference-lift e1RM units); each exercise has a coefficient vs that
   reference. `predicted_e1RM = pattern_strength * coefficient`. See `recommend.ts`.
3. **Personalize coefficients** by Bayesian shrinkage from population prior toward each
   user's observed ratios.

## Machines

Cannot predict absolute machine loads from free weights (arbitrary leverage/pin/stack
units). So machines are flagged `needsCalibration`: the first session is a calibration set
(conservative guess), and one data point anchors everything after. Machine identity is
ideally machine-at-a-gym (`equipment_instance`) since brand loading differs.

Gym context: Lifetime — barbell, dumbbell (to ~120lb), cables, plus Hammer Strength
(plate-loaded ISO-lateral), Life Fitness / Hoist (selectorized pin), Technogym (selectorized).

## Data model

`set_log` is the source of truth; `user_exercise_stat` is a rebuildable cache. Program
slots reference movement patterns, so "swap exercise" is a first-class operation. Seeded
exercise catalog lives in `coefficients.ts` (app code); the `exercise` table holds only
user-custom additions. Schema across four migrations: `0001_init.sql` (base), `0002_program_builder.sql`
(program/day/slot, `profile.bodyweight`, `set_log.program_slot_id`), `0003_harden_signup_trigger.sql`
(signup trigger hardening), `0004_session_finished_at.sql` (adds nullable `finished_at
timestamptz` to `workout_session`). Typed DB types at `src/lib/supabase/types.ts`.

## Phase 2 decisions

**`finished_at` on `workout_session`.** Added in `0004_session_finished_at.sql`. The original
schema had no completion flag, which `finishSession` and "count completed sessions" (block
position derivation) both require. Nullable so in-progress and abandoned sessions are
distinguishable from completed ones.

**`current_e1rm` = max e1RM across working sets.** `recomputeStat` selects the maximum e1RM
from all logged working sets, not the first-set value or a session average. This represents
demonstrated current strength. Per-session overload deltas (progress visualization) are
computed live from `set_log` in Phase 4 (history page, finish-session summary) and are not
stored in `user_exercise_stat`.

**Block position (week/day) is fully derived, not stored.** Day and week are derived from the
count of finished sessions with matching `program_id`, not stored on the session row. Seed
sessions from Phase 2 have `program_slot_id = null`; from Phase 3 onward all sessions carry
a real `program_slot_id` and progression keys on that column.

**Machine personal-coefficient recompute was deferred to Phase 5** (now shipped — see Phase 5
decisions below). At the time, `recomputeStat` returned only `currentE1rm`; `logSet` preserved
any existing `personal_coefficient` and `coeff_confidence_n` untouched.

## Phase 3 decisions

**Builder save is id-preserving, not a full replace.** `saveProgram` upserts day/slot rows
by their existing ids and deletes only rows that are no longer present, rather than
dropping and recreating the program. This preserves `set_log.program_slot_id` continuity
when users edit an in-use program. Client generates uuids for new rows; positions are
re-derived from array order on save.

**Single active program enforced by a partial unique index.** `program_one_active_per_user`
is a partial unique index on `(user_id) WHERE is_active`. Saving any program unconditionally
activates it (clears the old active flag first). `cloneProgram` creates an inactive draft.

**`session/seed.ts` demoted to template-only.** The hardcoded Push/Pull/Legs seed no longer
drives the runtime program. It is called only by `createFromTemplate` (onboarding shortcut).
All runtime program data comes from the `program`/`program_day`/`program_slot` tables via
`src/lib/program.ts`.

**Progression "last performance" keys on `program_slot_id`.** From Phase 3 onward,
the double-progression engine looks up prior sets by `program_slot_id`, not `exercise_id`.
This correctly handles the case where the same exercise appears in multiple slots with
different rep targets.

## Phase 4 decisions

**Overload delta is computed live, keyed on `exercise_id` (not `program_slot_id`).**
Both the per-exercise history page and the finish-session summary compare the latest
session's best e1RM for an exercise against the best e1RM from that exercise's most
recent *earlier* session, found via `set_log` joined to `workout_session.performed_at`
(`workout_session!inner(performed_at)`). This is intentionally `exercise_id`-keyed, unlike
progression's `program_slot_id` lookup: the overload signal is "is this exercise getting
stronger over time" regardless of which slot/program it was logged under, including
across a swap.

**`finishSession` now verifies session ownership via a select before updating.** Needed to
read `performed_at` for the overload-delta query anyway, so the existing
`.eq("user_id", userId)` filter on the update was replaced by an explicit
ownership-checked select (throws `"Session not found"` if missing/not owned) followed by
an unfiltered-by-user update scoped by `id` + `is("finished_at", null)`.

**Charts: Recharts, client component, no server-side rendering of chart data.** The
history page (`src/app/(app)/history/[exerciseId]/page.tsx`) is a Server Component that
fetches and groups sets by session; the line chart itself
(`e1rm-chart.tsx`) is a small `"use client"` wrapper around `recharts` `LineChart`. Matches
the SPEC.md default ("Charts: Recharts").

## Phase 5 decisions

**Session targets compute client-side; the server hydrates state, not targets.** The session
page no longer calls `sessionTarget()` server-side. It hydrates `ExerciseStat[]`,
`recentExerciseIds`, and a per-slot `lastByExercise` map; `active-session.tsx` derives each
slot's target via `useMemo`. This is what lets a swap re-derive the recommendation instantly
with no server round-trip.

**`startingWeight()` extracted from `sessionTarget()`'s no-prior branch.** Pure helper
`startingWeight(def, reps, targetRir, defs, stats, bodyweight)` wraps `recommend()` and the
bodyweight added-load conversion. `sessionTarget()` delegates to it for the "no prior
performance" case, and the UI also calls it directly to recompute the suggested weight live
as the user edits reps/RIR before the first set (the weight field follows reps/RIR until the
user manually touches weight).

**Progression "last performance" is now `(program_slot_id, exercise_id)`-keyed.** Previously
keyed on `program_slot_id` alone (Phase 3). A swapped exercise now resumes its own
progression chain within that slot, independent of whatever exercise the slot held before.
The session page's effective exercise-per-slot is derived from the most recently logged
exercise in that slot this session, so an in-session swap survives a page reload.

**Swap is same-pattern-first with a show-all escape hatch.** `ExercisePicker` gained
`patternFilter` (already plumbed for swap) plus a "show all patterns" toggle, since a same-
pattern substitute isn't always available or desired.

**Machine calibration: `personal_coefficient = currentE1rm / pattern strength estimated from
the user's other logged variants`,** computed in `recomputeAndUpsertStat`
(`session/actions.ts`) via `estimatePatternStrength`. It anchors on the first session with
working sets on that exercise, re-anchors while only one such session exists (so editing or
deleting that calibration session stays consistent), then holds fixed — later progress on the
machine moves the pattern-strength estimate, not the coefficient. `coeff_confidence_n` =
count of distinct sessions with working sets on that exercise, feeding the Bayesian shrinkage
in `recommend.ts`. If all sets for a calibration exercise are deleted, both fields reset
(`personal_coefficient = null`, `coeff_confidence_n = 0`) so the next first set recalibrates.
Graduation out of `calibrate` is not a separate code path — once the machine has its own
e1RM and confidence count, `recommend()`'s direct-history branch naturally returns
medium/high.

**Confidence badge wording: `low` → "starting estimate"** (was "estimate"), to read more
clearly as a recommender-driven starting point rather than a measurement.

## Build order

> Superseded by `SPEC.md`, which wins on conflicts. Current phase structure: P0 (backend, done),
> P1 (auth + PWA), P2 (keystone: active-session screen), P3 (program builder), P4 (progression
> view), P5 (recommendation + swap + calibration, done). See `docs/PLAN.md` for the sequence and status.
