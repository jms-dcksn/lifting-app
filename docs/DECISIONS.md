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
computed separately in Phase 4 and are not stored in `user_exercise_stat`.

**Block position (week/day) is fully derived, not stored.** Day and week are derived from the
count of finished sessions with matching `program_id`, not stored on the session row. Seed
sessions from Phase 2 have `program_slot_id = null`; from Phase 3 onward all sessions carry
a real `program_slot_id` and progression keys on that column.

**Machine personal-coefficient recompute is deferred to Phase 5.** `recomputeStat` returns
only `currentE1rm`; `logSet` preserves any existing `personal_coefficient` and
`coeff_confidence_n` untouched. Machine calibration (first-set anchor → personal coefficient)
is part of the P5 recommendation + swap + calibration layer.

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

## Build order

> Superseded by `SPEC.md`, which wins on conflicts. Current phase structure: P0 (backend, done),
> P1 (auth + PWA), P2 (keystone: active-session screen), P3 (program builder), P4 (progression
> view), P5 (recommendation + swap + calibration). See `docs/PLAN.md` for the sequence and status.
